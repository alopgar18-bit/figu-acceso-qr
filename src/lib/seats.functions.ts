import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const rowSchema = z.object({
  email: z.string().trim().optional().nullable(),
  dni: z.string().trim().optional().nullable(),
  tipo: z.enum(["titular", "acompanante"]).optional().nullable(),
  first_name: z.string().trim().optional().nullable(),
  last_name: z.string().trim().optional().nullable(),
  titular_full_name: z.string().trim().optional().nullable(),
  session_name: z.string().trim().optional().nullable(),
  seat_zone: z.string().trim().optional().nullable(),
  seat_row: z.string().trim().optional().nullable(),
  seat_number: z.string().trim().optional().nullable(),
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

    const norm = (s: string | null | undefined) =>
      (s ?? "").toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
    const nameKey = (f: string | null | undefined, l: string | null | undefined) => `${norm(f)}|${norm(l)}`;
    const fullNameKey = (s: string | null | undefined) => {
      const cleaned = norm(s);
      if (!cleaned) return "";
      // Heurística: primer token = nombre, resto = apellidos
      const parts = cleaned.split(" ");
      const first = parts.shift() ?? "";
      return `${first}|${parts.join(" ")}`;
    };

    // Session-name → id map (to scope name matches per session when the row says so)
    const { data: sessRows } = await supabaseAdmin
      .from("event_sessions")
      .select("id, name")
      .eq("event_id", data.event_id);
    const sessionByName = new Map<string, string>();
    for (const s of sessRows ?? []) {
      if (s.name) sessionByName.set(norm(s.name), s.id);
    }

    // Fetch all participants for the event with their person details
    let q = supabaseAdmin
      .from("event_participants")
      .select("id, session_id, person_id, people(email, dni, first_name, last_name)")
      .eq("event_id", data.event_id);
    if (data.session_id) q = q.eq("session_id", data.session_id);
    const { data: participants, error } = await q;
    if (error) throw new Error(error.message);

    const emailMap = new Map<string, string>();
    const dniMap = new Map<string, string>();
    // name keys: "first|last" and scoped "first|last::sessionId"
    const titularNameMap = new Map<string, string>();
    // participantId → name key (for companion scoping)
    const titularKeyOf = new Map<string, string>();
    // participantId → sessionId
    const titularSession = new Map<string, string>();
    const participantIds: string[] = [];
    for (const p of participants ?? []) {
      const person = p.people as {
        email: string | null; dni: string | null;
        first_name: string | null; last_name: string | null;
      } | null;
      if (person?.email) emailMap.set(person.email.toLowerCase(), p.id);
      if (person?.dni) dniMap.set(person.dni.toUpperCase(), p.id);
      if (person?.first_name) {
        const k = nameKey(person.first_name, person.last_name);
        titularNameMap.set(k, p.id);
        titularNameMap.set(`${k}::${p.session_id}`, p.id);
        titularKeyOf.set(p.id, k);
        titularSession.set(p.id, p.session_id as string);
      }
      participantIds.push(p.id);
    }

    // Companions for the same event
    const compEmailMap = new Map<string, string>();
    const compDniMap = new Map<string, string>();
    // key: "compFirst|compLast" OR "titularKey::compFirst|compLast" OR scoped per session
    const compNameMap = new Map<string, string>();
    if (participantIds.length > 0) {
      const { data: comps, error: cErr } = await supabaseAdmin
        .from("companions")
        .select("id, participant_id, email, dni, first_name, last_name")
        .in("participant_id", participantIds);
      if (cErr) throw new Error(cErr.message);
      for (const c of comps ?? []) {
        if (c.email) compEmailMap.set(c.email.toLowerCase(), c.id);
        if (c.dni) compDniMap.set(c.dni.toUpperCase(), c.id);
        if (c.first_name) {
          const k = nameKey(c.first_name, c.last_name);
          // Plain (last write wins for collisions — titular scoping below disambiguates)
          compNameMap.set(k, c.id);
          const tKey = titularKeyOf.get(c.participant_id);
          const sId = titularSession.get(c.participant_id);
          if (tKey) compNameMap.set(`${tKey}::${k}`, c.id);
          if (sId) compNameMap.set(`${k}::${sId}`, c.id);
          if (tKey && sId) compNameMap.set(`${tKey}::${k}::${sId}`, c.id);
        }
      }
    }

    // Importing replaces the current seating plan for the selected scope.
    for (let i = 0; i < participantIds.length; i += 300) {
      const chunk = participantIds.slice(i, i + 300);
      const clearPatch = { seat_zone: null, seat_row: null, seat_number: null };
      const { error: pClearErr } = await supabaseAdmin
        .from("event_participants")
        .update(clearPatch as never)
        .in("id", chunk);
      if (pClearErr) throw new Error(pClearErr.message);
      const { error: cClearErr } = await supabaseAdmin
        .from("companions")
        .update(clearPatch as never)
        .in("participant_id", chunk);
      if (cClearErr) throw new Error(cClearErr.message);
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
      const rowSessionId = row.session_name ? sessionByName.get(norm(row.session_name)) : undefined;
      const rowNameK = row.first_name ? nameKey(row.first_name, row.last_name) : "";
      const titularK = row.titular_full_name ? fullNameKey(row.titular_full_name) : "";
      if (wantsCompanion) {
        if (row.email) companionId = compEmailMap.get(row.email.toLowerCase());
        if (!companionId && row.dni) companionId = compDniMap.get(row.dni.toUpperCase());
        if (!companionId && rowNameK) {
          if (titularK && rowSessionId) companionId = compNameMap.get(`${titularK}::${rowNameK}::${rowSessionId}`);
          if (!companionId && titularK) companionId = compNameMap.get(`${titularK}::${rowNameK}`);
          if (!companionId && rowSessionId) companionId = compNameMap.get(`${rowNameK}::${rowSessionId}`);
          if (!companionId) companionId = compNameMap.get(rowNameK);
        }
      } else {
        if (row.email) participantId = emailMap.get(row.email.toLowerCase());
        if (!participantId && row.dni) participantId = dniMap.get(row.dni.toUpperCase());
        if (!participantId && rowNameK) {
          if (rowSessionId) participantId = titularNameMap.get(`${rowNameK}::${rowSessionId}`);
          if (!participantId) participantId = titularNameMap.get(rowNameK);
        }
        // If tipo not set, fall back to companion lookup
        if (!row.tipo && !participantId) {
          if (row.email) companionId = compEmailMap.get(row.email.toLowerCase());
          if (!companionId && row.dni) companionId = compDniMap.get(row.dni.toUpperCase());
          if (!companionId && rowNameK) {
            if (titularK && rowSessionId) companionId = compNameMap.get(`${titularK}::${rowNameK}::${rowSessionId}`);
            if (!companionId && titularK) companionId = compNameMap.get(`${titularK}::${rowNameK}`);
            if (!companionId && rowSessionId) companionId = compNameMap.get(`${rowNameK}::${rowSessionId}`);
            if (!companionId) companionId = compNameMap.get(rowNameK);
          }
        }
      }
      if (!participantId && !companionId) {
        results.skipped++;
        results.errors.push(
          `No encontrado: ${row.email ?? row.dni ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? "(sin id)"}`,
        );
        continue;
      }
      const patch = {
        // Always overwrite the previous assignment with the imported values.
        seat_zone: row.seat_zone?.trim() || null,
        seat_row: row.seat_row?.trim() || null,
        seat_number: row.seat_number?.trim() || null,
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