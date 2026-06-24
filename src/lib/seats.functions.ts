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

// Estados de titular que NO cuentan como ocupante de la butaca.
// Los acompañantes heredan: si el titular es inválido, sus acompañantes tampoco cuentan.
export const INVALID_OCCUPANT_STATUSES = new Set<string>([
  "cancelado_asistente",
  "no_asistira",
  "baja",
  "rechazado",
]);

// Estados que implican QR emitido/utilizable
export const QR_EMITTED_STATUSES = new Set<string>([
  "qr_generado",
  "confirmado",
  "acceso_validado",
  "invitacion_enviada",
  "pendiente_confirmacion",
]);

export type SeatOverrideCategory =
  | "reservado_camaras"
  | "bloqueado"
  | "movilidad_reducida"
  | "acompanante_mr"
  | "visibilidad_reducida";

export const SEAT_OVERRIDE_LABELS: Record<SeatOverrideCategory, string> = {
  reservado_camaras: "Reservado cámaras",
  bloqueado: "Bloqueado",
  movilidad_reducida: "Movilidad reducida",
  acompanante_mr: "Acompañante MR",
  visibilidad_reducida: "Visibilidad reducida",
};

export const SEAT_OVERRIDE_DEFAULT_COLORS: Record<SeatOverrideCategory, string> = {
  reservado_camaras: "#6b7280", // gris
  bloqueado: "#374151", // gris oscuro
  movilidad_reducida: "#0ea5e9", // azul
  acompanante_mr: "#22c55e", // verde
  visibilidad_reducida: "#a855f7", // morado
};

// Categorías que retiran la butaca del aforo disponible (no ocupada, no libre).
export const UNAVAILABLE_OVERRIDE_CATEGORIES = new Set<SeatOverrideCategory>([
  "reservado_camaras",
  "bloqueado",
]);

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
  category?: SeatOverrideCategory;
  color?: string | null;
  notes?: string | null;
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
    huecos_estimados: number; // dentro de los rangos vistos (legacy, no fiable)
    fantasmas: number; // asientos con datos incompletos
    aforo: number; // alias retrocompatible = aforo_sesion
    aforo_sesion: number; // capacidad configurada en la sesión
    aforo_plano: number; // butacas reales dibujadas (ocupadas + reservadas + huecos visibles)
    aforo_plano_fisico: number | null; // butacas del plano físico vinculado (si existe), prioritario
    desviacion_sesion: number; // aforo_plano - aforo_sesion
    butacas_ocupadas: number; // alias de asignados con ocupantes válidos
    personas_ocupadas: number; // alias de personas con ocupantes válidos
    reservados_no_disponibles: number; // butacas marcadas reservadas/bloqueadas
    libres_estimadas: number; // aforo_plano - butacas_ocupadas - reservados_no_disponibles
    overbooking: number; // exceso sobre aforo_plano
    excluidos_por_estado: number; // titulares ignorados por estado inválido
    personas_con_qr_sin_asiento: number; // titulares (+ acompañantes) con QR emitido y sin butaca
  };
  conflicts: SeatCell[]; // butacas con 2+ ocupantes
  overrides_summary: Array<{ category: SeatOverrideCategory; count: number; color: string }>;
};

