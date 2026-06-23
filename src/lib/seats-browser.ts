import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { OccupancyResponse, Occupant, ResolutionPlan, SeatCell } from "./seats.functions";

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

export async function fetchSessionOccupancyClient(sessionId: string): Promise<OccupancyResponse> {
  const { data: session, error: sErr } = await supabase
    .from("event_sessions")
    .select("id, name, event_id, starts_at, capacity")
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!session) throw new Error("Sesión no encontrada");

  const { data: parts, error: pErr } = await supabase
    .from("event_participants")
    .select("id, status, seat_zone, seat_row, seat_number, created_at, people(first_name, last_name, dni)")
    .eq("session_id", sessionId)
    .limit(5000);
  if (pErr) throw new Error(pErr.message);

  const participantIds = (parts ?? []).map((p) => p.id);
  type CompanionSeatRow = {
    id: string;
    participant_id: string;
    first_name: string | null;
    last_name: string | null;
    dni: string | null;
    seat_zone: string | null;
    seat_row: string | null;
    seat_number: string | null;
    created_at: string;
  };
  const comps: CompanionSeatRow[] = [];
  for (let i = 0; i < participantIds.length; i += 500) {
    const chunk = participantIds.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const { data: cdata, error: cErr } = await supabase
      .from("companions")
      .select("id, participant_id, first_name, last_name, dni, seat_zone, seat_row, seat_number, created_at")
      .in("participant_id", chunk)
      .limit(5000);
    if (cErr) throw new Error(cErr.message);
    comps.push(...((cdata ?? []) as CompanionSeatRow[]));
  }

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

  const zones: OccupancyResponse["zones"] = [];
  let asignados = 0;
  let personas = 0;
  let conflictos = 0;
  const conflicts: SeatCell[] = [];
  let huecos = 0;

  for (const [zone, byZone] of acc) {
    const rows: OccupancyResponse["zones"][number]["rows"] = [];
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
}

