import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const promoteSchema = z.object({
  sessionId: z.string().uuid(),
  venueName: z.string().trim().min(1),
  city: z.string().trim().optional().nullable(),
  planName: z.string().trim().min(1),
  linkToSession: z.boolean().optional().default(true),
});

export const promoteSessionOverridesToVenuePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promoteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdminRes } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdminRes) throw new Error("forbidden");

    // Load overrides
    const { data: overrides, error: oErr } = await supabase
      .from("session_seat_overrides")
      .select("seat_zone, seat_row, seat_number, category, color")
      .eq("session_id", data.sessionId);
    if (oErr) throw new Error(oErr.message);
    if (!overrides || overrides.length === 0) {
      throw new Error("La sesión no tiene butacas dibujadas para promover.");
    }

    const cityNorm = (data.city ?? "").trim() || null;

    // Find or create venue (case-insensitive by name + city)
    const { data: existingVenues, error: vErr } = await supabase
      .from("venues")
      .select("id, name, city");
    if (vErr) throw new Error(vErr.message);
    const match = (existingVenues ?? []).find(
      (v) =>
        v.name.toLowerCase().trim() === data.venueName.toLowerCase().trim() &&
        ((v.city ?? "").toLowerCase().trim() === (cityNorm ?? "").toLowerCase().trim()),
    );
    let venueId: string;
    if (match) {
      venueId = match.id;
    } else {
      const { data: newVenue, error: nvErr } = await supabase
        .from("venues")
        .insert({ name: data.venueName, city: cityNorm })
        .select("id")
        .single();
      if (nvErr) throw new Error(`No se pudo crear el recinto: ${nvErr.message}`);
      venueId = newVenue.id;
    }

    // Create plan
    const { data: newPlan, error: pErr } = await supabase
      .from("venue_plans")
      .insert({ venue_id: venueId, name: data.planName, is_active: true, version: 1 })
      .select("id")
      .single();
    if (pErr) throw new Error(`No se pudo crear el plano: ${pErr.message}`);
    const planId = newPlan.id;

    // Build zones from unique seat_zone values
    const zoneNames = Array.from(new Set(overrides.map((o) => (o.seat_zone ?? "General").trim() || "General")));
    const palette = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
    const zonesToInsert = zoneNames.map((n, i) => ({
      plan_id: planId,
      name: n,
      color: palette[i % palette.length],
      display_order: i,
    }));
    const { data: insertedZones, error: izErr } = await supabase
      .from("venue_zones")
      .insert(zonesToInsert)
      .select("id, name");
    if (izErr) throw new Error(`Error creando zonas: ${izErr.message}`);
    const zoneByName = new Map<string, string>((insertedZones ?? []).map((z) => [z.name, z.id]));

    // Build seats. Compute row_index per zone by sorted distinct row labels; col_index incrementally.
    const VALID_CATS = new Set([
      "libre",
      "reservado_camaras",
      "bloqueado",
      "movilidad_reducida",
      "acompanante_mr",
      "visibilidad_reducida",
    ]);

    // Deduplicate by (zone,row,number) — last wins
    const dedup = new Map<string, typeof overrides[number] & { _zone: string }>();
    for (const o of overrides) {
      const zone = (o.seat_zone ?? "General").trim() || "General";
      const row = (o.seat_row ?? "").trim();
      const num = (o.seat_number ?? "").trim();
      if (!row || !num) continue;
      dedup.set(`${zone}|${row}|${num}`, { ...o, _zone: zone });
    }

    // Group by zone for index computation
    const byZone = new Map<string, Array<{ row: string; num: string; cat: string }>>();
    for (const o of dedup.values()) {
      const cat = VALID_CATS.has(String(o.category)) ? String(o.category) : "libre";
      const arr = byZone.get(o._zone) ?? [];
      arr.push({ row: (o.seat_row ?? "").trim(), num: (o.seat_number ?? "").trim(), cat });
      byZone.set(o._zone, arr);
    }

    const seatRows: Array<{
      plan_id: string;
      zone_id: string;
      row_label: string;
      seat_number: string;
      default_category: string;
      is_active: boolean;
      row_index: number;
      col_index: number;
    }> = [];
    for (const [zoneName, seats] of byZone.entries()) {
      const zoneId = zoneByName.get(zoneName)!;
      const rowLabels = Array.from(new Set(seats.map((s) => s.row))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
      const rowIdx = new Map(rowLabels.map((l, i) => [l, i] as const));
      const colCounters = new Map<string, number>();
      // Sort seats inside each row by numeric number for stable col index
      const sortedSeats = [...seats].sort((a, b) => {
        const ri = (rowIdx.get(a.row) ?? 0) - (rowIdx.get(b.row) ?? 0);
        if (ri !== 0) return ri;
        return a.num.localeCompare(b.num, undefined, { numeric: true });
      });
      for (const s of sortedSeats) {
        const ri = rowIdx.get(s.row) ?? 0;
        const key = `${zoneId}|${s.row}`;
        const c = colCounters.get(key) ?? 0;
        colCounters.set(key, c + 1);
        seatRows.push({
          plan_id: planId,
          zone_id: zoneId,
          row_label: s.row,
          seat_number: s.num,
          default_category: s.cat,
          is_active: true,
          row_index: ri,
          col_index: c,
        });
      }
    }

    // Insert in batches
    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < seatRows.length; i += batchSize) {
      const slice = seatRows.slice(i, i + batchSize);
      const { error } = await supabase.from("venue_seats").insert(slice);
      if (error) throw new Error(`Error insertando butacas: ${error.message}`);
      inserted += slice.length;
    }

    if (data.linkToSession) {
      const { error: linkErr } = await supabase
        .from("event_sessions")
        .update({ venue_plan_id: planId })
        .eq("id", data.sessionId);
      if (linkErr) throw new Error(`Plano creado pero no se pudo vincular a la sesión: ${linkErr.message}`);
    }

    await supabase.rpc("log_audit", {
      _action: "venue_plan.promote_from_session",
      _entity_type: "venue_plan",
      _entity_id: planId,
      _session_id: data.sessionId,
      _changes: { venue_id: venueId, seats_created: inserted },
    });

    return { venuePlanId: planId, venueId, seatsCreated: inserted };
  });

const bulkAssignSchema = z.object({
  planId: z.string().uuid(),
  sessionIds: z.array(z.string().uuid()).min(1),
});

export const bulkAssignVenuePlanToSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkAssignSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdminRes } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdminRes) throw new Error("forbidden");

    const { error } = await supabase
      .from("event_sessions")
      .update({ venue_plan_id: data.planId })
      .in("id", data.sessionIds);
    if (error) throw new Error(error.message);

    await supabase.rpc("log_audit", {
      _action: "venue_plan.bulk_assign",
      _entity_type: "venue_plan",
      _entity_id: data.planId,
      _changes: { session_ids: data.sessionIds },
    });

    return { ok: true, updated: data.sessionIds.length };
  });