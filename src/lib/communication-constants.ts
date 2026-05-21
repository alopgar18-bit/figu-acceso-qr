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
  { value: "programado", label: "Programado", tone: "outline" },
  { value: "enviado", label: "Enviado", tone: "secondary" },
  { value: "fallido", label: "Error", tone: "destructive" },
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
  { token: "{{qr_image}}", description: "URL de imagen PNG del QR (para <img src>)" },
  { token: "{{instrucciones}}", description: "Instrucciones específicas" },
] as const;

export const SENDER_EMAIL = "casting@figurarte.es";
export const PUBLIC_SITE_URL_FALLBACK = "https://figu-acceso-qr.lovable.app";

export function buildQrImageUrl(data: string, size = 320): string {
  if (!data) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`;
}

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
  qr_image?: string | null;
  instrucciones?: string | null;
  telefono?: string | null;
}

export function renderTemplate(text: string, ctx: RenderContext): string {
  // Graceful fallback for empty name: "Hola {{nombre}}," -> "Hola,"
  const nombre = (ctx.nombre ?? "").trim();
  let working = text;
  if (!nombre) {
    working = working.replace(/Hola\s+\{\{nombre\}\}\s*,/gi, "Hola,");
    working = working.replace(/Hola\s+\{\{nombre\}\}/gi, "Hola");
  }
  return working.replace(/\{\{(\w+)\}\}/g, (_, key) => {
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
    type: "entrada_qr",
    name: "Entrada / QR – Email (con imagen)",
    channel: "email",
    subject: "Tu entrada para {{evento}}",
    body: `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#111111;padding:28px 32px;color:#ffffff;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.7;">FIGURARTE Casting</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;">Tu entrada · {{evento}}</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;">Hola <strong>{{nombre}}</strong>,</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Tu asistencia a <strong>{{evento}}</strong> ha quedado confirmada. Te enviamos a continuación tu entrada digital con código QR.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #ececec;border-radius:10px;margin:0 0 24px;">
            <tr><td style="padding:16px 20px;font-size:14px;line-height:1.7;">
              <div><strong>Sesión:</strong> {{sesion}}</div>
              <div><strong>Fecha:</strong> {{fecha}} · {{hora_acceso}}</div>
              <div><strong>Lugar:</strong> {{ubicacion}}</div>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:8px 0 16px;">
              <img src="{{qr_image}}" alt="Código QR de tu entrada" width="240" height="240" style="display:block;border-radius:8px;border:1px solid #ececec;background:#ffffff;" />
              <div style="font-size:12px;color:#666666;margin-top:10px;">Presenta este QR en el acceso. Es personal e intransferible.</div>
            </td></tr>
            <tr><td align="center" style="padding:8px 0 24px;">
              <a href="{{enlace_entrada}}" style="background:#111111;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">Abrir entrada digital</a>
              <div style="font-size:12px;color:#999;margin-top:10px;word-break:break-all;">{{enlace_entrada}}</div>
            </td></tr>
          </table>
          <p style="margin:8px 0 0;font-size:13px;color:#555;line-height:1.55;">Recuerda llevar el DNI en vigor. {{instrucciones}}</p>
        </td></tr>
        <tr><td style="background:#111;padding:18px 32px;color:#bbb;font-size:12px;text-align:center;">FIGURARTE Casting & Producción</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
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