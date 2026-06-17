// Helpers para construir las 11 variables de la plantilla
// "entrada_grabacin" (Spanish) y para llamar a la API de Wati.
//
// IMPORTANTE: las fechas se formatean siempre con timezone Europe/Madrid
// y locale es-ES, para que coincida con la hora real del show
// independientemente de cómo esté almacenado el `starts_at` (UTC en DB).

const TZ = "Europe/Madrid";

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// "Miércoles 17 de junio de 2026"
export function formatFechaLarga(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${capitalize(get("weekday"))} ${get("day")} de ${get("month")} de ${get("year")}`;
}

// "18:00 h"
export function formatHora(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${f} h`;
}

export interface InvitacionContext {
  // Por invitado
  nombre: string;
  zona: string;
  fila: string;
  asiento: string;
  enlace_entrada: string;
  // Por sesión
  programa: string;
  fecha: string;
  hora_acceso: string;
  hora_inicio: string;
  hora_fin: string;
  lugar: string;
}

export function buildWatiParameters(ctx: InvitacionContext): Array<{ name: string; value: string }> {
  return [
    { name: "nombre", value: ctx.nombre },
    { name: "programa", value: ctx.programa },
    { name: "fecha", value: ctx.fecha },
    { name: "hora_acceso", value: ctx.hora_acceso },
    { name: "hora_inicio", value: ctx.hora_inicio },
    { name: "hora_fin", value: ctx.hora_fin },
    { name: "zona", value: ctx.zona },
    { name: "fila", value: ctx.fila },
    { name: "asiento", value: ctx.asiento },
    { name: "lugar", value: ctx.lugar },
    { name: "enlace_entrada", value: ctx.enlace_entrada },
  ];
}

export interface WatiSendResult {
  ok: boolean;
  localMessageId: string | null;
  errorDetail: string | null;
  raw: unknown;
}

// Envío INDIVIDUAL (1 destinatario). Usado por la cola y por el modo de prueba.
export async function watiSendTemplateIndividual(opts: {
  endpoint: string;
  token: string;
  templateName: string;
  broadcastName: string;
  whatsappNumber: string;
  parameters: Array<{ name: string; value: string }>;
}): Promise<WatiSendResult> {
  const url = `${opts.endpoint.replace(/\/$/, "")}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(opts.whatsappNumber)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_name: opts.templateName,
      broadcast_name: opts.broadcastName,
      parameters: opts.parameters,
    }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }

  if (!res.ok) {
    return { ok: false, localMessageId: null, errorDetail: `HTTP ${res.status}: ${text.slice(0, 500)}`, raw: json ?? text };
  }

  const result = json?.result;
  // La respuesta individual puede venir como { result, receivers:[...] }
  // o (según versión) como { result, messages:[...] }. Toleramos ambos.
  const receiver = (json?.receivers?.[0]) ?? (json?.messages?.[0]) ?? null;
  const localMessageId = receiver?.localMessageId ?? json?.localMessageId ?? null;
  const isValid = receiver?.isValidWhatsAppNumber !== false;
  const errs: unknown[] = receiver?.errors ?? json?.errors ?? [];
  const hasErrors = Array.isArray(errs) && errs.length > 0;

  if (result === false || !isValid || hasErrors || !localMessageId) {
    const detail = hasErrors
      ? JSON.stringify(errs).slice(0, 500)
      : !isValid
        ? "isValidWhatsAppNumber=false"
        : !localMessageId
          ? "Sin localMessageId en respuesta"
          : "result=false";
    return { ok: false, localMessageId: localMessageId ?? null, errorDetail: detail, raw: json };
  }
  return { ok: true, localMessageId, errorDetail: null, raw: json };
}

// Envío POR LOTES (varios destinatarios). Usado en producción.
export interface WatiBatchReceiver {
  whatsappNumber: string;
  customParams: Array<{ name: string; value: string }>;
}
export interface WatiBatchResult {
  ok: boolean;
  // Map whatsappNumber → result (success + localMessageId, o error).
  perReceiver: Record<string, { ok: boolean; localMessageId: string | null; errorDetail: string | null }>;
  errorDetail: string | null;
  raw: unknown;
}

export async function watiSendTemplateBatch(opts: {
  endpoint: string;
  token: string;
  templateName: string;
  broadcastName: string;
  receivers: WatiBatchReceiver[];
}): Promise<WatiBatchResult> {
  const url = `${opts.endpoint.replace(/\/$/, "")}/api/v1/sendTemplateMessages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_name: opts.templateName,
      broadcast_name: opts.broadcastName,
      receivers: opts.receivers,
    }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }

  const perReceiver: WatiBatchResult["perReceiver"] = {};
  if (!res.ok) {
    for (const r of opts.receivers) perReceiver[r.whatsappNumber] = { ok: false, localMessageId: null, errorDetail: `HTTP ${res.status}` };
    return { ok: false, perReceiver, errorDetail: `HTTP ${res.status}: ${text.slice(0, 500)}`, raw: json ?? text };
  }

  const receivers: any[] = json?.receivers ?? [];
  for (const r of receivers) {
    const num: string = r?.whatsappNumber ?? "";
    if (!num) continue;
    const isValid = r?.isValidWhatsAppNumber !== false;
    const errs: unknown[] = r?.errors ?? [];
    const hasErrors = Array.isArray(errs) && errs.length > 0;
    const lid = r?.localMessageId ?? null;
    if (!isValid || hasErrors || !lid) {
      const detail = hasErrors
        ? JSON.stringify(errs).slice(0, 500)
        : !isValid
          ? "isValidWhatsAppNumber=false"
          : "Sin localMessageId";
      perReceiver[num] = { ok: false, localMessageId: lid, errorDetail: detail };
    } else {
      perReceiver[num] = { ok: true, localMessageId: lid, errorDetail: null };
    }
  }
  // Marca como fallido cualquier número que no haya vuelto en la respuesta.
  for (const r of opts.receivers) {
    if (!perReceiver[r.whatsappNumber]) {
      perReceiver[r.whatsappNumber] = { ok: false, localMessageId: null, errorDetail: "Sin respuesta de Wati para este número" };
    }
  }
  return { ok: true, perReceiver, errorDetail: null, raw: json };
}