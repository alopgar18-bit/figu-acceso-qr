import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";
import { APPROVED_LIKE } from "./participant-constants";
import type { Database } from "@/integrations/supabase/types";

type ParticipantStatus = Database["public"]["Enums"]["participant_status"];

const ADMIN_ROLES = ["superadmin", "admin_figurarte", "coordinador"] as const;

type Seat = {
  id: string;
  zone_id: string;
  zone_name: string;
  row_label: string;
  seat_number: string;
  default_category: string;
  is_active: boolean;
  row_index: number;
  col_index: number;
};

type Rule = {
  attendee_type: string;
  priority: number;
  preferred_zone_ids: string[];
  avoid_categories: string[];
  keep_companions_together: boolean;
  allow_split_if_full: boolean;
};

const DEFAULT_RULE: Omit<Rule, "attendee_type"> = {
  priority: 100,
  preferred_zone_ids: [],
  avoid_categories: [
    "reservado_camaras",
    "bloqueado",
    "reservado_movilidad_reducida",
    "reservado_vip",
  ],
  keep_companions_together: true,
  allow_split_if_full: true,
};

function seatKey(zone: string, row: string, num: string) {
  return `${zone.trim().toLowerCase()}|${row.trim().toLowerCase()}|${num.trim().toLowerCase()}`;
}

/**
 * Generates an assignment proposal for a session. Does NOT mutate participants.
 * Reserves consecutive seats per group when possible. Honors seat_locked.
 */
