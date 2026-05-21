import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";
import { renderTemplate, type RenderContext } from "./communication-constants";

const inputSchema = z.object({
  event_id: z.string().uuid(),
  session_id: z.string().uuid().optional(),
  batch_id: z.string().uuid().optional(),
  template_id: z.string().uuid(),
  // Optional explicit participant list. If omitted, queue every participant of session.
  participant_ids: z.array(z.string().uuid()).max(2000).optional(),
  only_with_email: z.boolean().default(true),
  only_with_ticket: z.boolean().default(true),
  skip_already_queued: z.boolean().default(true),
});

/**
 * Builds a queue of pending communication_logs for the chosen participants.
 * Does NOT actually send emails — Gmail integration is a separate step.
 * Each log has status = "pendiente" with subject and body already rendered per recipient.
 */
export const queueBulkInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);

    // 1. Load template
    const { data: template, error: tErr } = await supabase
      .from("communication_templates")
      .select("*")
      .eq("id", data.template_id)
      .single();
    if (tErr || !template) throw new Error("Plantilla no encontrada");

    // 2. Load event + session metadata
    const { data: event } = await supabase
      .from("events")
      .select("id, name, location_name, location_address")
      .eq("id", data.event_id)
      .single();
    const { data: session } = data.session_id
      ? await supabase
          .from("event_sessions")
          .select("id, name, starts_at, doors_open_at, location_name, location_address")
          .eq("id", data.session_id)
          .single()
      : { data: null };

    // 3. Resolve participants
    let pq = supabase
      .from("event_participants")
      .select("id, person_id, status, people(first_name,last_name,email,phone)")
      .eq("event_id", data.event_id);
    if (data.session_id) pq = pq.eq("session_id", data.session_id);
    if (data.participant_ids && data.participant_ids.length > 0) {
      pq = pq.in("id", data.participant_ids);
    }
    const { data: participants, error: pErr } = await pq.limit(5000);
    if (pErr) throw new Error(`No se pudieron leer participantes: ${pErr.message}`);
    if (!participants || participants.length === 0) {
      return { queued: 0, skipped_no_email: 0, skipped_no_ticket: 0, skipped_already: 0, errors: [] };
    }

    // 4. Map participants to tickets (active)
    const ids = participants.map((p) => p.id);
    const { data: tickets } = await supabase
      .from("tickets")
      .select("participant_id, qr_token")
      .in("participant_id", ids)
      .eq("revoked", false);
    const ticketMap = new Map<string, string>();
    for (const t of tickets ?? []) {
      if (!ticketMap.has(t.participant_id)) ticketMap.set(t.participant_id, t.qr_token);
    }

    // 5. Already queued / sent in this batch+template? Avoid duplicates.
    const alreadyKeys = new Set<string>();
    if (data.skip_already_queued) {
      let aq = supabase
        .from("communication_logs")
        .select("participant_id, status, template_id")
        .eq("template_id", data.template_id)
        .in("participant_id", ids)
        .in("status", ["pendiente", "programado", "enviado"]);
      if (data.batch_id) aq = aq.eq("batch_id", data.batch_id);
      const { data: existing } = await aq;
      for (const row of existing ?? []) {
        if (row.participant_id) alreadyKeys.add(row.participant_id);
      }
    }

    let queued = 0;
    let skipped_no_email = 0;
    let skipped_no_ticket = 0;
    let skipped_already = 0;
    const errors: Array<{ participant_id: string; reason: string }> = [];

    const sessionStart = (session as { starts_at?: string } | null)?.starts_at;
    const sessionDateStr = sessionStart
      ? new Date(sessionStart).toLocaleDateString("es-ES")
      : "";
    const sessionTimeStr = sessionStart
      ? new Date(sessionStart).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      : "";
    const doors = (session as { doors_open_at?: string } | null)?.doors_open_at;
    const accessTimeStr = doors
      ? new Date(doors).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      : sessionTimeStr;
    const sessLoc = (session as { location_name?: string; location_address?: string } | null);
    const ubicacion =
      sessLoc?.location_name ?? event?.location_name ?? sessLoc?.location_address ?? event?.location_address ?? "";

    const baseUrl = process.env.PUBLIC_SITE_URL ?? "";

    for (const p of participants) {
      if (data.skip_already_queued && alreadyKeys.has(p.id)) {
        skipped_already++;
        continue;
      }
      const person = p.people as { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
      const email = person?.email ?? null;
      const token = ticketMap.get(p.id);

      if (data.only_with_ticket && !token) {
        skipped_no_ticket++;
        continue;
      }
      if (data.only_with_email && !email) {
        skipped_no_email++;
        continue;
      }

      const enlace = token ? `${baseUrl}/c/${token}/entrada` : "";
      const ctx: RenderContext = {
        nombre: person?.first_name ?? "",
        apellidos: person?.last_name ?? "",
        evento: event?.name ?? "",
        sesion: (session as { name?: string } | null)?.name ?? "",
        fecha: sessionDateStr,
        hora_acceso: accessTimeStr,
        ubicacion,
        enlace_entrada: enlace,
        enlace_confirmacion: enlace,
        qr: token ?? "",
        telefono: person?.phone ?? "",
      };

      const subject = template.subject ? renderTemplate(template.subject, ctx) : null;
      const body = renderTemplate(template.body, ctx);

      const status: "pendiente" | "cancelado" = email ? "pendiente" : "cancelado";
      const errorMessage = email ? null : "Sin email";

      try {
        const { error: insErr } = await supabase.from("communication_logs").insert({
          channel: template.channel,
          status,
          to_address: email,
          subject,
          body,
          template_id: template.id,
          participant_id: p.id,
          person_id: p.person_id,
          event_id: data.event_id,
          session_id: data.session_id ?? null,
          batch_id: data.batch_id ?? null,
          error_message: errorMessage,
          created_by: userId,
        });
        if (insErr) throw new Error(insErr.message);
        if (email) queued++;
        else skipped_no_email++;
      } catch (err) {
        errors.push({ participant_id: p.id, reason: err instanceof Error ? err.message : "error" });
      }
    }

    return { queued, skipped_no_email, skipped_no_ticket, skipped_already, errors };
  });

