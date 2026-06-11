import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const duplicateSchema = z.object({
  session_id: z.string().uuid(),
  name: z.string().trim().min(1).max(150),
  starts_at: z.string().min(1),
  ends_at: z.string().nullable().optional(),
  copy_assignments: z.boolean().default(true),
});

export const duplicateSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => duplicateSchema.parse(d))
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