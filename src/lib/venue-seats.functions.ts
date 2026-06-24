import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VALID_CATEGORIES = [
  "libre",
  "reservado_camaras",
  "bloqueado",
  "movilidad_reducida",
  "acompanante_mr",
  "visibilidad_reducida",
] as const;

const rowSchema = z.object({
  zona: z.string().trim().min(1),
  fila: z.string().trim().min(1),
  numero: z.string().trim().min(1),
  categoria: z.string().trim().optional().default("libre"),
  row_index: z.coerce.number().int().nonnegative().optional(),
  col_index: z.coerce.number().int().nonnegative().optional(),
  activo: z.coerce.boolean().optional().default(true),
});

const inputSchema = z.object({
  planId: z.string().uuid(),
  rows: z.array(z.record(z.string(), z.any())),
  replace: z.boolean().optional().default(false),
});

export const importVenueSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify admin
    const { data: isAdminRes } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdminRes) throw new Error("forbidden");

    // Normalize input
    const errors: { row: number; message: string }[] = [];
    const valid: z.infer<typeof rowSchema>[] = [];
    data.rows.forEach((raw, i) => {
      // Normalize headers to lowercase/no accents
      const norm: Record<string, any> = {};
      for (const [k, v] of Object.entries(raw)) {
        const key = String(k).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        norm[key] = v;
      }
      // Map common aliases
      const mapped = {
        zona: norm.zona ?? norm.zone ?? norm.sector,
        fila: norm.fila ?? norm.row ?? norm.row_label,
        numero: norm.numero ?? norm.number ?? norm.seat_number ?? norm.num,
        categoria: norm.categoria ?? norm.category ?? norm.default_category ?? "libre",
        row_index: norm.row_index,
        col_index: norm.col_index,
        activo: norm.activo ?? norm.is_active ?? true,
      };
      const parsed = rowSchema.safeParse(mapped);
      if (!parsed.success) {
        errors.push({ row: i + 2, message: parsed.error.issues.map((x) => x.message).join("; ") });
        return;
      }
      const cat = String(parsed.data.categoria);
      if (!VALID_CATEGORIES.includes(cat as (typeof VALID_CATEGORIES)[number])) {
        errors.push({ row: i + 2, message: `Categoría inválida: ${cat}` });
        return;
      }
      valid.push({ ...parsed.data, categoria: cat });
    });

    if (data.replace) {
      const { error } = await supabase.from("venue_seats").delete().eq("plan_id", data.planId);
      if (error) throw new Error(`No se pudo limpiar el plano: ${error.message}`);
    }

    // Ensure all zones exist
    const zoneNames = Array.from(new Set(valid.map((r) => r.zona)));
    const { data: existingZones, error: zErr } = await supabase
      .from("venue_zones")
      .select("id, name")
      .eq("plan_id", data.planId);
    if (zErr) throw new Error(zErr.message);
    const zoneByName = new Map<string, string>((existingZones ?? []).map((z) => [z.name, z.id]));
    const missing = zoneNames.filter((n) => !zoneByName.has(n));
    if (missing.length) {
      const palette = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
      const toInsert = missing.map((n, i) => ({
        plan_id: data.planId,
        name: n,
        color: palette[(zoneByName.size + i) % palette.length],
        display_order: zoneByName.size + i,
      }));
      const { data: inserted, error: insZErr } = await supabase
        .from("venue_zones")
        .insert(toInsert)
        .select("id, name");
      if (insZErr) throw new Error(`Error creando zonas: ${insZErr.message}`);
      (inserted ?? []).forEach((z) => zoneByName.set(z.name, z.id));
    }

    // Deduplicate by (zone, row, number) - last wins
    const dedup = new Map<string, (typeof valid)[number]>();
    valid.forEach((r) => dedup.set(`${r.zona}|${r.fila}|${r.numero}`, r));

    // Auto-compute row/col indices when missing: group by row_label per zone
    const seatsToUpsert = Array.from(dedup.values()).map((r) => {
      const zoneId = zoneByName.get(r.zona)!;
      return {
        plan_id: data.planId,
        zone_id: zoneId,
        row_label: r.fila,
        seat_number: r.numero,
        default_category: r.categoria,
        is_active: r.activo,
        row_index: r.row_index ?? 0,
        col_index: r.col_index ?? 0,
      };
    });

    // Auto-assign indices when zeros: per zone, group by row_label
    const needsAuto = seatsToUpsert.some((s) => s.row_index === 0 && s.col_index === 0);
    if (needsAuto) {
      const byZone = new Map<string, typeof seatsToUpsert>();
      seatsToUpsert.forEach((s) => {
        const arr = byZone.get(s.zone_id) ?? [];
        arr.push(s);
        byZone.set(s.zone_id, arr);
      });
      byZone.forEach((arr) => {
        const rowLabels = Array.from(new Set(arr.map((s) => s.row_label))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const rowIdx = new Map(rowLabels.map((l, i) => [l, i] as const));
        const colCounters = new Map<string, number>();
        arr.forEach((s) => {
          if (s.row_index === 0 && s.col_index === 0) {
            s.row_index = rowIdx.get(s.row_label) ?? 0;
            const key = `${s.zone_id}|${s.row_label}`;
            const c = colCounters.get(key) ?? 0;
            s.col_index = c;
            colCounters.set(key, c + 1);
          }
        });
      });
    }

    // Upsert in batches
    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < seatsToUpsert.length; i += batchSize) {
      const slice = seatsToUpsert.slice(i, i + batchSize);
      const { error } = await supabase
        .from("venue_seats")
        .upsert(slice, { onConflict: "plan_id,zone_id,row_label,seat_number" });
      if (error) throw new Error(`Error en butacas: ${error.message}`);
      inserted += slice.length;
    }

    return {
      ok: true,
      total_rows: data.rows.length,
      inserted,
      zones_created: missing.length,
      errors,
    };
  });