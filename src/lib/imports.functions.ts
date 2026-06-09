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

    for (const row of data.rows) {
      try {
        // Find existing person by available identifiers (DNI/email/phone).
        const orParts: string[] = [];
        if (row.dni) orParts.push(`dni.eq.${row.dni}`);
        if (row.email) orParts.push(`email.eq.${row.email}`);
        if (row.phone) orParts.push(`phone.eq.${row.phone}`);
        let existing: { id: string } | null = null;
        if (orParts.length > 0) {
          const { data: matches } = await supabase
            .from("people")
            .select("id")
            .or(orParts.join(","))
            .limit(1);
          existing = matches?.[0] ?? null;
        }

        let personId: string;
        if (existing) {
          if (data.duplicateStrategy === "skip") {
            // Skip unless they have no participation in this session
            const { data: alreadyHere } = await supabase
              .from("event_participants")
              .select("id")
              .eq("person_id", existing.id)
              .eq("session_id", data.sessionId)
              .maybeSingle();
            if (alreadyHere) {
              skipped++;
              continue;
            }
            personId = existing.id;
          } else if (data.duplicateStrategy === "update_person") {
            await supabase
              .from("people")
              .update({
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
              })
              .eq("id", existing.id);
            personId = existing.id;
            updated++;
          } else {
            personId = existing.id;
          }
        } else {
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
          personId = created.id;
        }

        // Skip duplicate participation in same session unless strategy allows
        const { data: dupPart } = await supabase
          .from("event_participants")
          .select("id")
          .eq("person_id", personId)
          .eq("session_id", data.sessionId)
          .maybeSingle();
        if (dupPart && data.duplicateStrategy !== "new_participation") {
          // Update person's contact data (name, last_name, email, phone) when
          // strategy allows it, keeping the existing participation, ticket/QR
          // and current status intact.
          if (data.duplicateStrategy === "update_person") {
            await supabase
              .from("people")
              .update({
                first_name: row.first_name,
                last_name: row.last_name ?? null,
                email: row.email ?? null,
                phone: row.phone ?? null,
              })
              .eq("id", personId);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

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
          })
          .select("id")
          .single();
        if (partErr) throw new Error(`No se pudo crear la participación (${partErr.message})`);

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