import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

// ──────────────────────────────────────────────────────────────────────────────
// Plano del teatro / ocupación por sesión / sugerencias y reasignación
// ──────────────────────────────────────────────────────────────────────────────

const normName = (s: string | null | undefined) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const normZone = (s: string | null | undefined) => normName(s).replace(/\s+/g, " ").trim();

const seatKey = (zone: string | null | undefined, row: string | null | undefined, num: string | null | undefined) =>
  `${normZone(zone)}||${(row ?? "").toString().trim()}||${(num ?? "").toString().trim()}`;

export type Occupant = {
  kind: "titular" | "acompanante";
  id: string;
  participant_id: string;
  group_id: string; // === participant_id; sirve para agrupar titular + acompañantes
  full_name: string;
  dni: string | null;
  status: string | null;
  created_at: string;
};

export type SeatCell = {
  zone: string;
  row: string;
  number: string;
  occupants: Occupant[];
};

export type ZoneInventory = {
  zone: string;
  rows: {
    row: string;
    seats: SeatCell[]; // todos los asientos ocupados o "huecos" hasta max(num)
    max_number: number;
  }[];
};

export type OccupancyResponse = {
  session: { id: string; name: string; event_id: string; starts_at: string; capacity: number };
  zones: ZoneInventory[];
  totals: {
    asignados: number; // butacas ocupadas (únicas)
    personas: number; // suma de ocupantes (cuenta conflictos)
    conflictos: number; // butacas con >1 ocupante
    huecos_estimados: number; // dentro de los rangos vistos
    fantasmas: number; // asientos con datos incompletos
  };
  conflicts: SeatCell[]; // butacas con 2+ ocupantes
};

export const getSessionOccupancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<OccupancyResponse> => {
    const sb = context.supabase;
    const { data: session, error: sErr } = await sb
      .from("event_sessions")
      .select("id, name, event_id, starts_at, capacity")
      .eq("id", data.session_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!session) throw new Error("Sesión no encontrada");

    const { data: parts, error: pErr } = await sb
      .from("event_participants")
      .select(
        "id, status, seat_zone, seat_row, seat_number, created_at, people(first_name, last_name, dni)",
      )
      .eq("session_id", data.session_id);
    if (pErr) throw new Error(pErr.message);

    const participantIds = (parts ?? []).map((p) => p.id);
    let comps: Array<{
      id: string;
      participant_id: string;
      first_name: string | null;
      last_name: string | null;
      dni: string | null;
      seat_zone: string | null;
      seat_row: string | null;
      seat_number: string | null;
      created_at: string;
    }> = [];
    if (participantIds.length > 0) {
      const { data: cdata, error: cErr } = await sb
        .from("companions")
        .select(
          "id, participant_id, first_name, last_name, dni, seat_zone, seat_row, seat_number, created_at",
        )
        .in("participant_id", participantIds);
      if (cErr) throw new Error(cErr.message);
      comps = cdata ?? [];
    }

    // Construir el listado de ocupantes
    const occupants: Array<Occupant & { zone: string; row: string; number: string }> = [];
    let fantasmas = 0;
    for (const p of parts ?? []) {
      const person = p.people as { first_name: string | null; last_name: string | null; dni: string | null } | null;
      const name = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() || "(sin nombre)";
      if (!p.seat_zone || !p.seat_row || !p.seat_number) {
        if (p.seat_zone || p.seat_row || p.seat_number) fantasmas++;
        continue;
      }
      occupants.push({
        kind: "titular",
        id: p.id,
        participant_id: p.id,
        group_id: p.id,
        full_name: name,
        dni: person?.dni ?? null,
        status: p.status ?? null,
        created_at: p.created_at,
        zone: p.seat_zone,
        row: p.seat_row,
        number: p.seat_number,
      });
    }
    for (const c of comps) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(acompañante)";
      if (!c.seat_zone || !c.seat_row || !c.seat_number) {
        if (c.seat_zone || c.seat_row || c.seat_number) fantasmas++;
        continue;
      }
      occupants.push({
        kind: "acompanante",
        id: c.id,
        participant_id: c.participant_id,
        group_id: c.participant_id,
        full_name: name,
        dni: c.dni ?? null,
        status: null,
        created_at: c.created_at,
        zone: c.seat_zone,
        row: c.seat_row,
        number: c.seat_number,
      });
    }

    // Agrupar por zona/fila/asiento
    type Acc = Map<string, Map<string, Map<string, Occupant[]>>>;
    const acc: Acc = new Map();
    for (const o of occupants) {
      const z = (o.zone ?? "").trim();
      const r = (o.row ?? "").trim();
      const n = (o.number ?? "").trim();
      let byZone = acc.get(z);
      if (!byZone) acc.set(z, (byZone = new Map()));
      let byRow = byZone.get(r);
      if (!byRow) byZone.set(r, (byRow = new Map()));
      let bySeat = byRow.get(n);
      if (!bySeat) byRow.set(n, (bySeat = []));
      const { zone: _z, row: _r, number: _n, ...rest } = o;
      void _z; void _r; void _n;
      bySeat.push(rest);
    }

    const zones: ZoneInventory[] = [];
    let asignados = 0;
    let personas = 0;
    let conflictos = 0;
    const conflicts: SeatCell[] = [];
    let huecos = 0;

    for (const [zone, byZone] of acc) {
      const rows: ZoneInventory["rows"] = [];
      const rowKeys = Array.from(byZone.keys()).sort((a, b) => {
        const ai = Number(a);
        const bi = Number(b);
        if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
        return a.localeCompare(b);
      });
      for (const row of rowKeys) {
        const byRow = byZone.get(row)!;
        const seatNums = Array.from(byRow.keys()).map((n) => Number(n)).filter((n) => Number.isFinite(n));
        const maxN = seatNums.length ? Math.max(...seatNums) : 0;
        const minN = seatNums.length ? Math.min(...seatNums) : 1;
        const seats: SeatCell[] = [];
        const minRange = Math.min(1, minN);
        for (let n = minRange; n <= maxN; n++) {
          const key = String(n);
          const occ = byRow.get(key) ?? [];
          const cell: SeatCell = { zone, row, number: key, occupants: occ };
          seats.push(cell);
          if (occ.length === 0) huecos++;
          else {
            asignados++;
            personas += occ.length;
            if (occ.length > 1) {
              conflictos++;
              conflicts.push(cell);
            }
          }
        }
        rows.push({ row, seats, max_number: maxN });
      }
      zones.push({ zone, rows });
    }
    zones.sort((a, b) => a.zone.localeCompare(b.zone));

    return {
      session: {
        id: session.id,
        name: session.name,
        event_id: session.event_id,
        starts_at: session.starts_at,
        capacity: session.capacity ?? 0,
      },
      zones,
      totals: { asignados, personas, conflictos, huecos_estimados: huecos, fantasmas },
      conflicts,
    };
  });

