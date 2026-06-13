import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";

type PublicEventSummary = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  location_name: string | null;
  location_address: string | null;
  general_instructions: string | null;
  brand_color: string | null;
  requires_image_consent: boolean;
  requires_recording: boolean;
  ticket_design: Json | null;
  cover_image_url: string | null;
};
type PublicSessionSummary = Database["public"]["Tables"]["event_sessions"]["Row"];

const tokenSchema = z.object({ token: z.string().trim().min(20).max(128).regex(/^[a-f0-9]+$/i) });

function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveTicketDesign(eventId: string, sessionId: string): Promise<Json | null> {
  // Hierarchy: session > event > global default
  const { data: sessionDesign } = await supabaseAdmin
    .from("ticket_designs")
    .select("design")
    .eq("scope_session_id", sessionId)
    .maybeSingle();
  if (sessionDesign?.design) return sessionDesign.design as Json;
  const { data: eventDesign } = await supabaseAdmin
    .from("ticket_designs")
    .select("design")
    .eq("scope_event_id", eventId)
    .maybeSingle();
  if (eventDesign?.design) return eventDesign.design as Json;
  const { data: globalDesign } = await supabaseAdmin
    .from("ticket_designs")
    .select("design")
    .eq("is_global_default", true)
    .maybeSingle();
  if (globalDesign?.design) return globalDesign.design as Json;
  return null;
}

async function loadByToken(token: string) {
  const { data: participant, error } = await supabaseAdmin
    .from("event_participants")
      .select(
      "*, people(*), event_sessions(*), events(id,name,slug,location_name,location_address,general_instructions,brand_color,status,requires_image_consent,requires_recording,ticket_design,cover_image_url)",
    )
    .eq("confirmation_token", token)
    .maybeSingle();
  if (error) throw error;
  return participant;
}

export const getConfirmation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const p = await loadByToken(data.token);
    if (!p) return { ok: false as const, code: "invalido" as const };

    const event = p.events as PublicEventSummary | null;
    const session = p.event_sessions as PublicSessionSummary | null;
    if (!event || !session) return { ok: false as const, code: "invalido" as const };

    if (event.status !== "publicado" || session.status === "cancelada") {
      return { ok: false as const, code: "evento_cerrado" as const };
    }
    if (session.ends_at && new Date(session.ends_at) < new Date()) {
      return { ok: false as const, code: "evento_cerrado" as const };
    }
    if (p.status === "cancelado_asistente" || p.status === "cancelado_figurarte" || p.status === "rechazado" || p.status === "bloqueado") {
      return { ok: false as const, code: "no_disponible" as const, status: p.status };
    }

    // Tickets, if any
    const { data: tickets } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .eq("participant_id", p.id)
      .eq("revoked", false);

    const { data: companions } = await supabaseAdmin
      .from("companions")
      .select("*")
      .eq("participant_id", p.id);

    // Resolve ticket design from new library; fall back to legacy event.ticket_design jsonb
    const resolved = await resolveTicketDesign(event.id, session.id);
    const eventWithDesign: PublicEventSummary = {
      ...event,
      ticket_design: resolved ?? event.ticket_design ?? null,
    };

    return {
      ok: true as const,
      participant: {
        id: p.id,
        status: p.status,
        companions_count: p.companions_count,
        confirmed_at: p.confirmed_at,
        attendee_type: p.attendee_type,
        seat_zone: (p as Record<string, unknown>).seat_zone as string | null,
        seat_row: (p as Record<string, unknown>).seat_row as string | null,
        seat_number: (p as Record<string, unknown>).seat_number as string | null,
      },
      person: p.people,
      event: eventWithDesign,
      session,
      tickets: tickets ?? [],
      companions: companions ?? [],
    };
  });