export const getSessionOccupancy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<OccupancyResponse> => {
    const sb = context.supabase;
    const { data: session, error: sErr } = await sb
      .from("event_sessions")
      .select("id, name, event_id, starts_at, capacity, venue_plan_id")
      .eq("id", data.session_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!session) throw new Error("Sesión no encontrada");

    // Aforo del plano físico (si la sesión está vinculada a un plano)
    let aforo_plano_fisico: number | null = null;
    if (session.venue_plan_id) {
      const { count, error: vErr } = await sb
        .from("venue_seats")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", session.venue_plan_id)
        .eq("is_active", true);
      if (vErr) throw new Error(vErr.message);
      aforo_plano_fisico = count ?? 0;
    }

    const { data: parts, error: pErr } = await sb
      .from("event_participants")
      .select(
        "id, status, seat_zone, seat_row, seat_number, created_at, people(first_name, last_name, dni)",
      )
      .eq("session_id", data.session_id);
    if (pErr) throw new Error(pErr.message);

    // Cargar overrides de butacas para esta sesión
    const { data: overridesData, error: oErr } = await sb
      .from("session_seat_overrides")
      .select("seat_zone, seat_row, seat_number, category, color, notes")
      .eq("session_id", data.session_id);
    if (oErr) throw new Error(oErr.message);
    type OverrideRow = {
      seat_zone: string;
      seat_row: string;
      seat_number: string;
      category: SeatOverrideCategory;
      color: string | null;
      notes: string | null;
    };
    const overrides = (overridesData ?? []) as OverrideRow[];
    const overrideByKey = new Map<string, OverrideRow>();
    for (const o of overrides) {
      overrideByKey.set(seatKey(o.seat_zone, o.seat_row, o.seat_number), o);
    }

    // Pre-cálculo: titulares cuyo estado los descarta como ocupantes
    const invalidParticipantIds = new Set<string>();
    let excluidos_por_estado = 0;
    for (const p of parts ?? []) {
      if (p.status && INVALID_OCCUPANT_STATUSES.has(p.status)) {
        invalidParticipantIds.add(p.id);
        if (p.seat_zone && p.seat_row && p.seat_number) excluidos_por_estado++;
      }
    }

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
      if (invalidParticipantIds.has(p.id)) continue;
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
      if (invalidParticipantIds.has(c.participant_id)) continue;
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
    // Asegurar que las butacas con override existan como celdas aunque no tengan ocupantes
    for (const o of overrides) {
      const z = (o.seat_zone ?? "").trim();
      const r = (o.seat_row ?? "").trim();
      const n = (o.seat_number ?? "").trim();
      if (!z || !r || !n) continue;
      let byZone = acc.get(z);
      if (!byZone) acc.set(z, (byZone = new Map()));
      let byRow = byZone.get(r);
      if (!byRow) byZone.set(r, (byRow = new Map()));
      if (!byRow.has(n)) byRow.set(n, []);
    }

    const zones: ZoneInventory[] = [];
    let butacas_ocupadas = 0;
    let personas_ocupadas = 0;
    let conflictos = 0;
    const conflicts: SeatCell[] = [];
    let huecos = 0;
    let reservados_no_disponibles = 0;
    const overridesCount: Record<string, number> = {};

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
          const ov = overrideByKey.get(seatKey(zone, row, key));
          const cell: SeatCell = {
            zone,
            row,
            number: key,
            occupants: occ,
            ...(ov
              ? {
                  category: ov.category,
                  color: ov.color ?? SEAT_OVERRIDE_DEFAULT_COLORS[ov.category],
                  notes: ov.notes ?? null,
                }
              : {}),
          };
          seats.push(cell);
          if (ov) overridesCount[ov.category] = (overridesCount[ov.category] ?? 0) + 1;
          const isUnavailable = ov && UNAVAILABLE_OVERRIDE_CATEGORIES.has(ov.category);
          if (occ.length === 0) {
            if (isUnavailable) reservados_no_disponibles++;
            else huecos++;
          } else {
            butacas_ocupadas++;
            personas_ocupadas += occ.length;
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

    const aforo_sesion = session.capacity ?? 0;
    const aforo_plano_dibujado = butacas_ocupadas + reservados_no_disponibles + huecos;
    // Prioridad: plano físico > plano dibujado > capacidad de sesión
    const aforo_plano = aforo_plano_fisico !== null && aforo_plano_fisico > 0
      ? aforo_plano_fisico
      : aforo_plano_dibujado;
    const aforo_base = aforo_plano > 0 ? aforo_plano : aforo_sesion;
    const libres_estimadas = Math.max(0, aforo_base - butacas_ocupadas - reservados_no_disponibles);
    const overbooking = Math.max(0, butacas_ocupadas + reservados_no_disponibles - aforo_base);

    // Personas con QR emitido sin butaca
    const qrParticipantsNoSeat = new Set<string>();
    let personas_con_qr_sin_asiento = 0;
    for (const p of parts ?? []) {
      if (!p.status || !QR_EMITTED_STATUSES.has(p.status)) continue;
      if (!p.seat_zone || !p.seat_row || !p.seat_number) {
        personas_con_qr_sin_asiento++;
        qrParticipantsNoSeat.add(p.id);
      }
    }
    for (const c of comps) {
      // Acompañante del titular con QR (heredan), sin asiento
      if (qrParticipantsNoSeat.has(c.participant_id)) {
        if (!c.seat_zone || !c.seat_row || !c.seat_number) personas_con_qr_sin_asiento++;
      }
    }

    const overrides_summary = (Object.keys(overridesCount) as SeatOverrideCategory[]).map((cat) => ({
      category: cat,
      count: overridesCount[cat],
      color: SEAT_OVERRIDE_DEFAULT_COLORS[cat],
    }));

    return {
      session: {
        id: session.id,
        name: session.name,
        event_id: session.event_id,
        starts_at: session.starts_at,
        capacity: aforo_sesion,
      },
      zones,
      totals: {
        asignados: butacas_ocupadas,
        personas: personas_ocupadas,
        conflictos,
        huecos_estimados: huecos,
        fantasmas,
        aforo: aforo_sesion,
        aforo_sesion,
        aforo_plano,
        aforo_plano_fisico,
        desviacion_sesion: aforo_plano - aforo_sesion,
        butacas_ocupadas,
        personas_ocupadas,
        reservados_no_disponibles,
        libres_estimadas,
        overbooking,
        excluidos_por_estado,
        personas_con_qr_sin_asiento,
      },
      conflicts,
      overrides_summary,
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
