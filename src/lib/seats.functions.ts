import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const rowSchema = z.object({
  email: z.string().trim().email().optional().nullable(),
  dni: z.string().trim().max(20).optional().nullable(),
  tipo: z.enum(["titular", "acompanante"]).optional().nullable(),
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
    const participantIds: string[] = [];
    for (const p of participants ?? []) {
      const person = p.people as { email: string | null; dni: string | null } | null;
      if (person?.email) emailMap.set(person.email.toLowerCase(), p.id);
      if (person?.dni) dniMap.set(person.dni.toUpperCase(), p.id);
      participantIds.push(p.id);
    }

    // Companions for the same event
    const compEmailMap = new Map<string, string>();
    const compDniMap = new Map<string, string>();
    if (participantIds.length > 0) {
      const { data: comps, error: cErr } = await supabaseAdmin
        .from("companions")
        .select("id, participant_id, email, dni")
        .in("participant_id", participantIds);
      if (cErr) throw new Error(cErr.message);
      for (const c of comps ?? []) {
        if (c.email) compEmailMap.set(c.email.toLowerCase(), c.id);
        if (c.dni) compDniMap.set(c.dni.toUpperCase(), c.id);
      }
    }

    const results = {
      updated: 0,
      updated_titulares: 0,
      updated_acompanantes: 0,
      skipped: 0,
      errors: [] as string[],
    };
    for (const row of data.rows) {
      const wantsCompanion = row.tipo === "acompanante";
      let companionId: string | undefined;
      let participantId: string | undefined;
      if (wantsCompanion) {
        if (row.email) companionId = compEmailMap.get(row.email.toLowerCase());
        if (!companionId && row.dni) companionId = compDniMap.get(row.dni.toUpperCase());
      } else {
        if (row.email) participantId = emailMap.get(row.email.toLowerCase());
        if (!participantId && row.dni) participantId = dniMap.get(row.dni.toUpperCase());
        // If tipo not set, fall back to companion lookup
        if (!row.tipo && !participantId) {
          if (row.email) companionId = compEmailMap.get(row.email.toLowerCase());
          if (!companionId && row.dni) companionId = compDniMap.get(row.dni.toUpperCase());
        }
      }
      if (!participantId && !companionId) {
        results.skipped++;
        results.errors.push(`No encontrado: ${row.email ?? row.dni ?? "(sin id)"}`);
        continue;
      }
      const patch = {
        seat_zone: row.seat_zone || null,
        seat_row: row.seat_row || null,
        seat_number: row.seat_number || null,
      };
      if (companionId) {
        const { error: upErr } = await supabaseAdmin
          .from("companions")
          .update(patch as never)
          .eq("id", companionId);
        if (upErr) results.errors.push(`${row.email ?? row.dni}: ${upErr.message}`);
        else { results.updated_acompanantes++; results.updated++; }
      } else if (participantId) {
        const { error: upErr } = await supabaseAdmin
          .from("event_participants")
          .update(patch as never)
          .eq("id", participantId);
        if (upErr) results.errors.push(`${row.email ?? row.dni}: ${upErr.message}`);
        else { results.updated_titulares++; results.updated++; }
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "seats.bulk_assign",
      entity_type: "event_participants",
      event_id: data.event_id,
      session_id: data.session_id ?? null,
      actor_id: context.userId,
      changes: {
        total: data.rows.length,
        updated: results.updated,
        updated_titulares: results.updated_titulares,
        updated_acompanantes: results.updated_acompanantes,
        skipped: results.skipped,
      },
    } as never);

    return results;
  });