import type { Database } from "@/integrations/supabase/types";

export type ParticipantStatus = Database["public"]["Enums"]["participant_status"];
export type AttendeeType = Database["public"]["Enums"]["attendee_type"];

export const PARTICIPANT_STATUS_OPTIONS: { value: ParticipantStatus; label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" | "muted" }[] = [
  { value: "solicitud_recibida", label: "Solicitud recibida", tone: "info" },
  { value: "pendiente_revision", label: "Pendiente de revisión", tone: "info" },
  { value: "aprobado", label: "Aprobado", tone: "success" },
  { value: "rechazado", label: "Rechazado", tone: "danger" },
  { value: "lista_espera", label: "Lista de espera", tone: "warning" },
  { value: "aceptado_pendiente_envio", label: "Aceptado · pendiente de envío", tone: "success" },
  { value: "invitacion_enviada", label: "Invitación enviada", tone: "info" },
  { value: "pendiente_confirmacion", label: "Pendiente confirmación", tone: "warning" },
  { value: "confirmado", label: "Confirmado", tone: "success" },
  { value: "cancelado_asistente", label: "Cancelado por asistente", tone: "muted" },
  { value: "cancelado_figurarte", label: "Cancelado por FIGURARTE", tone: "muted" },
  { value: "qr_generado", label: "QR generado", tone: "success" },
  { value: "acceso_validado", label: "Acceso validado", tone: "success" },
  { value: "no_presentado", label: "No presentado", tone: "muted" },
  { value: "incidencia", label: "Incidencia", tone: "danger" },
  { value: "bloqueado", label: "Bloqueado", tone: "danger" },
];

export const ATTENDEE_TYPE_OPTIONS: { value: AttendeeType; label: string }[] = [
  { value: "publico", label: "Público" },
  { value: "figurante", label: "Figurante" },
  { value: "casting", label: "Casting" },
  { value: "vip", label: "VIP" },
  { value: "prensa", label: "Prensa" },
  { value: "equipo", label: "Equipo / Staff" },
  { value: "acompanante", label: "Acompañante" },
  { value: "otro", label: "Otro" },
];

export const APPROVED_LIKE: ParticipantStatus[] = [
  "aprobado",
  "aceptado_pendiente_envio",
  "invitacion_enviada",
  "pendiente_confirmacion",
  "confirmado",
  "qr_generado",
  "acceso_validado",
];

export function statusLabel(s: ParticipantStatus | null | undefined) {
  return PARTICIPANT_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s ?? "—";
}

export function statusTone(s: ParticipantStatus | null | undefined) {
  return PARTICIPANT_STATUS_OPTIONS.find((o) => o.value === s)?.tone ?? "neutral";
}

export function attendeeLabel(a: AttendeeType | null | undefined) {
  return ATTENDEE_TYPE_OPTIONS.find((o) => o.value === a)?.label ?? a ?? "—";
}

export function ageFromBirth(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}