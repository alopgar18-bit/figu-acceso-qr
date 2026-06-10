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
  | "manual"
  | "no_recibio_qr"
  | "sin_movil"
  | "invitado_extra"
  | "perdida_objeto"
  | "problema_salud"
  | "conflicto_personal"
  | "queja"
  | "otro";

export type IncidentCategory = "entrada" | "otra";

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  entrada: "Con entrada",
  otra: "Otra (durante el evento)",
};

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
  no_recibio_qr: "No le ha llegado el QR",
  sin_movil: "No trae móvil",
  invitado_extra: "Invitado extra",
  perdida_objeto: "Pérdida de objeto",
  problema_salud: "Problema de salud",
  conflicto_personal: "Conflicto personal",
  queja: "Queja",
  otro: "Otro",
};

export const INCIDENT_TYPES = Object.keys(INCIDENT_TYPE_LABELS) as IncidentType[];

// Tipos disponibles al CREAR una incidencia, agrupados por categoría.
// (Los tipos antiguos siguen existiendo para datos históricos y filtros, pero
// no se ofrecen ya como nuevas opciones.)
export const INCIDENT_TYPES_BY_CATEGORY: Record<IncidentCategory, IncidentType[]> = {
  entrada: ["no_recibio_qr", "sin_movil", "invitado_extra", "no_aparece_lista"],
  otra: ["perdida_objeto", "problema_salud", "problema_tecnico", "conflicto_personal", "queja", "otro"],
};

// Para los tipos heredados que llegaban desde el escáner (QR) los mantenemos
// asociados a entrada automáticamente.
export const ENTRADA_LEGACY_TYPES: IncidentType[] = [
  "qr_ya_usado", "qr_no_valido", "sin_dni", "dni_no_coincide",
  "no_confirmado", "acompanante_no_registrado", "menor_sin_autorizacion",
  "fuera_horario", "cambio_sesion", "vip_especial", "persona_bloqueada",
  "manual",
];

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
