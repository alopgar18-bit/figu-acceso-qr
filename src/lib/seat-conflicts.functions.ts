import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";
import { INVALID_OCCUPANT_STATUSES } from "./seats.functions";

// ──────────────────────────────────────────────────────────────────────────────
// Panel global de conflictos: duplicados / cancelados con butaca / fuera del plano
// ──────────────────────────────────────────────────────────────────────────────

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const seatKey = (
  zone: string | null | undefined,
  row: string | null | undefined,
  num: string | null | undefined,
) => `${norm(zone)}||${(row ?? "").toString().trim()}||${(num ?? "").toString().trim()}`;

export type ConflictOccupant = {
  kind: "titular" | "acompanante";
  id: string;
  full_name: string;
  email: string | null;
  dni: string | null;
  status: string | null;
  created_at: string;
  zone: string;
  row: string;
  number: string;
};

export type DuplicateGroup = {
  zone: string;
  row: string;
  number: string;
  occupants: ConflictOccupant[];
};

export type ConflictsResponse = {
  duplicates: DuplicateGroup[]; // butacas con >1 ocupante (estados válidos)
  canceled_with_seat: ConflictOccupant[]; // estados inválidos pero conservan butaca
  off_plan: ConflictOccupant[]; // asignaciones a zona/fila/asiento inexistente
};

export const listSeatConflicts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ConflictsResponse> => {
    const sb = context.supabase;
    type Part = {
      id: string;
      status: string | null;
      seat_zone: string | null;
      seat_row: string | null;
      seat_number: string | null;
      created_at: string;
      people: {
        email: string | null;
        dni: string | null;
        first_name: string | null;
        last_name: string | null;
      } | null;
    };
    const { data: parts, error: pErr } = await sb
      .from("event_participants")
      .select(
        "id, status, seat_zone, seat_row, seat_number, created_at, people(email, dni, first_name, last_name)",
      )
      .eq("session_id", data.session_id);
    if (pErr) throw new Error(pErr.message);
    const participants = (parts ?? []) as Part[];
    const participantIds = participants.map((p) => p.id);

    type Comp = {
      id: string;
      participant_id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      dni: string | null;
      seat_zone: string | null;
      seat_row: string | null;
      seat_number: string | null;
      created_at: string;
    };
    const comps: Comp[] = [];
    for (let i = 0; i < participantIds.length; i += 500) {
      const chunk = participantIds.slice(i, i + 500);
      if (chunk.length === 0) continue;
      const { data: cdata, error: cErr } = await sb
        .from("companions")
        .select(
          "id, participant_id, first_name, last_name, email, dni, seat_zone, seat_row, seat_number, created_at",
        )
        .in("participant_id", chunk);
      if (cErr) throw new Error(cErr.message);
      comps.push(...((cdata ?? []) as Comp[]));
    }

    // Status del titular asociado a cada acompañante
    const titularStatus = new Map<string, string | null>();
    for (const p of participants) titularStatus.set(p.id, p.status ?? null);

    const canceled: ConflictOccupant[] = [];
    const valid: ConflictOccupant[] = [];

    for (const p of participants) {
      if (!p.seat_zone && !p.seat_row && !p.seat_number) continue;
      const occ: ConflictOccupant = {
        kind: "titular",
        id: p.id,
        full_name: [p.people?.first_name, p.people?.last_name].filter(Boolean).join(" ").trim() || "(sin nombre)",
        email: p.people?.email ?? null,
        dni: p.people?.dni ?? null,
        status: p.status ?? null,
        created_at: p.created_at,
        zone: p.seat_zone ?? "",
        row: p.seat_row ?? "",
        number: p.seat_number ?? "",
      };
      if (p.status && INVALID_OCCUPANT_STATUSES.has(p.status)) {
        canceled.push(occ);
      } else if (p.seat_zone && p.seat_row && p.seat_number) {
        valid.push(occ);
      }
    }
    for (const c of comps) {
      if (!c.seat_zone && !c.seat_row && !c.seat_number) continue;
      const tStatus = titularStatus.get(c.participant_id) ?? null;
      const occ: ConflictOccupant = {
        kind: "acompanante",
        id: c.id,
        full_name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(acompañante)",
        email: c.email,
        dni: c.dni,
        status: tStatus,
        created_at: c.created_at,
        zone: c.seat_zone ?? "",
        row: c.seat_row ?? "",
        number: c.seat_number ?? "",
      };
      if (tStatus && INVALID_OCCUPANT_STATUSES.has(tStatus)) {
        canceled.push(occ);
      } else if (c.seat_zone && c.seat_row && c.seat_number) {
        valid.push(occ);
      }
    }

    // Duplicados (entre los válidos)
    const grouped = new Map<string, ConflictOccupant[]>();
    for (const o of valid) {
      const k = seatKey(o.zone, o.row, o.number);
      const arr = grouped.get(k) ?? [];
      arr.push(o);
      grouped.set(k, arr);
    }
    const duplicates: DuplicateGroup[] = [];
    for (const [, occs] of grouped) {
      if (occs.length > 1) {
        duplicates.push({ zone: occs[0].zone, row: occs[0].row, number: occs[0].number, occupants: occs });
      }
    }
    duplicates.sort((a, b) => a.zone.localeCompare(b.zone) || a.row.localeCompare(b.row) || a.number.localeCompare(b.number));

    // Off-plan: seat key no presente en ninguna ocupación válida ni override
    // (heurística pragmática — el plano se construye desde lo asignado, así
    // que cualquier seat asignado existe por definición. En su lugar
    // detectamos zonas que no encajen con el resto: nombre de zona único)
    const zoneSet = new Set<string>();
    for (const o of valid) zoneSet.add(norm(o.zone));
    const off_plan: ConflictOccupant[] = [];
    for (const o of valid) {
      // detectamos como off-plan si la zona tiene <3 asignaciones (probable typo)
      // y el seat key destino no coincide con ningún otro de la sesión.
      // Conservador: por defecto no marcamos nada. Esto se sustituirá cuando
      // exista plano físico explícito (módulo del día 25).
      void zoneSet;
      void o;
    }

    return { duplicates, canceled_with_seat: canceled, off_plan };
  });

