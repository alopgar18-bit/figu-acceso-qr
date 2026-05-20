import type { Database } from "@/integrations/supabase/types";

export type CommChannel = Database["public"]["Enums"]["communication_channel"];
export type CommStatus = Database["public"]["Enums"]["communication_status"];

export const COMM_CHANNEL_OPTIONS: { value: CommChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "whatsapp_asistido", label: "WhatsApp asistido" },
  { value: "sms", label: "SMS" },
  { value: "manual", label: "Manual" },
];

export const COMM_STATUS_OPTIONS: { value: CommStatus; label: string; tone: "default" | "secondary" | "destructive" | "outline" }[] = [
  { value: "pendiente", label: "Pendiente", tone: "outline" },
  { value: "enviado", label: "Enviado", tone: "secondary" },
  { value: "error", label: "Error", tone: "destructive" },
  { value: "cancelado", label: "Cancelado", tone: "outline" },
];

export const COMM_TYPES = [
  { key: "solicitud_recibida", label: "Solicitud recibida" },
  { key: "solicitud_aprobada", label: "Solicitud aprobada" },
  { key: "solicitud_rechazada", label: "Solicitud rechazada" },
  { key: "pendiente_confirmacion", label: "Pendiente de confirmación" },
  { key: "entrada_qr", label: "Entrada / QR" },
  { key: "recordatorio", label: "Recordatorio" },
  { key: "cancelacion", label: "Cancelación" },
  { key: "cambio_horario", label: "Cambio de fecha/hora" },
  { key: "lista_espera", label: "Lista de espera" },
  { key: "post_evento", label: "Post-evento" },
] as const;

export type CommType = (typeof COMM_TYPES)[number]["key"];

export const COMM_VARIABLES = [
  { token: "{{nombre}}", description: "Nombre de la persona" },
  { token: "{{apellidos}}", description: "Apellidos" },
  { token: "{{evento}}", description: "Nombre del evento" },
  { token: "{{sesion}}", description: "Sesión asignada" },
  { token: "{{fecha}}", description: "Fecha de la sesión" },
  { token: "{{hora_acceso}}", description: "Hora de acceso" },
  { token: "{{ubicacion}}", description: "Lugar / dirección" },
  { token: "{{enlace_confirmacion}}", description: "Enlace para confirmar asistencia" },
  { token: "{{enlace_entrada}}", description: "Enlace a la entrada / QR" },
  { token: "{{qr}}", description: "Código QR / token" },
  { token: "{{instrucciones}}", description: "Instrucciones específicas" },
] as const;

export const SENDER_EMAIL = "casting@figurarte.es";

export interface RenderContext {
  nombre?: string | null;
  apellidos?: string | null;
  evento?: string | null;
  sesion?: string | null;
  fecha?: string | null;
  hora_acceso?: string | null;
  ubicacion?: string | null;
  enlace_confirmacion?: string | null;
  enlace_entrada?: string | null;
  qr?: string | null;
  instrucciones?: string | null;
  telefono?: string | null;
}

export function renderTemplate(text: string, ctx: RenderContext): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = (ctx as Record<string, unknown>)[key];
    return v == null ? "" : String(v);
  });
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export const DEFAULT_TEMPLATES: { name: string; channel: CommChannel; subject: string | null; body: string; type: CommType }[] = [
  {
    type: "solicitud_recibida",
    name: "Solicitud recibida – Email",
    channel: "email",
    subject: "Hemos recibido tu solicitud · {{evento}}",
    body: `Hola {{nombre}},\n\nHemos recibido tu solicitud para participar en {{evento}}.\nEl equipo de FIGURARTE revisará tu inscripción y te confirmaremos si puedes asistir.\n\nGracias,\nEquipo FIGURARTE`,
  },
  {
    type: "solicitud_aprobada",
    name: "Solicitud aprobada – Email",
    channel: "email",
    subject: "Tu solicitud ha sido aprobada · {{evento}}",
    body: `Hola {{nombre}},\n\nTu solicitud para {{evento}} ({{sesion}} – {{fecha}}) ha sido aprobada.\nPor favor, confirma tu asistencia en el siguiente enlace:\n{{enlace_confirmacion}}\n\nUn saludo,\nFIGURARTE`,
  },
  {
    type: "entrada_qr",
    name: "Entrada / QR – Email",
    channel: "email",
    subject: "Tu entrada para {{evento}}",
    body: `Hola {{nombre}},\n\nAdjuntamos tu entrada para {{evento}}.\nSesión: {{sesion}} – {{fecha}} ({{hora_acceso}})\nUbicación: {{ubicacion}}\n\nAccede a tu entrada: {{enlace_entrada}}\n\n{{instrucciones}}\n\nNos vemos pronto,\nFIGURARTE`,
  },
  {
    type: "recordatorio",
    name: "Recordatorio – WhatsApp",
    channel: "whatsapp_asistido",
    subject: null,
    body: `Hola {{nombre}}, te recordamos que mañana es {{evento}} – {{sesion}} a las {{hora_acceso}}. Ubicación: {{ubicacion}}. ¡Te esperamos! FIGURARTE`,
  },
  {
    type: "cancelacion",
    name: "Cancelación – Email",
    channel: "email",
    subject: "Cancelación · {{evento}}",
    body: `Hola {{nombre}},\n\nLamentamos comunicarte que tu participación en {{evento}} ha sido cancelada.\nSi tienes dudas, contáctanos respondiendo a este email.\n\nFIGURARTE`,
  },
];