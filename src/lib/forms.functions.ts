import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";
import { attendeeSchema, formStatusSchema } from "./forms-schemas";
import { slugifyForm } from "./forms.server";

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
      .select("id, slug, title, attendee_type, status, closed_for_capacity, session_id, opens_at, closes_at, created_at, intro_text, header_image_url, field_config, requires_image_consent, offers_future_processes_consent, event_sessions(name)")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const duplicatePublicForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
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

    const { data: original } = await supabaseAdmin
      .from("public_forms")
      .select("event_id, session_id, attendee_type, title, status, intro_text, header_image_url, field_config, requires_image_consent, offers_future_processes_consent, opens_at, closes_at")
      .eq("id", data.id)
      .maybeSingle();
    if (!original) throw new Error("Formulario no encontrado");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("slug")
      .eq("id", original.event_id)
      .maybeSingle();
    const base = slugifyForm(`${ev?.slug ?? "evento"}-${original.attendee_type}-copia`);
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
        event_id: original.event_id,
        session_id: data.session_id !== undefined ? data.session_id : original.session_id,
        attendee_type: original.attendee_type,
        title: `${original.title} (copia)`,
        slug,
        status: original.status ?? "borrador",
        intro_text: original.intro_text,
        header_image_url: original.header_image_url,
        field_config: original.field_config,
        requires_image_consent: original.requires_image_consent,
        offers_future_processes_consent: original.offers_future_processes_consent,
        opens_at: original.opens_at,
        closes_at: original.closes_at,
        fields_schema: [],
      } as never)
      .select("id, slug")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id, slug: created.slug };
  });

export const createPublicForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        event_id: z.string().uuid(),
        session_id: z.string().uuid().nullable().optional(),
        attendee_type: attendeeSchema,
        title: z.string().trim().min(1).max(150),
        slug: z.string().trim().max(120).optional(),
        status: formStatusSchema.default("publicado"),
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
        ? slugifyForm(data.slug)
        : slugifyForm(`${ev?.slug ?? "evento"}-${data.attendee_type}`);
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
        status: formStatusSchema.optional(),
        attendee_type: attendeeSchema.optional(),
        session_id: z.string().uuid().nullable().optional(),
        intro_text: z.string().trim().max(2000).nullable().optional(),
        header_image_url: z.string().trim().max(500).nullable().optional(),
        field_config: z.record(z.string(), z.any()).optional(),
        requires_image_consent: z.boolean().optional(),
        offers_future_processes_consent: z.boolean().optional(),
        closed_for_capacity: z.boolean().optional(),
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
    if (data.intro_text !== undefined) patch.intro_text = data.intro_text;
    if (data.header_image_url !== undefined) patch.header_image_url = data.header_image_url;
    if (data.field_config !== undefined) patch.field_config = data.field_config;
    if (data.requires_image_consent !== undefined) patch.requires_image_consent = data.requires_image_consent;
    if (data.offers_future_processes_consent !== undefined) patch.offers_future_processes_consent = data.offers_future_processes_consent;
    if (data.closed_for_capacity !== undefined) patch.closed_for_capacity = data.closed_for_capacity;
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
    // Reintento en el servidor ante fallos transitorios (timeouts, 5xx del Worker/PostgREST).
    // Reduce muchísimo la aparición de la pantalla "Error temporal" en picos de tráfico.
    async function withRetry<T>(phase: string, fn: () => PromiseLike<T>): Promise<T> {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await Promise.resolve(fn());
        } catch (err) {
          lastErr = err;
          console.warn(`[getPublicFormBySlug] retry ${attempt + 1} phase=${phase} slug=${data.slug}`, err);
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        }
      }
      throw lastErr;
    }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: form, error: formErr } = await withRetry("form", () =>
        supabaseAdmin
          .from("public_forms")
          .select("id, slug, title, description, intro_text, header_image_url, field_config, attendee_type, status, closed_for_capacity, event_id, session_id, opens_at, closes_at, requires_image_consent, offers_future_processes_consent")
          .eq("slug", data.slug)
          .maybeSingle(),
      );
      if (formErr) {
        console.error("[getPublicFormBySlug] form lookup error", { slug: data.slug, formErr });
        return { ok: false as const, code: "error_temporal" as const };
      }
      if (!form) return { ok: false as const, code: "no_existe" as const };
    const now = new Date();
    if ((form as { closed_for_capacity?: boolean }).closed_for_capacity) {
      return { ok: false as const, code: "aforo_completo" as const };
    }
    if (form.status !== "publicado") return { ok: false as const, code: "no_publicado" as const };
    if (form.opens_at && new Date(form.opens_at) > now) return { ok: false as const, code: "no_abierto" as const };
    if (form.closes_at && new Date(form.closes_at) < now) return { ok: false as const, code: "cerrado" as const };

    const sessSelect = "id, name, starts_at, ends_at, capacity, status, location_name, user_selectable, min_age, allow_companions, max_companions_per_participant, waitlist_enabled";
    type SessionRow = {
      id: string; name: string; starts_at: string; ends_at: string | null;
      capacity: number; status: string; location_name: string | null;
      user_selectable: boolean; min_age: number | null; allow_companions: boolean | null;
      max_companions_per_participant: number | null; waitlist_enabled: boolean | null;
    };

    // Las tres lecturas restantes son independientes: en paralelo reducimos la
    // latencia total y con ello la probabilidad de caer en "Error temporal".
    const [eventRes, sessionsRes, privacyRes] = await Promise.all([
      withRetry("event", () =>
        supabaseAdmin
          .from("events")
          .select("id, slug, name, brand_color, status, requires_image_consent, requires_recording, public_registration_enabled, user_can_choose_session, default_min_age, default_allow_companions, default_max_companions, default_waitlist_enabled")
          .eq("id", form.event_id)
          .maybeSingle(),
      ),
      withRetry("sessions", () => {
        if (form.session_id) {
          return supabaseAdmin.from("event_sessions").select(sessSelect).eq("id", form.session_id);
        }
        return supabaseAdmin
          .from("event_sessions")
          .select(sessSelect)
          .eq("event_id", form.event_id)
          .order("starts_at", { ascending: true });
      }),
      withRetry("legal", () =>
        supabaseAdmin
          .from("legal_texts")
          .select("id, title, version, body, effective_from")
          .eq("kind", "privacidad")
          .eq("is_active", true)
          .order("effective_from", { ascending: true }),
      ),
    ]);

    if (eventRes.error) {
      console.error("[getPublicFormBySlug] event lookup error", { slug: data.slug, err: eventRes.error });
      return { ok: false as const, code: "error_temporal" as const };
    }
    if (!eventRes.data) return { ok: false as const, code: "no_existe" as const };
    const event = eventRes.data;
    const sessions = (sessionsRes.data ?? []) as SessionRow[];
    const privacyRows = privacyRes.data;
    const privacyTexts = (privacyRows ?? []) as Array<{
      id: string; title: string; version: string; body: string; effective_from: string;
    }>;
      return { ok: true as const, form, event, sessions, privacyTexts };
    } catch (err) {
      console.error("[getPublicFormBySlug] unexpected error", { slug: data.slug, err });
      return { ok: false as const, code: "error_temporal" as const };
    }
  });