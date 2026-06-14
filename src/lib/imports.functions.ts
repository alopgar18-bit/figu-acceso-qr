import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const rowSchema = z.object({
  rowIndex: z.number().int().min(0),
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().max(150).optional().nullable(),
  dni: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  province: z.string().trim().max(120).optional().nullable(),
  gender: z.string().trim().max(40).optional().nullable(),
  profession: z.string().trim().max(150).optional().nullable(),
  photo_url: z.string().trim().max(500).optional().nullable(),
  instagram: z.string().trim().max(150).optional().nullable(),
  tiktok: z.string().trim().max(150).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  attendee_type: z.enum(["publico","figurante","casting","vip","prensa","equipo","acompanante","otro"]).optional(),
  initial_status: z
    .enum([
      "pendiente_revision",
      "lista_espera",
      "rechazado",
      "aceptado_pendiente_envio",
      "invitacion_enviada",
      "confirmado",
      "acceso_validado",
    ])
    .optional(),
  companions_count: z.number().int().min(0).max(20).optional(),
  seat_zone: z.string().trim().max(40).optional().nullable(),
  seat_row: z.string().trim().max(20).optional().nullable(),
  seat_number: z.string().trim().max(20).optional().nullable(),
});

const commitSchema = z.object({
  filename: z.string().min(1).max(255),
  source: z.string().max(120).optional().nullable(),
  eventId: z.string().uuid(),
  sessionId: z.string().uuid(),
  defaultStatus: z.enum([
    "pendiente_revision",
    "lista_espera",
    "rechazado",
    "aceptado_pendiente_envio",
    "invitacion_enviada",
    "confirmado",
    "acceso_validado",
  ]),
  defaultAttendeeType: z
    .enum(["publico","figurante","casting","vip","prensa","equipo","acompanante","otro"])
    .default("publico"),
  duplicateStrategy: z.enum(["skip","update_person","new_participation"]),
  mappings: z.array(
    z.object({ source_column: z.string().min(1).max(200), target_field: z.string().min(1).max(80), transform: z.string().max(120).nullable().optional() })
  ).max(60),
  rows: z.array(rowSchema).min(1).max(5000),
});

