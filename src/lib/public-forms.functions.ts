import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const submitSchema = z.object({
  slug: z.string().min(1).max(120),
  sessionId: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(150),
  dni: z.string().trim().min(5).max(20).regex(/^[A-Za-z0-9\-]+$/),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(30),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  photoPath: z.string().trim().min(1).max(500),
  socialMedia: z.string().trim().max(500),
  city: z.string().trim().max(120).optional().nullable(),
  province: z.string().trim().max(120).optional().nullable(),
  gender: z.string().trim().max(40).optional().nullable(),
  profession: z.string().trim().max(150).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  specialNeeds: z.string().trim().max(1000).optional().nullable(),
  companionsCount: z.number().int().min(0).max(10).default(0),
  acceptPrivacy: z.literal(true),
  acceptAttendance: z.literal(true),
  acceptImage: z.boolean().optional(),
  acceptFuture: z.boolean().optional(),
  userAgent: z.string().max(500).optional(),
});

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
    // Event lookup
    const { data: event, error: evErr } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("slug", data.slug)
      .eq("status", "publicado")
      .maybeSingle();
    if (evErr) throw evErr;
    if (!event) return { ok: false, code: "evento_no_disponible" as const };
    if (!event.public_registration_enabled) {
      return { ok: false, code: "inscripciones_cerradas" as const };
    }

    // Session resolution
    let sessionId = data.sessionId ?? null;
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from("event_sessions")
      .select("*")
      .eq("event_id", event.id)
      .order("starts_at", { ascending: true });
    if (sessErr) throw sessErr;
    if (!sessions || sessions.length === 0) {
      return { ok: false, code: "inscripciones_cerradas" as const };
    }
    if (event.user_can_choose_session) {
      if (!sessionId) return { ok: false, code: "sesion_requerida" as const };
      if (!sessions.find((s) => s.id === sessionId && s.user_selectable)) {
        return { ok: false, code: "sesion_no_disponible" as const };
      }
    } else {
      sessionId = sessions[0]!.id;
    }
    const session = sessions.find((s) => s.id === sessionId)!;
    if (session.status === "cerrada" || session.status === "cancelada" || session.status === "completada") {
      return { ok: false, code: "inscripciones_cerradas" as const };
    }

    // Age
    const age = calcAge(data.birthDate);
    const minAge = session.min_age || event.default_min_age || 0;
    if (minAge > 0 && age < minAge) {
      return { ok: false, code: "edad_minima_no_cumplida" as const, minAge };
    }

    // Capacity
    const { count: occupied } = await supabaseAdmin
      .from("event_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .in("status", ["solicitud_recibida", "pendiente_revision", "aprobado", "invitacion_enviada", "pendiente_confirmacion", "confirmado", "qr_generado", "acceso_validado"]);
    const full = (occupied ?? 0) >= session.capacity;
    const waitlistEnabled = session.waitlist_enabled ?? event.default_waitlist_enabled;
    if (full && !waitlistEnabled) {
      return { ok: false, code: "sesion_completa" as const };
    }

    // Image consent if required
    const imageRequired = event.requires_image_consent || event.requires_recording;
    if (imageRequired && !data.acceptImage) {
      return { ok: false, code: "consentimiento_imagen_requerido" as const };
    }

    // Person upsert (by email)
    let personId: string;
    const { data: existingPerson } = await supabaseAdmin
      .from("people")
      .select("id")
      .or(`email.eq.${data.email},dni.eq.${data.dni}`)
      .limit(1)
      .maybeSingle();
    if (existingPerson) {
      personId = existingPerson.id;
      await supabaseAdmin
        .from("people")
        .update({
          first_name: data.firstName,
          last_name: data.lastName,
          dni: data.dni,
          email: data.email,
          phone: data.phone,
          birth_date: data.birthDate,
          city: data.city ?? null,
          province: data.province ?? null,
          gender: data.gender ?? null,
        })
        .eq("id", personId);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("people")
        .insert({
          first_name: data.firstName,
          last_name: data.lastName,
          dni: data.dni,
          email: data.email,
          phone: data.phone,
          birth_date: data.birthDate,
          city: data.city ?? null,
          province: data.province ?? null,
          gender: data.gender ?? null,
          source: "formulario_publico",
        })
        .select("id")
        .single();
      if (error) throw error;
      personId = created.id;
    }

    // Duplicate detection on this session
    const { data: dup } = await supabaseAdmin
      .from("event_participants")
      .select("id")
      .eq("session_id", sessionId)
      .eq("person_id", personId)
      .maybeSingle();
    if (dup) return { ok: false, code: "duplicado" as const };

    // Default form + submission
    const formId = await ensureDefaultForm(event.id, sessionId);
    const { data: submission, error: subErr } = await supabaseAdmin
      .from("form_submissions")
      .insert({
        form_id: formId,
        event_id: event.id,
        session_id: sessionId,
        person_id: personId,
        payload: {
          profession: data.profession ?? null,
          social_media: data.socialMedia,
          special_needs: data.specialNeeds ?? null,
          notes: data.notes ?? null,
          companions_count: data.companionsCount,
          photo_path: data.photoPath,
        },
        user_agent: data.userAgent ?? null,
      })
      .select("id")
      .single();
    if (subErr) throw subErr;

    // Participant
    const participantStatus = full && waitlistEnabled ? "lista_espera" : "pendiente_revision";
    const { data: participant, error: partErr } = await supabaseAdmin
      .from("event_participants")
      .insert({
        event_id: event.id,
        session_id: sessionId,
        person_id: personId,
        submission_id: submission.id,
        status: participantStatus,
        attendee_type: "publico",
        companions_count: data.companionsCount,
        internal_notes: data.specialNeeds ?? null,
      })
      .select("id")
      .single();
    if (partErr) throw partErr;

    // Consents
    const consents: Array<{ kind: "privacidad" | "imagen" | "futuros_procesos"; accepted: boolean }> = [
      { kind: "privacidad", accepted: data.acceptPrivacy },
    ];
    if (imageRequired) consents.push({ kind: "imagen", accepted: !!data.acceptImage });
    if (data.acceptFuture !== undefined) consents.push({ kind: "futuros_procesos", accepted: !!data.acceptFuture });

    for (const c of consents) {
      const legalId = await ensureLegalText(c.kind);
      await supabaseAdmin.from("consent_records").insert({
        consent_kind: c.kind,
        person_id: personId,
        submission_id: submission.id,
        participant_id: participant.id,
        legal_text_id: legalId,
        accepted: c.accepted,
        user_agent: data.userAgent ?? null,
      });
    }

    return {
      ok: true as const,
      code: participantStatus === "lista_espera" ? ("lista_espera" as const) : ("recibida" as const),
      participantId: participant.id,
    };
  });
