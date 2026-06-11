import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const ATTENDEE = z.enum([
  "publico",
  "figurante",
  "casting",
  "vip",
  "prensa",
  "equipo",
  "acompanante",
  "otro",
]);

const FORM_STATUS = z.enum(["borrador", "publicado", "cerrado", "archivado"]);

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export const listEventForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("public_forms")
      .select("id, slug, title, attendee_type, status, session_id, opens_at, closes_at, created_at, event_sessions(name)")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createPublicForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        event_id: z.string().uuid(),
        session_id: z.string().uuid().nullable().optional(),
        attendee_type: ATTENDEE,
        title: z.string().trim().min(1).max(150),
        slug: z.string().trim().max(120).optional(),
        status: FORM_STATUS.default("publicado"),
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

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("slug")
      .eq("id", data.event_id)
      .maybeSingle();
    const base =
      data.slug && data.slug.length > 0
        ? slugify(data.slug)
        : slugify(`${ev?.slug ?? "evento"}-${data.attendee_type}`);
    let slug = base;
    for (let i = 2; i < 100; i++) {
      const { data: exists } = await supabaseAdmin
        .from("public_forms")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!exists) break;
      slug = `${base}-${i}`;
    }

    const { data: created, error } = await supabaseAdmin
      .from("public_forms")
      .insert({
        event_id: data.event_id,
        session_id: data.session_id ?? null,
        attendee_type: data.attendee_type,
        title: data.title,
        slug,
        status: data.status,
        fields_schema: [],
      } as never)
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id, slug: created.slug };
  });

export const updatePublicForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(150).optional(),
        status: FORM_STATUS.optional(),
        attendee_type: ATTENDEE.optional(),
        session_id: z.string().uuid().nullable().optional(),
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
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.status !== undefined) patch.status = data.status;
    if (data.attendee_type !== undefined) patch.attendee_type = data.attendee_type;
    if (data.session_id !== undefined) patch.session_id = data.session_id;
    const { error } = await supabaseAdmin
      .from("public_forms")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePublicForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("public_forms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPublicFormBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: form } = await supabaseAdmin
      .from("public_forms")
      .select("id, slug, title, description, attendee_type, status, event_id, session_id, opens_at, closes_at")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!form) return { ok: false as const, code: "no_existe" as const };
    const now = new Date();
    if (form.status !== "publicado") return { ok: false as const, code: "no_publicado" as const };
    if (form.opens_at && new Date(form.opens_at) > now) return { ok: false as const, code: "no_abierto" as const };
    if (form.closes_at && new Date(form.closes_at) < now) return { ok: false as const, code: "cerrado" as const };

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, slug, name, brand_color, status, requires_image_consent, requires_recording, public_registration_enabled, user_can_choose_session, default_min_age, default_allow_companions, default_max_companions, default_waitlist_enabled")
      .eq("id", form.event_id)
      .maybeSingle();
    if (!event) return { ok: false as const, code: "no_existe" as const };

    let sessions: Array<Record<string, unknown>> = [];
    if (form.session_id) {
      const { data: s } = await supabaseAdmin
        .from("event_sessions")
        .select("*")
        .eq("id", form.session_id);
      sessions = s ?? [];
    } else {
      const { data: s } = await supabaseAdmin
        .from("event_sessions")
        .select("*")
        .eq("event_id", form.event_id)
        .order("starts_at", { ascending: true });
      sessions = s ?? [];
    }
    return { ok: true as const, form, event, sessions };
  });