export const generateAssignmentProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ session_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [...ADMIN_ROLES]);
    const supabase = context.supabase;

    // 1) session + plan
    const { data: session, error: sErr } = await supabase
      .from("event_sessions")
      .select("id, event_id, venue_plan_id")
      .eq("id", data.session_id)
      .single();
    if (sErr) throw new Error(sErr.message);
    if (!session.venue_plan_id)
      throw new Error("Esta sesión no tiene plano físico asignado");

    // 2) seats + zones
    const { data: zonesRaw, error: zErr } = await supabase
      .from("venue_zones")
      .select("id, name")
      .eq("plan_id", session.venue_plan_id);
    if (zErr) throw new Error(zErr.message);
    const zoneById = new Map<string, string>(
      (zonesRaw ?? []).map((z) => [z.id, z.name]),
    );

    const { data: seatsRaw, error: stErr } = await supabase
      .from("venue_seats")
      .select(
        "id, zone_id, row_label, seat_number, default_category, is_active, row_index, col_index",
      )
      .eq("plan_id", session.venue_plan_id);
    if (stErr) throw new Error(stErr.message);

    const seats: Seat[] = (seatsRaw ?? []).map((s) => ({
      ...s,
      zone_name: zoneById.get(s.zone_id) ?? "",
    }));

    // 3) participants (approved-like)
    const { data: parts, error: pErr } = await supabase
      .from("event_participants")
      .select(
        "id, attendee_type, companions_count, seat_locked, seat_zone, seat_row, seat_number, status, created_at",
      )
      .eq("session_id", data.session_id)
      .in("status", APPROVED_LIKE as ParticipantStatus[]);
    if (pErr) throw new Error(pErr.message);

    // 4) rules
    const { data: rulesRaw, error: rErr } = await supabase
      .from("assignment_rules")
      .select(
        "attendee_type, priority, preferred_zone_ids, avoid_categories, keep_companions_together, allow_split_if_full",
      )
      .eq("plan_id", session.venue_plan_id);
    if (rErr) throw new Error(rErr.message);
    const rulesByType = new Map<string, Rule>();
    for (const r of rulesRaw ?? []) {
      rulesByType.set(r.attendee_type as string, r as Rule);
    }
    const ruleFor = (t: string): Rule => {
      const found = rulesByType.get(t);
      if (found) return found;
      return { attendee_type: t, ...DEFAULT_RULE };
    };

    // 5) Occupancy state: mark seats taken by locked participants
    const seatLookup = new Map<string, Seat>();
    for (const s of seats) {
      seatLookup.set(seatKey(s.zone_name, s.row_label, s.seat_number), s);
    }
    const taken = new Set<string>(); // seat.id
    for (const p of parts ?? []) {
      if (p.seat_locked && p.seat_zone && p.seat_row && p.seat_number) {
        const s = seatLookup.get(
          seatKey(p.seat_zone, p.seat_row, p.seat_number),
        );
        if (s) taken.add(s.id);
      }
    }

    // 6) Sort participants by rule priority, then by created_at
    const queue = (parts ?? [])
      .filter((p) => !p.seat_locked)
      .map((p) => ({
        p,
        rule: ruleFor(p.attendee_type),
      }))
      .sort((a, b) => {
        if (a.rule.priority !== b.rule.priority)
          return a.rule.priority - b.rule.priority;
        return (a.p.created_at ?? "").localeCompare(b.p.created_at ?? "");
      });

    // 7) Build per-zone row indexes of available seats
    const seatsByZoneRow = new Map<string, Seat[]>(); // key = zoneId|rowLabel
    for (const s of seats) {
      if (!s.is_active) continue;
      const k = `${s.zone_id}|${s.row_label}`;
      if (!seatsByZoneRow.has(k)) seatsByZoneRow.set(k, []);
      seatsByZoneRow.get(k)!.push(s);
    }
    for (const arr of seatsByZoneRow.values()) {
      arr.sort((a, b) => a.col_index - b.col_index);
    }

    function seatAllowed(s: Seat, rule: Rule): boolean {
      if (!s.is_active) return false;
      if (taken.has(s.id)) return false;
      if (rule.avoid_categories.includes(s.default_category)) return false;
      return true;
    }

    function findConsecutive(
      rule: Rule,
      groupSize: number,
    ): Seat[] | null {
      const zoneOrder =
        rule.preferred_zone_ids.length > 0
          ? rule.preferred_zone_ids
          : Array.from(zoneById.keys());
      for (const zoneId of zoneOrder) {
        for (const [k, arr] of seatsByZoneRow) {
          if (!k.startsWith(`${zoneId}|`)) continue;
          // sliding window of valid contiguous seats
          let run: Seat[] = [];
          for (const s of arr) {
            if (seatAllowed(s, rule)) {
              if (run.length === 0 || s.col_index === run[run.length - 1].col_index + 1) {
                run.push(s);
              } else {
                run = [s];
              }
              if (run.length >= groupSize) return run.slice(0, groupSize);
            } else {
              run = [];
            }
          }
        }
      }
      return null;
    }

    function findAny(rule: Rule, count: number): Seat[] {
      const out: Seat[] = [];
      const zoneOrder =
        rule.preferred_zone_ids.length > 0
          ? rule.preferred_zone_ids
          : Array.from(zoneById.keys());
      for (const zoneId of zoneOrder) {
        for (const [k, arr] of seatsByZoneRow) {
          if (!k.startsWith(`${zoneId}|`)) continue;
          for (const s of arr) {
            if (seatAllowed(s, rule)) {
              out.push(s);
              if (out.length >= count) return out;
            }
          }
        }
      }
      return out;
    }

    // 8) Assign
    type Item = {
      participant_id: string;
      seat_id: string | null;
      zone_id: string | null;
      zone_name: string | null;
      row_label: string | null;
      seat_number: string | null;
      reason: string | null;
      is_companion: boolean;
      companion_index: number | null;
      unassigned_reason: string | null;
    };
    const items: Item[] = [];
    let assigned = 0;
    let unassigned = 0;

    for (const { p, rule } of queue) {
      const groupSize = 1 + (p.companions_count ?? 0);
      let pick: Seat[] | null = null;
      let reason = "";
      if (rule.keep_companions_together && groupSize > 1) {
        pick = findConsecutive(rule, groupSize);
        if (pick) reason = `Grupo de ${groupSize} consecutivos en zona ${pick[0].zone_name}`;
      }
      if (!pick && (groupSize === 1 || rule.allow_split_if_full)) {
        const any = findAny(rule, groupSize);
        if (any.length === groupSize) {
          pick = any;
          reason =
            groupSize > 1
              ? `Grupo separado por falta de consecutivos`
              : `Asiento individual en zona ${any[0].zone_name}`;
        }
      }

      if (!pick) {
        items.push({
          participant_id: p.id,
          seat_id: null,
          zone_id: null,
          zone_name: null,
          row_label: null,
          seat_number: null,
          reason: null,
          is_companion: false,
          companion_index: null,
          unassigned_reason: `Sin butacas disponibles para ${groupSize} (tipo ${p.attendee_type})`,
        });
        unassigned += groupSize;
        continue;
      }

      pick.forEach((s, idx) => {
        taken.add(s.id);
        items.push({
          participant_id: p.id,
          seat_id: s.id,
          zone_id: s.zone_id,
          zone_name: s.zone_name,
          row_label: s.row_label,
          seat_number: s.seat_number,
          reason: idx === 0 ? reason : null,
          is_companion: idx > 0,
          companion_index: idx > 0 ? idx : null,
          unassigned_reason: null,
        });
      });
      assigned += groupSize;
    }

    // 9) Persist proposal + items
    const totalPeople = assigned + unassigned;
    const summary = {
      by_attendee_type: queue.reduce<Record<string, number>>((acc, q) => {
        acc[q.p.attendee_type] = (acc[q.p.attendee_type] ?? 0) + 1;
        return acc;
      }, {}),
      locked_count: (parts ?? []).filter((p) => p.seat_locked).length,
    };

    const { data: proposal, error: insErr } = await context.supabase
      .from("assignment_proposals")
      .insert({
        session_id: data.session_id,
        plan_id: session.venue_plan_id,
        status: "draft",
        total_participants: totalPeople,
        total_assigned: assigned,
        total_unassigned: unassigned,
        summary,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    if (items.length > 0) {
      const rows = items.map((it) => ({ ...it, proposal_id: proposal.id }));
      const { error: itemsErr } = await context.supabase
        .from("assignment_proposal_items")
        .insert(rows);
      if (itemsErr) throw new Error(itemsErr.message);
    }

    await context.supabase.rpc("log_audit", {
      _action: "assignment.proposal_generate",
      _entity_type: "assignment_proposal",
      _entity_id: proposal.id,
      _event_id: session.event_id,
      _session_id: session.id,
      _changes: { total_assigned: assigned, total_unassigned: unassigned },
    });

    return {
      proposal_id: proposal.id,
      total_assigned: assigned,
      total_unassigned: unassigned,
    };
  });