const confirmSchema = z.object({
  token: z.string().min(20).max(128).regex(/^[a-f0-9]+$/i),
  companions: z
    .array(
      z.object({
        first_name: z.string().trim().max(100).optional().nullable(),
        last_name: z.string().trim().max(150).optional().nullable(),
        dni: z.string().trim().max(20).optional().nullable(),
        age: z.number().int().min(0).max(120).optional().nullable(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  acceptImage: z.boolean().optional(),
  userAgent: z.string().max(500).optional(),
});

export const confirmAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => confirmSchema.parse(d))
  .handler(async ({ data }) => {
    const p = await loadByToken(data.token);
    if (!p) return { ok: false as const, code: "invalido" as const };

    const event = p.events as PublicEventSummary | null;
    const session = p.event_sessions as PublicSessionSummary | null;
    if (!event || !session) return { ok: false as const, code: "invalido" as const };
    if (event.status !== "publicado" || session.status === "cancelada") return { ok: false as const, code: "evento_cerrado" as const };
    if (session.ends_at && new Date(session.ends_at) < new Date()) return { ok: false as const, code: "evento_cerrado" as const };
    if (!["aprobado", "invitacion_enviada", "pendiente_confirmacion", "confirmado", "qr_generado"].includes(p.status)) {
      return { ok: false as const, code: "no_disponible" as const, status: p.status };
    }

    // Image consent if required and missing
    if ((event.requires_image_consent || event.requires_recording) && data.acceptImage) {
      const { data: legal } = await supabaseAdmin
        .from("legal_texts")
        .select("id")
        .eq("kind", "imagen")
        .eq("is_active", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (legal) {
        await supabaseAdmin.from("consent_records").insert({
          consent_kind: "imagen",
          person_id: p.person_id,
          participant_id: p.id,
          legal_text_id: legal.id,
          accepted: true,
          user_agent: data.userAgent ?? null,
        });
      }
    }

    // Companions: clamp + persist (only when allowed and provided)
    let companionsCount = p.companions_count;
    const validCompanions = (data.companions ?? []).filter(
      (c) => c.first_name || c.last_name || c.dni,
    );
    let insertedCompanionIds: string[] = [];
    if (session.allow_companions && validCompanions.length > 0) {
      companionsCount = Math.min(validCompanions.length, session.max_companions_per_participant || 0);
      await supabaseAdmin.from("companions").delete().eq("participant_id", p.id);
      if (companionsCount > 0) {
        const { data: insertedComps } = await supabaseAdmin
          .from("companions")
          .insert(
            validCompanions.slice(0, companionsCount).map((c) => ({
              participant_id: p.id,
              first_name: c.first_name ?? null,
              last_name: c.last_name ?? null,
              dni: c.dni ?? null,
              age: c.age ?? null,
            })),
          )
          .select("id");
        insertedCompanionIds = (insertedComps ?? []).map((c) => c.id);
      }
    } else if (companionsCount > 0) {
      // Reusar acompañantes ya existentes (sin re-insertar) para vincular tickets.
      const { data: existingComps } = await supabaseAdmin
        .from("companions")
        .select("id")
        .eq("participant_id", p.id)
        .order("created_at", { ascending: true });
      insertedCompanionIds = (existingComps ?? []).map((c) => c.id);
    }

    // Update participant
    await supabaseAdmin
      .from("event_participants")
      .update({
        status: "qr_generado",
        confirmed_at: new Date().toISOString(),
        companions_count: companionsCount,
      })
      .eq("id", p.id);

    // Generate tickets (replace any existing active tickets for this participant)
    await supabaseAdmin
      .from("tickets")
      .update({ revoked: true, revoked_at: new Date().toISOString(), revoked_reason: "reissue" })
      .eq("participant_id", p.id)
      .eq("revoked", false);

    const ticketRows: Database["public"]["Tables"]["tickets"]["Insert"][] = [];
    const expires = session.ends_at ?? null;

    if (session.companions_qr_mode === "qr_propio" && companionsCount > 0) {
      ticketRows.push({
        participant_id: p.id,
        event_id: event.id,
        session_id: session.id,
        qr_token: randomToken(),
        expires_at: expires,
        qr_payload: { kind: "titular", person_id: p.person_id } as Json,
      });
      for (let i = 0; i < companionsCount; i++) {
        ticketRows.push({
          participant_id: p.id,
          companion_id: insertedCompanionIds[i] ?? null,
          event_id: event.id,
          session_id: session.id,
          qr_token: randomToken(),
          expires_at: expires,
          qr_payload: { kind: "acompanante", index: i + 1 } as Json,
        });
      }
    } else {
      ticketRows.push({
        participant_id: p.id,
        event_id: event.id,
        session_id: session.id,
        qr_token: randomToken(),
        expires_at: expires,
        qr_payload: { kind: "grupo", includes: 1 + companionsCount } as Json,
      });
    }

    const { error: tErr } = await supabaseAdmin.from("tickets").insert(ticketRows);
    if (tErr) throw tErr;

    await supabaseAdmin.from("audit_logs").insert({
      action: "participant.confirm_attendance",
      entity_type: "event_participant",
      entity_id: p.id,
      event_id: event.id,
      session_id: session.id,
      changes: { companions_count: companionsCount, tickets_issued: ticketRows.length } as Json,
      user_agent: data.userAgent ?? null,
    });

    return { ok: true as const };
  });

const cancelSchema = z.object({
  token: z.string().min(20).max(128).regex(/^[a-f0-9]+$/i),
  reason: z.string().trim().max(500).optional().nullable(),
  userAgent: z.string().max(500).optional(),
});

// ─────── Per-ticket public endpoint (for companions' individual entries) ───────
const ticketTokenSchema = z.object({
  qrToken: z.string().trim().min(8).max(256),
});

export const getTicketByQr = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ticketTokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: ticket } = await supabaseAdmin
      .from("tickets")
      .select("id, qr_token, companion_id, participant_id, event_id, session_id, qr_payload, revoked")
      .eq("qr_token", data.qrToken)
      .maybeSingle();
    if (!ticket || ticket.revoked) return { ok: false as const, code: "invalido" as const };

    const [{ data: participant }, { data: event }, { data: session }, { data: companion }] = await Promise.all([
      supabaseAdmin
        .from("event_participants")
        .select("id, status, companions_count, seat_zone, seat_row, seat_number, people(first_name,last_name,dni)")
        .eq("id", ticket.participant_id)
        .maybeSingle(),
      supabaseAdmin
        .from("events")
        .select("id,name,slug,location_name,location_address,general_instructions,brand_color,status,requires_image_consent,requires_recording,ticket_design,cover_image_url")
        .eq("id", ticket.event_id)
        .maybeSingle(),
      supabaseAdmin
        .from("event_sessions")
        .select("*")
        .eq("id", ticket.session_id)
        .maybeSingle(),
      ticket.companion_id
        ? supabaseAdmin
            .from("companions")
            .select("id, first_name, last_name, dni, seat_zone, seat_row, seat_number")
            .eq("id", ticket.companion_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!participant || !event || !session) return { ok: false as const, code: "invalido" as const };
    if (event.status !== "publicado" || session.status === "cancelada") {
      return { ok: false as const, code: "evento_cerrado" as const };
    }

    const resolved = await resolveTicketDesign(event.id, session.id);
    const isCompanion = !!companion;
    const holderName = isCompanion
      ? `${companion!.first_name ?? ""} ${companion!.last_name ?? ""}`.trim()
      : `${(participant.people as { first_name?: string } | null)?.first_name ?? ""} ${
          (participant.people as { last_name?: string | null } | null)?.last_name ?? ""
        }`.trim();
    const seat = isCompanion
      ? { zone: companion!.seat_zone, row: companion!.seat_row, number: companion!.seat_number }
      : { zone: participant.seat_zone, row: participant.seat_row, number: participant.seat_number };
    const dni = isCompanion
      ? companion!.dni
      : (participant.people as { dni?: string | null } | null)?.dni ?? null;

    return {
      ok: true as const,
      ticket: { id: ticket.id, qr_token: ticket.qr_token, qr_payload: ticket.qr_payload },
      kind: isCompanion ? ("acompanante" as const) : ("titular" as const),
      holderName,
      dni,
      seat,
      event: { ...event, ticket_design: resolved ?? event.ticket_design ?? null },
      session,
    };
  });

export const cancelAttendance = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cancelSchema.parse(d))
  .handler(async ({ data }) => {
    const p = await loadByToken(data.token);
    if (!p) return { ok: false as const, code: "invalido" as const };

    await supabaseAdmin
      .from("event_participants")
      .update({
        status: "cancelado_asistente",
        cancelled_at: new Date().toISOString(),
        cancellation_reason_by_attendee: data.reason ?? null,
      })
      .eq("id", p.id);

    await supabaseAdmin
      .from("tickets")
      .update({ revoked: true, revoked_at: new Date().toISOString(), revoked_reason: "cancelado_asistente" })
      .eq("participant_id", p.id)
      .eq("revoked", false);

    await supabaseAdmin.from("audit_logs").insert({
      action: "participant.cancel_by_attendee",
      entity_type: "event_participant",
      entity_id: p.id,
      event_id: p.event_id,
      session_id: p.session_id,
      changes: { reason: data.reason ?? null } as Json,
      user_agent: data.userAgent ?? null,
    });

    return { ok: true as const };
  });