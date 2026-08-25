import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminRole, requireRole } from "./role-guards";

export const duplicateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    session_id: z.string().uuid(),
    name: z.string().trim().min(1).max(150),
    starts_at: z.string().min(1),
    ends_at: z.string().nullable().optional(),
    copy_assignments: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: src, error: srcErr } = await supabaseAdmin
      .from("event_sessions")
      .select("*")
      .eq("id", data.session_id)
      .maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("Sesión origen no encontrada");

    const {
      id: _id,
      created_at: _ca,
      updated_at: _ua,
      ...rest
    } = src as Record<string, unknown> & { id: string; created_at: string; updated_at: string };

    const insertPayload = {
      ...rest,
      name: data.name,
      starts_at: data.starts_at,
      ends_at: data.ends_at ?? null,
      status: "programada",
    };

    const { data: created, error: insErr } = await supabaseAdmin
      .from("event_sessions")
      .insert(insertPayload as never)
      .select("id, event_id")
      .single();
    if (insErr) throw new Error(insErr.message);

    let copiedAssignments = 0;
    if (data.copy_assignments) {
      const { data: assignments } = await supabaseAdmin
        .from("event_assignments")
        .select("event_id, user_id, client_id, role, session_id")
        .eq("event_id", src.event_id)
        .or(`session_id.eq.${src.id},session_id.is.null`);
      const sessionScoped = (assignments ?? []).filter((a) => a.session_id === src.id);
      if (sessionScoped.length > 0) {
        const rows = sessionScoped.map((a) => ({
          event_id: a.event_id,
          user_id: a.user_id,
          client_id: a.client_id,
          role: a.role,
          session_id: created.id,
        }));
        const { error: assignErr } = await supabaseAdmin
          .from("event_assignments")
          .insert(rows as never);
        if (assignErr) throw new Error(assignErr.message);
        copiedAssignments = rows.length;
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      action: "session.duplicate",
      entity_type: "event_session",
      entity_id: created.id,
      actor_id: context.userId,
      event_id: src.event_id,
      session_id: created.id,
      changes: { source_session_id: src.id, copied_assignments: copiedAssignments },
    } as never);

    return { ok: true, session_id: created.id, copied_assignments: copiedAssignments };
  });

export const saveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    values: z.object({
      event_id: z.string().uuid(),
      name: z.string().trim().min(1).max(200),
      description: z.string().max(1000).nullable(),
      doors_open_at: z.string().datetime({ offset: true }).nullable(),
      starts_at: z.string().datetime({ offset: true }),
      ends_at: z.string().datetime({ offset: true }).nullable(),
      location_name: z.string().max(300).nullable(),
      location_address: z.string().max(500).nullable(),
      capacity: z.number().int().positive(),
      max_validators: z.number().int().min(1).max(100),
      public_form_enabled: z.boolean(),
      user_selectable: z.boolean(),
      waitlist_enabled: z.boolean(),
      allow_companions: z.boolean(),
      max_companions_per_participant: z.number().int().min(0).max(20),
      companions_qr_mode: z.enum(["mismo_qr", "qr_propio"]),
      min_age: z.number().int().min(0).max(120),
      specific_instructions: z.string().max(2000).nullable(),
      status: z.enum(["programada", "abierta", "cerrada", "cancelada", "completada"]),
      inherit_event_fields: z.boolean(),
      field_requirements: z.record(z.unknown()),
      venue_plan_id: z.string().uuid().nullable(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);

    if (!isAdminRole(roles)) {
      const { data: allowed, error: assignmentError } = await context.supabase
        .from("event_assignments")
        .select("id")
        .eq("event_id", data.values.event_id)
        .eq("user_id", context.userId)
        .eq("role", "coordinador")
        .limit(1);
      if (assignmentError) throw new Error(`No se pudo comprobar la asignación: ${assignmentError.message}`);
      if (!allowed?.length) throw new Error("No tienes asignación de coordinador para este evento");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { data: current, error: currentError } = await supabaseAdmin
        .from("event_sessions")
        .select("id, event_id")
        .eq("id", data.id)
        .maybeSingle();
      if (currentError) throw new Error(currentError.message);
      if (!current) throw new Error("Sesión no encontrada");
      if (current.event_id !== data.values.event_id) throw new Error("La sesión no pertenece al evento indicado");
      const { data: saved, error } = await supabaseAdmin
        .from("event_sessions")
        .update(data.values as never)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return saved;
    }

    const { data: saved, error } = await supabaseAdmin
      .from("event_sessions")
      .insert(data.values as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });