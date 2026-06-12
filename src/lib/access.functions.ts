import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { requireRole, isCoordinatorOrAdmin } from "./role-guards";

export type ValidationCode =
  | "ok"
  | "qr_ya_usado"
  | "qr_no_valido"
  | "qr_cancelado"
  | "qr_otra_sesion"
  | "qr_otro_evento"
  | "no_confirmado"
  | "persona_bloqueada"
  | "incidencia";

export interface ValidationResult {
  code: ValidationCode;
  message: string;
  ticket?: { id: string; qr_payload: Json | null } | null;
  participant?: {
    id: string;
    status: string;
    companions_count: number;
    attendee_type: string;
    internal_notes: string | null;
  } | null;
  person?: {
    id: string;
    first_name: string;
    last_name: string | null;
    dni: string | null;
    email: string | null;
    phone: string | null;
    is_blocked: boolean;
    blocked_reason: string | null;
  } | null;
  checkin?: { id: string; checked_in_at: string } | null;
  seat?: { zone: string | null; row: string | null; number: string | null } | null;
  companion?: { id: string; first_name: string | null; last_name: string | null } | null;
}

const validateSchema = z.object({
  qrToken: z.string().trim().min(8).max(256),
  sessionId: z.string().uuid(),
  eventId: z.string().uuid(),
  companionsValidated: z.number().int().min(0).max(50).optional(),
  deviceInfo: z.string().max(300).optional(),
});

function msgFor(code: ValidationCode): string {
  switch (code) {
    case "ok": return "Acceso válido";
    case "qr_ya_usado": return "QR ya usado";
    case "qr_no_valido": return "QR no válido";
    case "qr_cancelado": return "QR cancelado";
    case "qr_otra_sesion": return "QR de otra sesión";
    case "qr_otro_evento": return "QR de otro evento";
    case "no_confirmado": return "Persona no confirmada";
    case "persona_bloqueada": return "Persona bloqueada";
    case "incidencia": return "Incidencia";
  }
}

export const validateQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => validateSchema.parse(d))
  .handler(async ({ data, context }): Promise<ValidationResult> => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
      "validador",
    ]);

    const { data: ticket } = await supabase
      .from("tickets")
      .select("*")
      .eq("qr_token", data.qrToken)
      .maybeSingle();

    if (!ticket) return { code: "qr_no_valido", message: msgFor("qr_no_valido") };
    if (ticket.revoked) {
      return { code: "qr_cancelado", message: msgFor("qr_cancelado"), ticket: { id: ticket.id, qr_payload: ticket.qr_payload } };
    }
    if (ticket.event_id !== data.eventId) {
      return { code: "qr_otro_evento", message: msgFor("qr_otro_evento"), ticket: { id: ticket.id, qr_payload: ticket.qr_payload } };
    }
    if (ticket.session_id !== data.sessionId) {
      return { code: "qr_otra_sesion", message: msgFor("qr_otra_sesion"), ticket: { id: ticket.id, qr_payload: ticket.qr_payload } };
    }

    const { data: participant } = await supabase
      .from("event_participants")
      .select("*, people(*), seat_zone, seat_row, seat_number")
      .eq("id", ticket.participant_id)
      .maybeSingle();

    if (!participant) return { code: "qr_no_valido", message: msgFor("qr_no_valido") };

    const person = participant.people as ValidationResult["person"] | null;

    // Resolve companion + seat for this specific ticket
    let companion: ValidationResult["companion"] = null;
    let seat: ValidationResult["seat"] = {
      zone: (participant as { seat_zone: string | null }).seat_zone ?? null,
      row: (participant as { seat_row: string | null }).seat_row ?? null,
      number: (participant as { seat_number: string | null }).seat_number ?? null,
    };
    const ticketCompanionId = (ticket as { companion_id?: string | null }).companion_id ?? null;
    if (ticketCompanionId) {
      const { data: comp } = await supabase
        .from("companions")
        .select("id, first_name, last_name, seat_zone, seat_row, seat_number")
        .eq("id", ticketCompanionId)
        .maybeSingle();
      if (comp) {
        companion = { id: comp.id, first_name: comp.first_name, last_name: comp.last_name };
        if (comp.seat_zone || comp.seat_row || comp.seat_number) {
          seat = { zone: comp.seat_zone, row: comp.seat_row, number: comp.seat_number };
        }
      }
    }

    if (person?.is_blocked) {
      return {
        code: "persona_bloqueada",
        message: msgFor("persona_bloqueada"),
        participant: { id: participant.id, status: participant.status, companions_count: participant.companions_count, attendee_type: participant.attendee_type, internal_notes: participant.internal_notes },
        person,
        ticket: { id: ticket.id, qr_payload: ticket.qr_payload },
        seat,
        companion,
      };
    }
    if (![
      "aprobado",
      "aceptado_pendiente_envio",
      "invitacion_enviada",
      "pendiente_confirmacion",
      "confirmado",
      "qr_generado",
      "acceso_validado",
    ].includes(participant.status)) {
      return {
        code: "no_confirmado",
        message: msgFor("no_confirmado"),
        participant: { id: participant.id, status: participant.status, companions_count: participant.companions_count, attendee_type: participant.attendee_type, internal_notes: participant.internal_notes },
        person,
        seat,
        companion,
      };
    }

    // Already used?
    const { data: existing } = await supabase
      .from("checkins")
      .select("id, checked_in_at")
      .eq("ticket_id", ticket.id)
      .eq("result", "ok")
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        code: "qr_ya_usado",
        message: msgFor("qr_ya_usado"),
        participant: { id: participant.id, status: participant.status, companions_count: participant.companions_count, attendee_type: participant.attendee_type, internal_notes: participant.internal_notes },
        person,
        ticket: { id: ticket.id, qr_payload: ticket.qr_payload },
        checkin: { id: existing.id, checked_in_at: existing.checked_in_at },
        seat,
        companion,
      };
    }

    // Insert checkin
    const companionsInTicket =
      ticket.qr_payload && typeof ticket.qr_payload === "object" && "includes" in (ticket.qr_payload as Record<string, unknown>)
        ? Math.max(0, Number((ticket.qr_payload as Record<string, unknown>).includes) - 1)
        : 0;
    const companionsValidated = data.companionsValidated ?? companionsInTicket;

    const { data: checkin, error: cErr } = await supabase
      .from("checkins")
      .insert({
        participant_id: participant.id,
        ticket_id: ticket.id,
        event_id: ticket.event_id,
        session_id: ticket.session_id,
        validator_id: userId,
        result: "ok",
        companions_validated: companionsValidated,
        device_info: data.deviceInfo ?? null,
      } satisfies Database["public"]["Tables"]["checkins"]["Insert"])
      .select("id, checked_in_at")
      .single();
    if (cErr) throw cErr;

    await supabase
      .from("event_participants")
      .update({ status: "acceso_validado" })
      .eq("id", participant.id);

    await supabase.from("audit_logs").insert({
      action: "checkin.qr",
      entity_type: "checkin",
      entity_id: checkin.id,
      event_id: ticket.event_id,
      session_id: ticket.session_id,
      actor_id: userId,
      changes: { ticket_id: ticket.id, companions_validated: companionsValidated, method: "qr" } as Json,
    });

    return {
      code: "ok",
      message: msgFor("ok"),
      participant: { id: participant.id, status: "acceso_validado", companions_count: participant.companions_count, attendee_type: participant.attendee_type, internal_notes: participant.internal_notes },
      person,
      ticket: { id: ticket.id, qr_payload: ticket.qr_payload },
      checkin,
      seat,
      companion,
    };
  });

const manualSchema = z.object({
  participantId: z.string().uuid(),
  sessionId: z.string().uuid(),
  eventId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  companionsValidated: z.number().int().min(0).max(50).optional(),
});

export const manualCheckin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => manualSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
      "validador",
    ]);

    const { data: checkin, error } = await supabase
      .from("checkins")
      .insert({
        participant_id: data.participantId,
        event_id: data.eventId,
        session_id: data.sessionId,
        validator_id: userId,
        result: "ok",
        companions_validated: data.companionsValidated ?? 0,
        device_info: "manual_override",
        notes: data.reason,
      })
      .select("id, checked_in_at")
      .single();
    if (error) throw error;

    await supabase
      .from("event_participants")
      .update({ status: "acceso_validado" })
      .eq("id", data.participantId);

    await supabase.from("audit_logs").insert({
      action: "checkin.manual",
      entity_type: "checkin",
      entity_id: checkin.id,
      event_id: data.eventId,
      session_id: data.sessionId,
      actor_id: userId,
      changes: { reason: data.reason, method: "manual_override" } as Json,
    });
    return { ok: true as const, checkin };
  });