/**
 * Cleans DNI values that look like timestamps (date-like strings) by setting them to NULL.
 * Safe: never deletes rows. Only touches people imported via the given batch.
 */
export const cleanDniTimestamps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ batch_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, ["superadmin", "admin_figurarte"]);

    const { data: batch } = await supabase
      .from("import_batches")
      .select("session_id, event_id")
      .eq("id", data.batch_id)
      .single();
    if (!batch?.session_id) throw new Error("Batch sin sesión");

    const { data: parts } = await supabase
      .from("event_participants")
      .select("person_id")
      .eq("session_id", batch.session_id)
      .limit(5000);
    const personIds = Array.from(new Set((parts ?? []).map((p) => p.person_id)));
    if (personIds.length === 0) return { cleaned: 0 };

    const { data: people } = await supabase
      .from("people")
      .select("id, dni")
      .in("id", personIds);

    // Match anything containing "/" or "-" with year-like or hh:mm patterns.
    const dateLike = /(\d{4}[-/]\d{1,2}[-/]\d{1,2})|(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|(\d{1,2}:\d{2})/;
    const toClean = (people ?? []).filter((p) => p.dni && dateLike.test(p.dni));
    let cleaned = 0;
    for (const p of toClean) {
      const { error } = await supabase.from("people").update({ dni: null }).eq("id", p.id);
      if (!error) cleaned++;
    }
    return { cleaned };
  });

/**
 * Marks a pending/failed log as ready for retry.
 */
export const retryCommunication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ log_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const { error } = await supabase
      .from("communication_logs")
      .update({ status: "pendiente", error_message: null, sent_at: null })
      .eq("id", data.log_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