// ── Sugerencias de resolución ────────────────────────────────────────────────

export type ResolutionMove = {
  occupant_kind: "titular" | "acompanante";
  occupant_id: string;
  occupant_name: string;
  from: { zone: string; row: string; number: string };
  to: { zone: string; row: string; number: string } | null; // null = liberar (fusión)
  reason: string;
};

export type ResolutionPlan = {
  session_id: string;
  conflict_key: string;
  strategy: "stay_oldest_relocate_others" | "merge_duplicate_person" | "cross_zone_required" | "no_change";
  notes: string[];
  moves: ResolutionMove[];
  unsafe: boolean; // true si requiere cambiar de zona (necesita aprobación expresa)
};

export const suggestSeatResolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ session_id: z.string().uuid(), zone: z.string(), row: z.string(), number: z.string() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ResolutionPlan> => {
    const occ = await getSessionOccupancy({ data: { session_id: data.session_id } });
    const cell = occ.conflicts.find(
      (c) => normZone(c.zone) === normZone(data.zone) && c.row === data.row && c.number === data.number,
    );
    const baseKey = seatKey(data.zone, data.row, data.number);
    if (!cell) {
      return {
        session_id: data.session_id,
        conflict_key: baseKey,
        strategy: "no_change",
        notes: ["No se detecta conflicto en esa butaca."],
        moves: [],
        unsafe: false,
      };
    }

    // ¿Mismo grupo? (mismo participant_id ⇒ titular + sus acompañantes)
    const groups = new Set(cell.occupants.map((o) => o.group_id));
    const sameGroup = groups.size === 1;

    // ¿Misma persona? (DNI normalizado o nombre normalizado idéntico)
    const dnis = cell.occupants.map((o) => (o.dni ?? "").trim().toUpperCase()).filter(Boolean);
    const names = cell.occupants.map((o) => normName(o.full_name)).filter(Boolean);
    const dupePerson =
      (dnis.length >= 2 && new Set(dnis).size === 1) ||
      (dnis.length === 0 && names.length >= 2 && new Set(names).size === 1);

    if (dupePerson) {
      // Fusión: nos quedamos con el más antiguo, liberamos los otros (sin mover de asiento)
      const sorted = [...cell.occupants].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const keep = sorted[0];
      const drop = sorted.slice(1);
      return {
        session_id: data.session_id,
        conflict_key: baseKey,
        strategy: "merge_duplicate_person",
        notes: [
          `Misma persona registrada ${cell.occupants.length} veces (mismo DNI o nombre).`,
          `Se conserva el registro más antiguo (${keep.full_name}) y se libera el duplicado.`,
        ],
        moves: drop.map((o) => ({
          occupant_kind: o.kind,
          occupant_id: o.id,
          occupant_name: o.full_name,
          from: { zone: cell.zone, row: cell.row, number: cell.number },
          to: null,
          reason: "Duplicado de persona — se libera el asiento",
        })),
        unsafe: false,
      };
    }

    if (sameGroup) {
      // Todos del mismo titular: no es realmente conflicto, simplemente están todos pegados a la misma butaca.
      // Buscamos N huecos contiguos en la misma fila/zona y los reubicamos como bloque.
      const N = cell.occupants.length;
      const block = findContiguousFreeBlock(occ, cell.zone, cell.row, N);
      if (block) {
        return {
          session_id: data.session_id,
          conflict_key: baseKey,
          strategy: "stay_oldest_relocate_others",
          notes: [
            `Grupo de ${N} personas asignadas a la misma butaca por error.`,
            `Se reubican como bloque contiguo en ${cell.zone}, Fila ${cell.row}, asientos ${block.join("-")}.`,
          ],
          moves: cell.occupants.map((o, i) => ({
            occupant_kind: o.kind,
            occupant_id: o.id,
            occupant_name: o.full_name,
            from: { zone: cell.zone, row: cell.row, number: cell.number },
            to: { zone: cell.zone, row: cell.row, number: String(block[i]) },
            reason: "Grupo familiar reubicado a bloque libre",
          })),
          unsafe: false,
        };
      }
      return crossZoneFallback(cell, occ, data.session_id, baseKey);
    }

    // Grupos distintos en la misma butaca → se queda el grupo más antiguo, los demás se mueven
    // a la butaca libre más cercana en su misma zona, intentando mantener cada grupo unido.
    const byGroup = new Map<string, Occupant[]>();
    for (const o of cell.occupants) {
      const arr = byGroup.get(o.group_id) ?? [];
      arr.push(o);
      byGroup.set(o.group_id, arr);
    }
    const groupList = Array.from(byGroup.entries()).map(([gid, occs]) => ({
      gid,
      occs,
      minCreatedAt: occs.reduce((m, o) => (o.created_at < m ? o.created_at : m), occs[0].created_at),
    }));
    groupList.sort((a, b) => a.minCreatedAt.localeCompare(b.minCreatedAt));
    const stay = groupList[0];
    const moveGroups = groupList.slice(1);

    // El grupo que se queda: si es de 1 persona se queda; si son varios, intentamos darle bloque contiguo desde esa butaca.
    const moves: ResolutionMove[] = [];
    const usedTargets = new Set<string>();

    for (const g of moveGroups) {
      const N = g.occs.length;
      const block = findContiguousFreeBlock(occ, cell.zone, cell.row, N, usedTargets);
      if (!block) {
        // Buscar en otra fila de la misma zona
        const altBlock = findBlockInZone(occ, cell.zone, N, usedTargets);
        if (!altBlock) {
          return crossZoneFallback(cell, occ, data.session_id, baseKey);
        }
        altBlock.seats.forEach((n) => usedTargets.add(`${normZone(cell.zone)}||${altBlock.row}||${n}`));
        g.occs.forEach((o, i) => {
          moves.push({
            occupant_kind: o.kind,
            occupant_id: o.id,
            occupant_name: o.full_name,
            from: { zone: cell.zone, row: cell.row, number: cell.number },
            to: { zone: cell.zone, row: altBlock.row, number: String(altBlock.seats[i]) },
            reason: `Reubicado a Fila ${altBlock.row} (misma zona)`,
          });
        });
        continue;
      }
      block.forEach((n) => usedTargets.add(`${normZone(cell.zone)}||${cell.row}||${n}`));
      g.occs.forEach((o, i) => {
        moves.push({
          occupant_kind: o.kind,
          occupant_id: o.id,
          occupant_name: o.full_name,
          from: { zone: cell.zone, row: cell.row, number: cell.number },
          to: { zone: cell.zone, row: cell.row, number: String(block[i]) },
          reason: `Reubicado a butaca libre cercana (misma fila)`,
        });
      });
    }

    return {
      session_id: data.session_id,
      conflict_key: baseKey,
      strategy: "stay_oldest_relocate_others",
      notes: [
        `${groupList.length} grupos en la misma butaca.`,
        `Se queda el grupo más antiguo (${stay.occs[0].full_name}).`,
        `Se reubican ${moveGroups.length} grupo(s) en la misma zona, manteniendo cada uno contiguo.`,
      ],
      moves,
      unsafe: false,
    };
  });

