import type { Database } from "@/integrations/supabase/types";

export type IncidentType =
  | "qr_ya_usado"
  | "qr_no_valido"
  | "sin_dni"
  | "dni_no_coincide"
  | "no_aparece_lista"
  | "no_confirmado"
  | "acompanante_no_registrado"
  | "menor_sin_autorizacion"
  | "fuera_horario"
  | "cambio_sesion"
  | "vip_especial"
  | "persona_bloqueada"
  | "problema_tecnico"
  | "manual";

export type IncidentStatus = Database["public"]["Enums"]["incident_status"];
export type IncidentSeverity = Database["public"]["Enums"]["incident_severity"];

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  qr_ya_usado: "QR ya usado",
  qr_no_valido: "QR no válido",
  sin_dni: "Sin DNI",
  dni_no_coincide: "DNI no coincide",
  no_aparece_lista: "No aparece en lista",
  no_confirmado: "No confirmado",
  acompanante_no_registrado: "Acompañante no registrado",
  menor_sin_autorizacion: "Menor sin autorización",
  fuera_horario: "Fuera de horario",
  cambio_sesion: "Cambio de sesión",
  vip_especial: "VIP / especial",
  persona_bloqueada: "Persona bloqueada",
  problema_tecnico: "Problema técnico",
  manual: "Manual",
};

export const INCIDENT_TYPES = Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[];

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  abierta: "Abierta",
  en_proceso: "En proceso",
  resuelta: "Resuelta",
  descartada: "Rechazada",
};

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};