function genToken(): string {
  // 32-char URL-safe token
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => commitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const actorEmail = (claims as { email?: string } | undefined)?.email ?? null;

    // 1. Create batch
    const { data: batch, error: batchErr } = await supabase
      .from("import_batches")
      .insert({
        filename: data.filename,
        source: data.source ?? null,
        event_id: data.eventId,
        session_id: data.sessionId,
        total_rows: data.rows.length,
        status: "procesando",
        created_by: userId,
      })
      .select()
      .single();
    if (batchErr) throw new Error(`No se pudo crear el batch: ${batchErr.message}`);

    // 2. Save mappings
    if (data.mappings.length > 0) {
      await supabase.from("import_mappings").insert(
        data.mappings.map((m) => ({
          batch_id: batch.id,
          source_column: m.source_column,
          target_field: m.target_field,
          transform: m.transform ?? null,
        })),
      );
    }

    const QR_STATES = new Set([
      "aceptado_pendiente_envio",
      "invitacion_enviada",
      "confirmado",
      "acceso_validado",
    ]);
    let imported = 0;
    let qrGenerated = 0;
    let noContactChannel = 0;
    let skipped = 0;
    let updated = 0;
    let errored = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    // Duplicate detection rule: a row is a duplicate ONLY when first_name +
    // last_name (normalized) match an existing participation in the SAME
    // session. Email / phone collisions are ignored on purpose — it is common
    // for several people in a group to share contact details.
    const normalize = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
    const nameKey = (first: string | null | undefined, last: string | null | undefined) =>
      `${normalize(first)}|${normalize(last)}`;

    const { data: sessionRoster } = await supabase
      .from("event_participants")
      .select("id, person_id, people:person_id(first_name, last_name)")
      .eq("session_id", data.sessionId);
    const nameToPersonId = new Map<string, string>();
    for (const ep of sessionRoster ?? []) {
      const ppl = ep.people as { first_name?: string | null; last_name?: string | null } | null;
      if (!ppl) continue;
      nameToPersonId.set(nameKey(ppl.first_name, ppl.last_name), ep.person_id as string);
    }

    for (const row of data.rows) {
      try {
        const key = nameKey(row.first_name, row.last_name);
        const existingPersonId = nameToPersonId.get(key);

        if (existingPersonId) {
          // Duplicate (same name in same session): keep ticket/QR/status,
          // only refresh contact details on the people row.
          if (data.duplicateStrategy === "skip") {
            skipped++;
            continue;
          }
          await supabase
            .from("people")
            .update({
              first_name: row.first_name,
              last_name: row.last_name ?? null,
              email: row.email ?? null,
              phone: row.phone ?? null,
            })
            .eq("id", existingPersonId);
          // Re-tag the existing participation with the current batch so it
          // appears when filtering "Ver solicitudes" by this import.
          await supabase
            .from("event_participants")
            .update({
              import_batch_id: batch.id,
              seat_zone: row.seat_zone?.trim() || null,
              seat_row: row.seat_row?.trim() || null,
              seat_number: row.seat_number?.trim() || null,
            })
            .eq("session_id", data.sessionId)
            .eq("person_id", existingPersonId);
          updated++;
          continue;
        }

        // Not a duplicate → always create a brand-new person. Email or phone
        // collisions with other people are allowed on purpose.
        const { data: created, error: pErr } = await supabase
            .from("people")
            .insert({
              first_name: row.first_name,
              last_name: row.last_name ?? null,
              dni: row.dni ?? null,
              email: row.email ?? null,
              phone: row.phone ?? null,
              birth_date: row.birth_date ?? null,
              city: row.city ?? null,
              province: row.province ?? null,
              gender: row.gender ?? null,
              notes: row.notes ?? null,
              source: data.source ?? `import:${data.filename}`,
              created_by: userId,
            })
            .select("id")
            .single();
        if (pErr) throw new Error(`No se pudo crear la persona (${pErr.message})`);
        const personId = created.id;

        const status = row.initial_status ?? data.defaultStatus;
        const approvedLike = status !== "pendiente_revision" && status !== "lista_espera" && status !== "rechazado";
        const attendeeType = row.attendee_type ?? data.defaultAttendeeType;

        const { data: participant, error: partErr } = await supabase
          .from("event_participants")
          .insert({
            event_id: data.eventId,
            session_id: data.sessionId,
            person_id: personId,
            status,
            attendee_type: attendeeType,
            companions_count: row.companions_count ?? 0,
            approved_by: approvedLike ? userId : null,
            approved_at: approvedLike ? new Date().toISOString() : null,
            confirmed_at: status === "confirmado" || status === "acceso_validado" ? new Date().toISOString() : null,
            import_batch_id: batch.id,
            seat_zone: row.seat_zone ?? null,
            seat_row: row.seat_row ?? null,
            seat_number: row.seat_number ?? null,
          })
          .select("id")
          .single();
        if (partErr) {
          throw new Error(`No se pudo crear la participación (${partErr.message})`);
        }
        // Register so subsequent rows in the same file with the same name
        // are treated as duplicates instead of creating another person.
        nameToPersonId.set(key, personId);

        // Generate ticket/QR only for statuses that need one ready to send.
        if (QR_STATES.has(status)) {
          const token = genToken();
          const { data: ticket, error: tErr } = await supabase.from("tickets").insert({
            event_id: data.eventId,
            session_id: data.sessionId,
            participant_id: participant.id,
            qr_token: token,
            qr_payload: {
              token,
              event_id: data.eventId,
              session_id: data.sessionId,
              participant_id: participant.id,
            },
          }).select("id").single();
          if (tErr) throw new Error(`No se pudo crear el ticket (${tErr.message})`);
          qrGenerated++;

          // For acceso_validado, register the check-in with the ticket marked as used.
          if (status === "acceso_validado") {
            await supabase.from("checkins").insert({
              event_id: data.eventId,
              session_id: data.sessionId,
              participant_id: participant.id,
              ticket_id: ticket?.id ?? null,
              validator_id: userId,
              result: "ok",
              companions_validated: row.companions_count ?? 0,
              notes: "Check-in registrado durante importación",
            });
          }

          // Track contact channel availability for mass sending follow-ups.
          if (!row.email && !row.phone) noContactChannel++;
        }

        imported++;
      } catch (err) {
        errored++;
        errors.push({ row: row.rowIndex, reason: err instanceof Error ? err.message : "error" });
      }
    }

    const { data: finalBatch } = await supabase
      .from("import_batches")
      .update({
        imported_rows: imported,
        error_rows: errored,
        errors: errors.slice(0, 200),
        status: errored > 0 && imported === 0
          ? "fallida"
          : errored > 0
          ? "completada_con_errores"
          : "completada",
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id)
      .select()
      .single();

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_email: actorEmail,
      action: "import.commit",
      entity_type: "import_batch",
      entity_id: batch.id,
      event_id: data.eventId,
      session_id: data.sessionId,
      changes: {
        filename: data.filename,
        total_rows: data.rows.length,
        imported,
        skipped,
        updated,
        errored,
        qr_generated: qrGenerated,
        no_contact_channel: noContactChannel,
        default_status: data.defaultStatus,
        duplicate_strategy: data.duplicateStrategy,
      },
    });

    return {
      batchId: batch.id,
      total: data.rows.length,
      imported,
      skipped,
      updated,
      errored,
      qrGenerated,
      noContactChannel,
      errors,
      finalStatus: finalBatch?.status ?? "completada",
    };
  });