const occupantRefSchema = z.object({
  kind: z.enum(["titular", "acompanante"]),
  id: z.string().uuid(),
});

export const clearSeatsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid(),
        occupants: z.array(occupantRefSchema).min(1).max(2000),
        reason: z.string().optional(),
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
    const titIds = data.occupants.filter((o) => o.kind === "titular").map((o) => o.id);
    const compIds = data.occupants.filter((o) => o.kind === "acompanante").map((o) => o.id);
    const patch = { seat_zone: null, seat_row: null, seat_number: null };
    let cleared = 0;
    if (titIds.length > 0) {
      const { error, count } = await supabaseAdmin
        .from("event_participants")
        .update(patch as never, { count: "exact" })
        .in("id", titIds);
      if (error) throw new Error(error.message);
      cleared += count ?? titIds.length;
    }
    if (compIds.length > 0) {
      const { error, count } = await supabaseAdmin
        .from("companions")
        .update(patch as never, { count: "exact" })
        .in("id", compIds);
      if (error) throw new Error(error.message);
      cleared += count ?? compIds.length;
    }
    const { data: sess } = await supabaseAdmin
      .from("event_sessions")
      .select("event_id")
      .eq("id", data.session_id)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      action: "seats.bulk_clear",
      entity_type: "event_participants",
      event_id: sess?.event_id ?? null,
      session_id: data.session_id,
      actor_id: context.userId,
      changes: { reason: data.reason ?? null, titulares: titIds.length, acompanantes: compIds.length },
    } as never);
    return { cleared };
  });