function crossZoneFallback(cell: SeatCell, occ: OccupancyResponse, session_id: string, baseKey: string): ResolutionPlan {
  return {
    session_id,
    conflict_key: baseKey,
    strategy: "cross_zone_required",
    notes: [
      "No hay huecos suficientes en la zona original para mantener el grupo unido.",
      "Se necesita reubicar en otra zona (requiere tu aprobación expresa).",
    ],
    moves: cell.occupants.map((o) => ({
      occupant_kind: o.kind,
      occupant_id: o.id,
      occupant_name: o.full_name,
      from: { zone: cell.zone, row: cell.row, number: cell.number },
      to: null,
      reason: "Sin hueco en la zona original — pendiente de aprobación",
    })),
    unsafe: true,
  };
}

function findContiguousFreeBlock(
  occ: OccupancyResponse,
  zone: string,
  row: string,
  n: number,
  excludeKeys?: Set<string>,
): number[] | null {
  const z = occ.zones.find((x) => normZone(x.zone) === normZone(zone));
  if (!z) return null;
  const r = z.rows.find((x) => x.row === row);
  if (!r) return null;
  const maxN = Math.max(r.max_number + n + 2, 60); // permitir extender el rango si hace falta
  // construir índice ocupado
  const isFree = (num: number) => {
    const k = `${normZone(zone)}||${row}||${num}`;
    if (excludeKeys?.has(k)) return false;
    const s = r.seats.find((x) => Number(x.number) === num);
    if (!s) return true; // fuera de rango conocido → asumimos libre
    return s.occupants.length === 0;
  };
  for (let start = 1; start + n - 1 <= maxN; start++) {
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (!isFree(start + i)) { ok = false; break; }
    }
    if (ok) {
      return Array.from({ length: n }, (_, i) => start + i);
    }
  }
  return null;
}

