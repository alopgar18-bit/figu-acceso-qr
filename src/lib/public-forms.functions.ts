import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Single-round-trip atomic submit: all validation + inserts happen in one
// Postgres transaction with a per-session row lock, so the endpoint can
// absorb thousands of concurrent submissions without race conditions or
// connection-pool exhaustion.
async function callSubmitRpc(payload: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc("submit_public_form", {
    _payload: payload as never,
  });
  if (error) throw error;
  return data as
    | { ok: true; code: "recibida" | "lista_espera"; participantId: string }
    | { ok: false; code: string; minAge?: number };
}

const submitSchema = z.object({
  slug: z.string().min(1).max(120),
  sessionId: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(150),
  dni: z.string().trim().max(20).regex(/^[A-Za-z0-9\-]*$/).optional().nullable().or(z.literal("")),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).optional().nullable().or(z.literal("")),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  photoPath: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  socialMedia: z.string().trim().max(500).optional().nullable().or(z.literal("")),
  city: z.string().trim().max(120).optional().nullable(),
  province: z.string().trim().max(120).optional().nullable(),
  gender: z.string().trim().max(40).optional().nullable(),
  profession: z.string().trim().max(150).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  specialNeeds: z.string().trim().max(1000).optional().nullable(),
  companionsCount: z.number().int().min(0).max(50).default(0),
  companions: z
    .array(
      z.object({
        firstName: z.string().trim().max(100).optional().nullable().or(z.literal("")),
        lastName: z.string().trim().max(150).optional().nullable().or(z.literal("")),
        email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
        phone: z.string().trim().max(30).optional().nullable().or(z.literal("")),
      }),
    )
    .max(50)
    .optional(),
  acceptPrivacy: z.literal(true),
  acceptAttendance: z.literal(true),
  acceptImage: z.boolean().optional(),
  acceptFuture: z.boolean().optional(),
  userAgent: z.string().max(500).optional(),
});

const submitByFormSchema = submitSchema
  .omit({ slug: true })
  .extend({ formSlug: z.string().min(1).max(120) });

function calcAge(birth: string): number {
  const b = new Date(birth);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

async function ensureLegalText(kind: "privacidad" | "imagen" | "futuros_procesos") {
  const { data } = await supabaseAdmin
    .from("legal_texts")
    .select("id")
    .eq("kind", kind)
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) return data.id;
  const titles: Record<string, string> = {
    privacidad: "Política de privacidad",
    imagen: "Consentimiento de cesión de imagen",
    futuros_procesos: "Consentimiento para futuros procesos",
  };
  const { data: created, error } = await supabaseAdmin
    .from("legal_texts")
    .insert({
      kind,
      title: titles[kind],
      version: "1.0",
      body: titles[kind] + " — versión inicial pendiente de redacción por FIGURARTE.",
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function ensureDefaultForm(eventId: string, sessionId: string | null) {
  const { data } = await supabaseAdmin
    .from("public_forms")
    .select("id")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await supabaseAdmin
    .from("public_forms")
    .insert({
      event_id: eventId,
      session_id: sessionId,
      slug: `auto-${eventId.slice(0, 8)}`,
      title: "Formulario público",
      status: "publicado",
      fields_schema: [],
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    return callSubmitRpc({ ...data, eventSlug: data.slug });
  });

export const submitPublicFormBySlug = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitByFormSchema.parse(d))
  .handler(async ({ data }) => {
    return callSubmitRpc(data);
  });