const incidentSchema = z.object({
  eventId: z.string().uuid(),
  sessionId: z.string().uuid().optional().nullable(),
  participantId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional().nullable(),
  severity: z.enum(["baja", "media", "alta", "critica"]).default("media"),
  incidentType: z
    .enum([
      "qr_ya_usado",
      "qr_no_valido",
      "sin_dni",
      "dni_no_coincide",
      "no_aparece_lista",
      "no_confirmado",
      "acompanante_no_registrado",
      "menor_sin_autorizacion",
      "fuera_horario",
      "cambio_sesion",
      "vip_especial",
      "persona_bloqueada",
      "problema_tecnico",
      "manual",
      "no_recibio_qr",
      "sin_movil",
      "invitado_extra",
      "perdida_objeto",
      "problema_salud",
      "conflicto_personal",
      "queja",
      "otro",
    ])
    .default("manual"),
  category: z.enum(["entrada", "otra"]).default("entrada"),
  walkInFirstName: z.string().trim().max(100).optional().nullable(),
  walkInLastName: z.string().trim().max(100).optional().nullable(),
  walkInDni: z.string().trim().max(40).optional().nullable(),
  walkInCompanions: z.number().int().min(0).max(50).optional().default(0),
});

export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => incidentSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
      "validador",
    ]);
    const { data: row, error } = await supabase
      .from("incidents")
      .insert({
        event_id: data.eventId,
        session_id: data.sessionId ?? null,
        participant_id: data.participantId ?? null,
        title: data.title,
        description: data.description ?? null,
        severity: data.severity,
        incident_type: data.incidentType,
        status: "abierta",
        reported_by: userId,
        category: data.category,
        walk_in_first_name: data.walkInFirstName ?? null,
        walk_in_last_name: data.walkInLastName ?? null,
        walk_in_dni: data.walkInDni ?? null,
        walk_in_companions: data.walkInCompanions ?? 0,
      })
      .select("id")
      .single();
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      action: "incident.create",
      entity_type: "incident",
      entity_id: row.id,
      event_id: data.eventId,
      session_id: data.sessionId ?? null,
      actor_id: userId,
      changes: { title: data.title, severity: data.severity } as Json,
    });
    return { ok: true as const, id: row.id };
  });

const resolveSchema = z.object({
  incidentId: z.string().uuid(),
  status: z.enum(["resuelta", "descartada", "abierta", "en_proceso"]),
  resolution: z.string().trim().max(2000).optional().nullable(),
});

export const resolveIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resolveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
    ]);
    const isClosed = data.status === "resuelta" || data.status === "descartada";
    const patch = {
      status: data.status,
      resolution: data.resolution ?? null,
      updated_at: new Date().toISOString(),
      resolved_at: isClosed ? new Date().toISOString() : null,
      resolved_by: isClosed ? userId : null,
    };
    const { data: row, error } = await supabase
      .from("incidents")
      .update(patch)
      .eq("id", data.incidentId)
      .select("id, event_id, session_id")
      .single();
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      action: `incident.${data.status}`,
      entity_type: "incident",
      entity_id: row.id,
      event_id: row.event_id,
      session_id: row.session_id,
      actor_id: userId,
      changes: { status: data.status, resolution: data.resolution ?? null } as Json,
    });
    return { ok: true as const };
  });

const searchSchema = z.object({
  sessionId: z.string().uuid(),
  query: z.string().trim().min(2).max(120),
});

export const searchSessionParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await requireRole(supabase, userId, [
      "superadmin",
      "admin_figurarte",
      "coordinador",
      "validador",
    ]);
    const canSeePII = isCoordinatorOrAdmin(roles);
    const personFields = canSeePII
      ? "id, first_name, last_name, dni, email, phone, is_blocked"
      : "id, first_name, last_name, is_blocked";
    const rows: Array<{
      id: string;
      status: string;
      companions_count: number;
      attendee_type: string;
      event_id: string;
      session_id: string;
      people: { first_name?: string; last_name?: string | null; dni?: string | null; email?: string | null; phone?: string | null } | null;
    }> = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase
        .from("event_participants")
        .select(`id, status, companions_count, attendee_type, event_id, session_id, people(${personFields})`)
        .eq("session_id", data.sessionId)
        .in("status", [
          "aprobado",
          "aceptado_pendiente_envio",
          "invitacion_enviada",
          "pendiente_confirmacion",
          "confirmado",
          "qr_generado",
          "acceso_validado",
        ])
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...((page ?? []) as typeof rows));
      if (!page || page.length < pageSize) break;
    }
    const q = data.query.toLowerCase();
    return rows.filter((r) => {
      const p = r.people;
      if (!p) return false;
      return [p.first_name, p.last_name, p.dni, p.email, p.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  });