export const listProposalsForSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ session_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assignment_proposals")
      .select("*")
      .eq("session_id", data.session_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProposalDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ proposal_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: proposal, error: pErr }, { data: items, error: iErr }] =
      await Promise.all([
        context.supabase
          .from("assignment_proposals")
          .select("*")
          .eq("id", data.proposal_id)
          .single(),
        context.supabase
          .from("assignment_proposal_items")
          .select("*")
          .eq("proposal_id", data.proposal_id),
      ]);
    if (pErr) throw new Error(pErr.message);
    if (iErr) throw new Error(iErr.message);

    type ParticipantHydrated = {
      id: string;
      attendee_type: string;
      companions_count: number;
      first_name: string | null;
      last_name: string | null;
      dni: string | null;
    };
    // Hydrate participant names
    const partIds = Array.from(
      new Set((items ?? []).map((i) => i.participant_id)),
    );
    const { data: parts } = partIds.length
      ? await context.supabase
          .from("event_participants")
          .select(
            "id, attendee_type, companions_count, people!inner(first_name, last_name, dni)",
          )
          .in("id", partIds)
      : { data: [] as never[] };
    const pMap = new Map<string, ParticipantHydrated>(
      (parts ?? []).map((p) => {
        const person = (p as { people?: { first_name?: string; last_name?: string; dni?: string } }).people;
        return [
          p.id,
          {
            id: p.id,
            attendee_type: p.attendee_type as string,
            companions_count: p.companions_count as number,
            first_name: person?.first_name ?? null,
            last_name: person?.last_name ?? null,
            dni: person?.dni ?? null,
          },
        ];
      }),
    );

    return {
      proposal,
      items: (items ?? []).map((it) => ({
        ...it,
        participant: pMap.get(it.participant_id) ?? null,
      })),
    };
  });

export const applyProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ proposal_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [...ADMIN_ROLES]);

    const { data: proposal, error: pErr } = await context.supabase
      .from("assignment_proposals")
      .select("id, session_id, status")
      .eq("id", data.proposal_id)
      .single();
    if (pErr) throw new Error(pErr.message);
    if (proposal.status !== "draft")
      throw new Error("La propuesta ya no está en borrador");

    const { data: items, error: iErr } = await context.supabase
      .from("assignment_proposal_items")
      .select(
        "participant_id, zone_name, row_label, seat_number, is_companion",
      )
      .eq("proposal_id", data.proposal_id)
      .eq("is_companion", false)
      .not("seat_id", "is", null);
    if (iErr) throw new Error(iErr.message);

    let updates = 0;
    for (const it of items ?? []) {
      const { error } = await context.supabase
        .from("event_participants")
        .update({
          seat_zone: it.zone_name,
          seat_row: it.row_label,
          seat_number: it.seat_number,
          seat_locked: true,
        })
        .eq("id", it.participant_id);
      if (error) throw new Error(error.message);
      updates++;
    }

    await context.supabase
      .from("assignment_proposals")
      .update({
        status: "applied",
        applied_by: context.userId,
        applied_at: new Date().toISOString(),
      })
      .eq("id", data.proposal_id);

    await context.supabase.rpc("log_audit", {
      _action: "assignment.proposal_apply",
      _entity_type: "assignment_proposal",
      _entity_id: data.proposal_id,
      _session_id: proposal.session_id,
      _changes: { updated: updates },
    });

    return { applied: updates };
  });

export const discardProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ proposal_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [...ADMIN_ROLES]);
    const { error } = await context.supabase
      .from("assignment_proposals")
      .update({ status: "discarded" })
      .eq("id", data.proposal_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });