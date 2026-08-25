import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const submitSchema = z.object({
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

export const submitByFormSchema = submitSchema
  .omit({ slug: true })
  .extend({ formSlug: z.string().min(1).max(120) });

type SubmissionResult =
  | { ok: true; code: "recibida" | "lista_espera"; participantId: string }
  | { ok: false; code: string; minAge?: number };

export async function submitPublicFormPayload(payload: Record<string, unknown>): Promise<SubmissionResult> {
  const { data, error } = await supabaseAdmin.rpc("submit_public_form", {
    _payload: payload as never,
  });

  if (error) {
    const databaseError = error as { code?: string; message?: string; details?: string };
    const duplicateText = `${databaseError.message ?? ""} ${databaseError.details ?? ""}`.toLowerCase();
    if (databaseError.code === "23505" || duplicateText.includes("duplicate") || duplicateText.includes("duplicado")) {
      return { ok: false, code: "duplicado" };
    }
    throw error;
  }

  return data as SubmissionResult;
}