function findBlockInZone(
  occ: OccupancyResponse,
  zone: string,
  n: number,
  excludeKeys?: Set<string>,
): { row: string; seats: number[] } | null {
  const z = occ.zones.find((x) => normZone(x.zone) === normZone(zone));
  if (!z) return null;
  for (const r of z.rows) {
    const block = findContiguousFreeBlock(occ, zone, r.row, n, excludeKeys);
    if (block) return { row: r.row, seats: block };
  }
  return null;
}

// ── Aplicar un plan ──────────────────────────────────────────────────────────

const moveSchema = z.object({
  occupant_kind: z.enum(["titular", "acompanante"]),
  occupant_id: z.string().uuid(),
  occupant_name: z.string(),
  from: z.object({ zone: z.string(), row: z.string(), number: z.string() }),
  to: z.object({ zone: z.string(), row: z.string(), number: z.string() }).nullable(),
  reason: z.string(),
});

export const applySeatPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid(),
        moves: z.array(moveSchema).min(1).max(200),
        allow_cross_zone: z.boolean().default(false),
        note: z.string().optional(),
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

    const applied: typeof data.moves = [];
    const errors: string[] = [];

    for (const m of data.moves) {
      if (!m.to) {
        // Liberación de asiento (sin borrar al ocupante — solo limpia su sitio)
        const patch = { seat_zone: null, seat_row: null, seat_number: null };
        const table = m.occupant_kind === "titular" ? "event_participants" : "companions";
        const { error } = await supabaseAdmin
          .from(table)
          .update(patch as never)
          .eq("id", m.occupant_id);
        if (error) errors.push(`${m.occupant_name}: ${error.message}`);
        else applied.push(m);
        continue;
      }
      if (!data.allow_cross_zone && normZone(m.from.zone) !== normZone(m.to.zone)) {
        errors.push(`${m.occupant_name}: cambio de zona no autorizado`);
        continue;
      }
      const patch = { seat_zone: m.to.zone, seat_row: m.to.row, seat_number: m.to.number };
      const table = m.occupant_kind === "titular" ? "event_participants" : "companions";
      const { error } = await supabaseAdmin
        .from(table)
        .update(patch as never)
        .eq("id", m.occupant_id);
      if (error) errors.push(`${m.occupant_name}: ${error.message}`);
      else applied.push(m);
    }

    // Log de auditoría
    const { data: sess } = await supabaseAdmin
      .from("event_sessions")
      .select("event_id")
      .eq("id", data.session_id)
      .maybeSingle();

    await supabaseAdmin.from("audit_logs").insert({
      action: "seats.replan_apply",
      entity_type: "event_participants",
      event_id: sess?.event_id ?? null,
      session_id: data.session_id,
      actor_id: context.userId,
      changes: {
        applied: applied.length,
        failed: errors.length,
        allow_cross_zone: data.allow_cross_zone,
        note: data.note ?? null,
        moves: applied,
        errors,
      },
    } as never);

    return { applied: applied.length, failed: errors.length, errors };
  });

