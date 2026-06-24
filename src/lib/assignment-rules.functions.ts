import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const ADMIN_ROLES = ["superadmin", "admin_figurarte", "coordinador"] as const;

const ATTENDEE_TYPE = z.enum([
  "publico",
  "figurante",
  "casting",
  "vip",
  "prensa",
  "equipo",
  "acompanante",
  "otro",
]);

export const listAssignmentRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ plan_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assignment_rules")
      .select("*")
      .eq("plan_id", data.plan_id)
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertAssignmentRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        plan_id: z.string().uuid(),
        attendee_type: ATTENDEE_TYPE,
        priority: z.number().int().min(1).max(9999).default(100),
        preferred_zone_ids: z.array(z.string().uuid()).default([]),
        avoid_categories: z.array(z.string()).default([]),
        keep_companions_together: z.boolean().default(true),
        allow_split_if_full: z.boolean().default(true),
        notes: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [...ADMIN_ROLES]);
    const payload = {
      plan_id: data.plan_id,
      attendee_type: data.attendee_type,
      priority: data.priority,
      preferred_zone_ids: data.preferred_zone_ids,
      avoid_categories: data.avoid_categories,
      keep_companions_together: data.keep_companions_together,
      allow_split_if_full: data.allow_split_if_full,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("assignment_rules")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("assignment_rules")
      .upsert(payload, { onConflict: "plan_id,attendee_type" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteAssignmentRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [...ADMIN_ROLES]);
    const { error } = await context.supabase
      .from("assignment_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });