import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";
import { renderTemplate, buildQrImageUrl, buildEntryUrl, buildTicketUrl, type RenderContext } from "./communication-constants";

type CompanionRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  seat_zone: string | null;
  seat_row: string | null;
  seat_number: string | null;
};
type TicketRow = { participant_id: string; companion_id: string | null; qr_token: string };

function formatSeat(c: { seat_zone: string | null; seat_row: string | null; seat_number: string | null }): string {
  const parts: string[] = [];
  if (c.seat_zone) parts.push(c.seat_zone);
  if (c.seat_row) parts.push(`Fila ${c.seat_row}`);
  if (c.seat_number) parts.push(`Asiento ${c.seat_number}`);
  return parts.join(" · ");
}

function buildCompanionsBlocks(
  companions: CompanionRow[],
  ticketByCompanion: Map<string, string>, // companion_id -> qr_token
): { text: string; html: string } {
  if (companions.length === 0) return { text: "", html: "" };
  const lines: string[] = [];
  const htmlItems: string[] = [];
  for (const c of companions) {
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Acompañante";
    const seat = formatSeat(c);
    const token = ticketByCompanion.get(c.id);
    const link = token ? buildTicketUrl(token) : "";
    const seatSuffix = seat ? ` — ${seat}` : "";
    lines.push(link ? `• ${name}${seatSuffix} — ${link}` : `• ${name}${seatSuffix}`);
    const safeName = escapeHtml(name);
    const safeSeat = seat ? ` — <span style="color:#555">${escapeHtml(seat)}</span>` : "";
    const linkHtml = link
      ? ` — <a href="${link}" style="color:#111;text-decoration:underline;">Ver entrada</a>`
      : "";
    htmlItems.push(`<li style="margin:4px 0;">${safeName}${safeSeat}${linkHtml}</li>`);
  }
  const html = `<div style="margin:16px 0;padding:12px 16px;background:#fafafa;border:1px solid #ececec;border-radius:8px;">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#666;margin-bottom:6px;">Acompañantes</div>
    <ul style="margin:0;padding-left:18px;font-size:14px;color:#1a1a1a;">${htmlItems.join("")}</ul>
  </div>`;
  return { text: `Acompañantes:\n${lines.join("\n")}`, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  from: z.string().max(200).optional(),
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
    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    type PartRow = {
      id: string;
      person_id: string;
      status: string;
      confirmation_token: string | null;
      people:
        | { first_name: string; last_name: string | null; email: string | null; phone: string | null }
        | null;
    };
    let participants: PartRow[] = [];
    try {
      if (data.participant_ids && data.participant_ids.length > 0) {
        // Chunk by 100 to keep the GET URL well under fetch limits.
        for (const ids of chunk(data.participant_ids, 100)) {
          const { data: rows, error } = await supabase
            .from("event_participants")
            .select("id, person_id, status, confirmation_token, people(first_name,last_name,email,phone)")
            .in("id", ids);
          if (error) throw new Error(error.message);
          participants = participants.concat((rows ?? []) as unknown as PartRow[]);
        }
      } else {
        let pq = supabase
          .from("event_participants")
          .select("id, person_id, status, confirmation_token, people(first_name,last_name,email,phone)")
          .eq("event_id", data.event_id);
        if (data.session_id) pq = pq.eq("session_id", data.session_id);
        const { data: rows, error } = await pq.limit(5000);
        if (error) throw new Error(error.message);
        participants = (rows ?? []) as unknown as PartRow[];
      }
    } catch (err) {
      throw new Error(`No se pudieron leer participantes: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!participants || participants.length === 0) {
      return { queued: 0, skipped_no_email: 0, skipped_no_ticket: 0, skipped_already: 0, errors: [] };
    }

    // 4. Map participants to tickets (active)
    const ids = participants.map((p) => p.id);
    const ticketMap = new Map<string, string>();          // participant_id -> titular qr_token
    const ticketByCompanion = new Map<string, string>();  // companion_id -> qr_token
    for (const idChunk of chunk(ids, 100)) {
      const { data: tickets } = await supabase
        .from("tickets")
        .select("participant_id, companion_id, qr_token")
        .in("participant_id", idChunk)
        .eq("revoked", false);
      for (const t of (tickets ?? []) as TicketRow[]) {
        if (t.companion_id) {
          if (!ticketByCompanion.has(t.companion_id)) ticketByCompanion.set(t.companion_id, t.qr_token);
        } else if (!ticketMap.has(t.participant_id)) {
          ticketMap.set(t.participant_id, t.qr_token);
        }
      }
    }

    // 4b. Load companions per participant
    const companionsByParticipant = new Map<string, CompanionRow[]>();
    for (const idChunk of chunk(ids, 100)) {
      const { data: comps } = await supabase
        .from("companions")
        .select("id, participant_id, first_name, last_name, seat_zone, seat_row, seat_number")
        .in("participant_id", idChunk)
        .order("created_at", { ascending: true });
      for (const c of (comps ?? []) as (CompanionRow & { participant_id: string })[]) {
        const arr = companionsByParticipant.get(c.participant_id) ?? [];
        arr.push(c);
        companionsByParticipant.set(c.participant_id, arr);
      }
    }

    // 5. Already queued / sent in this batch+template? Avoid duplicates.
    const alreadyKeys = new Set<string>();
    if (data.skip_already_queued) {
      for (const idChunk of chunk(ids, 100)) {
        let aq = supabase
          .from("communication_logs")
          .select("participant_id, status, template_id")
          .eq("template_id", data.template_id)
          .in("participant_id", idChunk)
          .in("status", ["pendiente", "programado", "enviado"]);
        if (data.batch_id) aq = aq.eq("batch_id", data.batch_id);
        const { data: existing } = await aq;
        for (const row of existing ?? []) {
          if (row.participant_id) alreadyKeys.add(row.participant_id);
        }
      }
    }

    let queued = 0;
    let skipped_no_email = 0;
    let skipped_no_ticket = 0;
    let skipped_already = 0;
    const errors: Array<{ participant_id: string; reason: string }> = [];

    const sessionStart = (session as { starts_at?: string } | null)?.starts_at;
    const sessionDateStr = sessionStart
      ? new Date(sessionStart).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })
      : "";
    const sessionTimeStr = sessionStart
      ? new Date(sessionStart).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
      : "";
    const doors = (session as { doors_open_at?: string } | null)?.doors_open_at;
    const accessTimeStr = doors
      ? new Date(doors).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
      : sessionTimeStr;
    const sessLoc = (session as { location_name?: string; location_address?: string } | null);
    const ubicacion =
      sessLoc?.location_name ?? event?.location_name ?? sessLoc?.location_address ?? event?.location_address ?? "";
    const direccion =
      sessLoc?.location_address ?? event?.location_address ?? "";

    for (const p of participants) {
      if (data.skip_already_queued && alreadyKeys.has(p.id)) {
        skipped_already++;
        continue;
      }
      const person = p.people as { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
      const email = person?.email ?? null;
      const phone = person?.phone ?? null;
      const isWhatsapp = template.channel === "whatsapp_business" || template.channel === "whatsapp_asistido";
      const ticketToken = ticketMap.get(p.id);
      const linkToken = p.confirmation_token ?? null;

      if (data.only_with_ticket && !ticketToken) {
        skipped_no_ticket++;
        continue;
      }
      if (data.only_with_email && !isWhatsapp && !email) {
        skipped_no_email++;
        continue;
      }
      if (isWhatsapp && !phone) {
        skipped_no_email++; // reused counter for "sin destinatario"
        continue;
      }

      const enlace = buildEntryUrl(linkToken);
      const compRows = companionsByParticipant.get(p.id) ?? [];
      const compBlocks = buildCompanionsBlocks(compRows, ticketByCompanion);
      const ctx: RenderContext = {
        nombre: person?.first_name ?? "",
        apellidos: person?.last_name ?? "",
        evento: event?.name ?? "",
        sesion: (session as { name?: string } | null)?.name ?? "",
        fecha: sessionDateStr,
        hora_acceso: accessTimeStr,
        ubicacion,
        direccion,
        enlace_entrada: enlace,
        enlace_confirmacion: enlace,
        qr: ticketToken ?? "",
        // En WhatsApp las imágenes no se renderizan inline, así que {{qr_image}}
        // debe apuntar al enlace limpio de la entrada (donde se ve el QR), no a
        // la URL externa de generación de QR.
        qr_image: isWhatsapp ? enlace : enlace ? buildQrImageUrl(enlace) : "",
        telefono: person?.phone ?? "",
        acompanantes: compBlocks.text,
        acompanantes_html: compBlocks.html,
      };

      const subject = template.subject ? renderTemplate(template.subject, ctx) : null;
      const body = renderTemplate(template.body, ctx);

      const recipient = isWhatsapp ? phone : email;
      const status: "pendiente" | "cancelado" = recipient ? "pendiente" : "cancelado";
      const errorMessage = recipient ? null : isWhatsapp ? "Sin teléfono" : "Sin email";

      try {
        const { error: insErr } = await supabase.from("communication_logs").insert({
          channel: template.channel,
          status,
          to_address: recipient,
          subject,
          body,
          template_id: template.id,
          participant_id: p.id,
          person_id: p.person_id,
          event_id: data.event_id,
          session_id: data.session_id ?? null,
          batch_id: data.batch_id ?? null,
          error_message: errorMessage,
          metadata: data.from ? { from: data.from } : {},
          created_by: userId,
        });
        if (insErr) throw new Error(insErr.message);
        if (recipient) queued++;
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

/**
 * Re-queues an invitation email for each participant, using the latest template
 * they were sent (or an explicit override). Re-renders with current person /
 * session data so the recipient gets up-to-date info.
 */
const resendInputSchema = z.object({
  participant_ids: z.array(z.string().uuid()).min(1).max(500),
  template_id: z.string().uuid().optional(),
  from: z.string().max(200).optional(),
});

export const resendInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => resendInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);

    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    // 1) Load participants with related person/event/session.
    type PartRow = {
      id: string;
      person_id: string;
      event_id: string;
      session_id: string;
      confirmation_token: string | null;
      people:
        | { first_name: string; last_name: string | null; email: string | null; phone: string | null }
        | null;
      events: { name: string; location_name: string | null; location_address: string | null } | null;
      event_sessions:
        | {
            name: string;
            starts_at: string;
            doors_open_at: string | null;
            location_name: string | null;
            location_address: string | null;
          }
        | null;
    };

    const participants: PartRow[] = [];
    for (const ids of chunk(data.participant_ids, 100)) {
      const { data: rows, error } = await supabase
        .from("event_participants")
        .select(
          "id, person_id, event_id, session_id, confirmation_token, people(first_name,last_name,email,phone), events(name,location_name,location_address), event_sessions(name,starts_at,doors_open_at,location_name,location_address)",
        )
        .in("id", ids);
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as unknown as PartRow[]) participants.push(r);
    }
    if (participants.length === 0) {
      return { queued: 0, skipped_no_email: 0, skipped_no_template: 0, errors: [] as Array<{ participant_id: string; reason: string }> };
    }

    // 2) Resolve template per participant.
    let overrideTemplate:
      | { id: string; subject: string | null; body: string; channel: string }
      | null = null;
    if (data.template_id) {
      const { data: t, error: tErr } = await supabase
        .from("communication_templates")
        .select("id, subject, body, channel")
        .eq("id", data.template_id)
        .single();
      if (tErr || !t) throw new Error("Plantilla no encontrada");
      overrideTemplate = t;
    }

    // Latest template per participant (from prior email logs with a template).
    const templateIdByParticipant = new Map<string, string>();
    if (!overrideTemplate) {
      for (const ids of chunk(participants.map((p) => p.id), 100)) {
        const { data: logs } = await supabase
          .from("communication_logs")
          .select("participant_id, template_id, created_at")
          .eq("channel", "email")
          .in("participant_id", ids)
          .not("template_id", "is", null)
          .order("created_at", { ascending: false });
        for (const row of logs ?? []) {
          if (!row.participant_id || !row.template_id) continue;
          if (!templateIdByParticipant.has(row.participant_id)) {
            templateIdByParticipant.set(row.participant_id, row.template_id);
          }
        }
      }
    }

    // Load all needed templates in one call.
    const neededTemplateIds = Array.from(
      new Set(
        overrideTemplate
          ? [overrideTemplate.id]
          : [...templateIdByParticipant.values()],
      ),
    );
    const templatesById = new Map<
      string,
      { id: string; subject: string | null; body: string; channel: string }
    >();
    if (overrideTemplate) templatesById.set(overrideTemplate.id, overrideTemplate);
    else if (neededTemplateIds.length > 0) {
      const { data: tpls } = await supabase
        .from("communication_templates")
        .select("id, subject, body, channel")
        .in("id", neededTemplateIds);
      for (const t of tpls ?? []) templatesById.set(t.id, t);
    }

    // 3) Tickets per participant (active).
    const ticketMap = new Map<string, string>();
    const ticketByCompanion = new Map<string, string>();
    for (const ids of chunk(participants.map((p) => p.id), 100)) {
      const { data: tickets } = await supabase
        .from("tickets")
        .select("participant_id, companion_id, qr_token")
        .in("participant_id", ids)
        .eq("revoked", false);
      for (const t of (tickets ?? []) as TicketRow[]) {
        if (t.companion_id) {
          if (!ticketByCompanion.has(t.companion_id)) ticketByCompanion.set(t.companion_id, t.qr_token);
        } else if (!ticketMap.has(t.participant_id)) {
          ticketMap.set(t.participant_id, t.qr_token);
        }
      }
    }

    // 3b) Companions per participant
    const companionsByParticipant = new Map<string, CompanionRow[]>();
    for (const ids of chunk(participants.map((p) => p.id), 100)) {
      const { data: comps } = await supabase
        .from("companions")
        .select("id, participant_id, first_name, last_name, seat_zone, seat_row, seat_number")
        .in("participant_id", ids)
        .order("created_at", { ascending: true });
      for (const c of (comps ?? []) as (CompanionRow & { participant_id: string })[]) {
        const arr = companionsByParticipant.get(c.participant_id) ?? [];
        arr.push(c);
        companionsByParticipant.set(c.participant_id, arr);
      }
    }

    let queued = 0;
    let skipped_no_email = 0;
    let skipped_no_template = 0;
    const errors: Array<{ participant_id: string; reason: string }> = [];

    for (const p of participants) {
      const person = p.people;
      const email = person?.email ?? null;
      if (!email) {
        skipped_no_email++;
        continue;
      }

      const templateId = overrideTemplate?.id ?? templateIdByParticipant.get(p.id);
      const template = templateId ? templatesById.get(templateId) : undefined;
      if (!template) {
        skipped_no_template++;
        errors.push({ participant_id: p.id, reason: "Sin plantilla previa" });
        continue;
      }

      const sess = p.event_sessions;
      const sessionStart = sess?.starts_at;
      const sessionDateStr = sessionStart
        ? new Date(sessionStart).toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })
        : "";
      const sessionTimeStr = sessionStart
        ? new Date(sessionStart).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
        : "";
      const doors = sess?.doors_open_at;
      const accessTimeStr = doors
        ? new Date(doors).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })
        : sessionTimeStr;
      const ubicacion =
        sess?.location_name ??
        p.events?.location_name ??
        sess?.location_address ??
        p.events?.location_address ??
        "";
      const direccion =
        sess?.location_address ?? p.events?.location_address ?? "";

      const ticketToken = ticketMap.get(p.id);
      const linkToken = p.confirmation_token;
      const enlace = buildEntryUrl(linkToken);
      const compRows = companionsByParticipant.get(p.id) ?? [];
      const compBlocks = buildCompanionsBlocks(compRows, ticketByCompanion);
      const ctx: RenderContext = {
        nombre: person?.first_name ?? "",
        apellidos: person?.last_name ?? "",
        evento: p.events?.name ?? "",
        sesion: sess?.name ?? "",
        fecha: sessionDateStr,
        hora_acceso: accessTimeStr,
        ubicacion,
        direccion,
        enlace_entrada: enlace,
        enlace_confirmacion: enlace,
        qr: ticketToken ?? "",
        qr_image: enlace ? buildQrImageUrl(enlace) : "",
        telefono: person?.phone ?? "",
        acompanantes: compBlocks.text,
        acompanantes_html: compBlocks.html,
      };

      const subject = template.subject ? renderTemplate(template.subject, ctx) : null;
      const body = renderTemplate(template.body, ctx);

      try {
        const { error: insErr } = await supabase.from("communication_logs").insert({
          channel: "email",
          status: "pendiente",
          to_address: email,
          subject,
          body,
          template_id: template.id,
          participant_id: p.id,
          person_id: p.person_id,
          event_id: p.event_id,
          session_id: p.session_id,
          error_message: null,
          metadata: { resend: true, ...(data.from ? { from: data.from } : {}) },
          created_by: userId,
        });
        if (insErr) throw new Error(insErr.message);
        queued++;
      } catch (err) {
        errors.push({ participant_id: p.id, reason: err instanceof Error ? err.message : "error" });
      }
    }

    return { queued, skipped_no_email, skipped_no_template, errors };
  });