// ── Cambio manual puntual de un asiento ──────────────────────────────────────

export const setSeatManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid(),
        occupant_kind: z.enum(["titular", "acompanante"]),
        occupant_id: z.string().uuid(),
        zone: z.string().nullable(),
        row: z.string().nullable(),
        number: z.string().nullable(),
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
    const table = data.occupant_kind === "titular" ? "event_participants" : "companions";
    const patch = {
      seat_zone: data.zone?.trim() || null,
      seat_row: data.row?.trim() || null,
      seat_number: data.number?.trim() || null,
    };
    const { error } = await supabaseAdmin
      .from(table)
      .update(patch as never)
      .eq("id", data.occupant_id);
    if (error) throw new Error(error.message);
    const { data: sess } = await supabaseAdmin
      .from("event_sessions")
      .select("event_id")
      .eq("id", data.session_id)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      action: "seats.manual_set",
      entity_type: table,
      entity_id: data.occupant_id,
      event_id: sess?.event_id ?? null,
      session_id: data.session_id,
      actor_id: context.userId,
      changes: { zone: patch.seat_zone, row: patch.seat_row, number: patch.seat_number },
    } as never);
    return { ok: true };
  });

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
      (s ?? "")
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
    const nameKey = (f: string | null | undefined, l: string | null | undefined) =>
      `${norm(f)}|${norm(l)}`;
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
        email: string | null;
        dni: string | null;
        first_name: string | null;
        last_name: string | null;
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
          if (titularK && rowSessionId) {
            companionId = compNameMap.get(`${titularK}::${rowNameK}::${rowSessionId}`);
          }
          if (!companionId && titularK) companionId = compNameMap.get(`${titularK}::${rowNameK}`);
          if (!companionId && rowSessionId) {
            companionId = compNameMap.get(`${rowNameK}::${rowSessionId}`);
          }
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
            if (titularK && rowSessionId) {
              companionId = compNameMap.get(`${titularK}::${rowNameK}::${rowSessionId}`);
            }
            if (!companionId && titularK) companionId = compNameMap.get(`${titularK}::${rowNameK}`);
            if (!companionId && rowSessionId) {
              companionId = compNameMap.get(`${rowNameK}::${rowSessionId}`);
            }
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
        else {
          results.updated_acompanantes++;
          results.updated++;
        }
      } else if (participantId) {
        const { error: upErr } = await supabaseAdmin
          .from("event_participants")
          .update(patch as never)
          .eq("id", participantId);
        if (upErr) results.errors.push(`${row.email ?? row.dni}: ${upErr.message}`);
        else {
          results.updated_titulares++;
          results.updated++;
        }
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
