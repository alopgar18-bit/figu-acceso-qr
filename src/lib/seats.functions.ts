import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const rowSchema = z.object({
  email: z.string().trim().email().optional().nullable(),
  dni: z.string().trim().max(20).optional().nullable(),
  seat_zone: z.string().trim().max(40).optional().nullable(),
  seat_row: z.string().trim().max(20).optional().nullable(),
  seat_number: z.string().trim().max(20).optional().nullable(),
});

export const bulkAssignSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        event_id: z.string().uuid(),
        session_id: z.string().uuid().nullable().optional(),
        rows: z.array(rowSchema).min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch all participants for the event with their person details
    let q = supabaseAdmin
      .from("event_participants")
      .select("id, session_id, person_id, people(email, dni)")
      .eq("event_id", data.event_id);
    if (data.session_id) q = q.eq("session_id", data.session_id);
    const { data: participants, error } = await q;
    if (error) throw new Error(error.message);

    const emailMap = new Map<string, string>();
    const dniMap = new Map<string, string>();
    for (const p of participants ?? []) {
      const person = p.people as { email: string | null; dni: string | null } | null;
      if (person?.email) emailMap.set(person.email.toLowerCase(), p.id);
      if (person?.dni) dniMap.set(person.dni.toUpperCase(), p.id);
    }

    const results = { updated: 0, skipped: 0, errors: [] as string[] };
    for (const row of data.rows) {
      let participantId: string | undefined;
      if (row.email) participantId = emailMap.get(row.email.toLowerCase());
      if (!participantId && row.dni) participantId = dniMap.get(row.dni.toUpperCase());
      if (!participantId) {
        results.skipped++;
        results.errors.push(`No encontrado: ${row.email ?? row.dni ?? "(sin id)"}`);
        continue;
      }
      const { error: upErr } = await supabaseAdmin
        .from("event_participants")
        .update({
          seat_zone: row.seat_zone || null,
          seat_row: row.seat_row || null,
          seat_number: row.seat_number || null,
        } as never)
        .eq("id", participantId);
      if (upErr) {
        results.errors.push(`${row.email ?? row.dni}: ${upErr.message}`);
      } else {
        results.updated++;
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "seats.bulk_assign",
      entity_type: "event_participants",
      event_id: data.event_id,
      session_id: data.session_id ?? null,
      actor_id: context.userId,
      changes: { total: data.rows.length, updated: results.updated, skipped: results.skipped },
    } as never);

    return results;
  });