export function suggestSeatResolutionLocal(occ: OccupancyResponse, cell: SeatCell): ResolutionPlan {
  const baseKey = seatKey(cell.zone, cell.row, cell.number);
  if (cell.occupants.length < 2) {
    return {
      session_id: occ.session.id,
      conflict_key: baseKey,
      strategy: "no_change",
      notes: ["No se detecta conflicto en esa butaca."],
      moves: [],
      unsafe: false,
    };
  }

  const groups = new Set(cell.occupants.map((o) => o.group_id));
  const sameGroup = groups.size === 1;
  const dnis = cell.occupants.map((o) => (o.dni ?? "").trim().toUpperCase()).filter(Boolean);
  const names = cell.occupants.map((o) => normName(o.full_name)).filter(Boolean);
  const dupePerson =
    (dnis.length >= 2 && new Set(dnis).size === 1) ||
    (dnis.length === 0 && names.length >= 2 && new Set(names).size === 1);

  if (dupePerson) {
    const sorted = [...cell.occupants].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const keep = sorted[0];
    const drop = sorted.slice(1);
    return {
      session_id: occ.session.id,
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
    const block = findContiguousFreeBlockLocal(occ, cell.zone, cell.row, cell.occupants.length);
    if (block) {
      return {
        session_id: occ.session.id,
        conflict_key: baseKey,
        strategy: "stay_oldest_relocate_others",
        notes: [
          `Grupo de ${cell.occupants.length} personas asignadas a la misma butaca por error.`,
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
    return crossZoneFallbackLocal(cell, occ.session.id, baseKey);
  }

  const byGroup = new Map<string, Occupant[]>();
  for (const o of cell.occupants) {
    const arr = byGroup.get(o.group_id) ?? [];
    arr.push(o);
    byGroup.set(o.group_id, arr);
  }
  const groupList = Array.from(byGroup.entries()).map(([, occs]) => ({
    occs,
    minCreatedAt: occs.reduce((m, o) => (o.created_at < m ? o.created_at : m), occs[0].created_at),
  }));
  groupList.sort((a, b) => a.minCreatedAt.localeCompare(b.minCreatedAt));
  const stay = groupList[0];
  const moveGroups = groupList.slice(1);
  const moves: ResolutionPlan["moves"] = [];
  const usedTargets = new Set<string>();

  for (const g of moveGroups) {
    const block = findContiguousFreeBlockLocal(occ, cell.zone, cell.row, g.occs.length, usedTargets);
    if (!block) {
      const altBlock = findBlockInZoneLocal(occ, cell.zone, g.occs.length, usedTargets);
      if (!altBlock) return crossZoneFallbackLocal(cell, occ.session.id, baseKey);
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
        reason: "Reubicado a butaca libre cercana (misma fila)",
      });
    });
  }

  return {
    session_id: occ.session.id,
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
}

function crossZoneFallbackLocal(cell: SeatCell, sessionId: string, baseKey: string): ResolutionPlan {
  return {
    session_id: sessionId,
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

function findContiguousFreeBlockLocal(
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
  const maxN = Math.max(r.max_number + n + 2, 60);
  const isFree = (num: number) => {
    const k = `${normZone(zone)}||${row}||${num}`;
    if (excludeKeys?.has(k)) return false;
    const s = r.seats.find((x) => Number(x.number) === num);
    if (!s) return true;
    return s.occupants.length === 0;
  };
  for (let start = 1; start + n - 1 <= maxN; start++) {
    let ok = true;
    for (let i = 0; i < n; i++) {
      if (!isFree(start + i)) { ok = false; break; }
    }
    if (ok) return Array.from({ length: n }, (_, i) => start + i);
  }
  return null;
}

function findBlockInZoneLocal(
  occ: OccupancyResponse,
  zone: string,
  n: number,
  excludeKeys?: Set<string>,
): { row: string; seats: number[] } | null {
  const z = occ.zones.find((x) => normZone(x.zone) === normZone(zone));
  if (!z) return null;
  for (const r of z.rows) {
    const block = findContiguousFreeBlockLocal(occ, zone, r.row, n, excludeKeys);
    if (block) return { row: r.row, seats: block };
  }
  return null;
}

export async function setSeatManualClient(
  sessionId: string,
  vars: { occupant_kind: "titular" | "acompanante"; occupant_id: string; zone: string; row: string; number: string },
): Promise<{ ok: true }> {
  await applySeatMovesClient(sessionId, [{
    occupant_kind: vars.occupant_kind,
    occupant_id: vars.occupant_id,
    occupant_name: "Cambio manual",
    from: { zone: "", row: "", number: "" },
    to: { zone: vars.zone.trim(), row: vars.row.trim(), number: vars.number.trim() },
    reason: "Cambio manual de asiento",
  }], true);
  return { ok: true };
}

export async function applySeatMovesClient(
  sessionId: string,
  moves: ResolutionPlan["moves"],
  allowCrossZone: boolean,
): Promise<{ applied: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  const applied: ResolutionPlan["moves"] = [];

  for (const move of moves) {
    if (!move.to) {
      const patch = { seat_zone: null, seat_row: null, seat_number: null };
      const result = move.occupant_kind === "titular"
        ? await supabase.from("event_participants").update(patch).eq("id", move.occupant_id)
        : await supabase.from("companions").update(patch).eq("id", move.occupant_id);
      if (result.error) errors.push(`${move.occupant_name}: ${result.error.message}`);
      else applied.push(move);
      continue;
    }

    if (!allowCrossZone && move.from.zone && normZone(move.from.zone) !== normZone(move.to.zone)) {
      errors.push(`${move.occupant_name}: cambio de zona no autorizado`);
      continue;
    }

    const patch = {
      seat_zone: move.to.zone.trim() || null,
      seat_row: move.to.row.trim() || null,
      seat_number: move.to.number.trim() || null,
    };
    const result = move.occupant_kind === "titular"
      ? await supabase.from("event_participants").update(patch).eq("id", move.occupant_id)
      : await supabase.from("companions").update(patch).eq("id", move.occupant_id);
    if (result.error) errors.push(`${move.occupant_name}: ${result.error.message}`);
    else applied.push(move);
  }

  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({
    action: "seats.replan_apply",
    entity_type: "event_participants",
    event_id: null,
    session_id: sessionId,
    actor_id: userData.user?.id ?? null,
    actor_email: userData.user?.email ?? null,
    changes: {
      applied: applied.length,
      failed: errors.length,
      allow_cross_zone: allowCrossZone,
      moves: applied,
      errors,
    } as Json,
  });

  return { applied: applied.length, failed: errors.length, errors };
}