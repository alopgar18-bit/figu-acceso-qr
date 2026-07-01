// Edge function PÚBLICA: recibe los eventos de Wati y actualiza el estado
// de WhatsApp en `communication_logs`.
//
// SEGURIDAD:
// - verify_jwt = false (registrado en supabase/config.toml).
// - Exige ?key=<WATI_WEBHOOK_SECRET> en la query string. Si no coincide → 401.
//
// REGLAS DE PRECEDENCIA:
// 1. `failed` es TERMINAL: ningún evento posterior lo sobrescribe (solo se
//    refresca failed_code/failed_detail si llega otro failed).
// 2. Cadena de entrega protegida: nunca retroceder de delivered/read/replied
//    a `sent` (un sent tardío solo refresca last_event_at).
// 3. `delivered` puede llegar tarde: si el estado actual ya es read/replied,
//    no degradamos el campo principal, pero registramos el timestamp.
// 4. `read` y `replied` son señales de interacción independientes: cualquiera
//    se registra aunque haya delivered; no se bloquean entre sí (cada uno
//    queda en metadata.wati_events).
// 5. metadata.wati_events: { sent_at, delivered_at, read_at, replied_at }
//    es aditivo (nunca borra datos previos).
// 6. SIEMPRE responder 200 para evitar reintentos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

type EstadoWA = "sent" | "delivered" | "read" | "replied" | "failed";

const EVENT_MAP: Record<string, EstadoWA> = {
  templateMessageSent_v2: "sent",
  sentMessageDELIVERED_v2: "delivered",
  sentMessageREAD_v2: "read",
  sentMessageREPLIED_v2: "replied",
  templateMessageFailed: "failed",
};

const TIMESTAMP_FIELD: Record<EstadoWA, string> = {
  sent: "sent_at",
  delivered: "delivered_at",
  read: "read_at",
  replied: "replied_at",
  failed: "failed_at",
};

// Determina el nuevo valor de `whatsapp_estado` dado el actual y el incoming,
// aplicando las reglas 1–4 descritas arriba.
function nextEstado(current: EstadoWA | null, incoming: EstadoWA): EstadoWA {
  if (current === "failed") return "failed";              // 1. failed terminal
  if (incoming === "failed") return "failed";             // failed gana siempre que no estemos en failed (cubierto arriba)
  if (current === null) return incoming;
  if (incoming === "sent") return current;                // 2. no retroceder a sent
  if (incoming === "delivered") {
    // 3. delivered no degrada read/replied
    return current === "read" || current === "replied" ? current : "delivered";
  }
  // 4. read/replied son interacción: el último que llega manda como estado mostrado
  return incoming;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const expected = Deno.env.get("WATI_WEBHOOK_SECRET") ?? "";
  const provided = url.searchParams.get("key") ?? "";
  if (!expected || !provided || !timingSafeEqualStr(expected, provided)) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let payload: any = {};
  try { payload = await req.json(); } catch { /* keep empty */ }

  // Aceptamos un solo evento o array.
  const events: any[] = Array.isArray(payload) ? payload : [payload];

  const summary: { processed: number; updated: number; not_found: number; ignored: number } = {
    processed: 0, updated: 0, not_found: 0, ignored: 0,
  };

  for (const ev of events) {
    summary.processed++;
    const eventType: string = ev?.eventType ?? ev?.type ?? "";
    const incoming = EVENT_MAP[eventType];
    if (!incoming) { summary.ignored++; console.log("[wati-webhook] ignored event type", eventType); continue; }

    const localMessageId: string | null = ev?.localMessageId ?? ev?.data?.localMessageId ?? null;
    if (!localMessageId) { summary.ignored++; console.log("[wati-webhook] event without localMessageId", eventType); continue; }

    // Cargar log actual
    const { data: log, error: loadErr } = await supabase
      .from("communication_logs")
      .select("id, whatsapp_estado, whatsapp_last_event_at, metadata")
      .eq("wati_local_message_id", localMessageId)
      .maybeSingle();
    if (loadErr) { console.error("[wati-webhook] load error", loadErr.message); continue; }
    if (!log) {
      summary.not_found++;
      console.log("[wati-webhook] localMessageId not found", localMessageId, "event", eventType);
      continue;
    }

    const current = (log.whatsapp_estado ?? null) as EstadoWA | null;
    const nuevo = nextEstado(current, incoming);

    // Timestamp del evento entrante
    const evtTimeRaw: string | undefined = ev?.timestamp ?? ev?.created ?? ev?.eventTimeStamp;
    let evtTime: Date;
    if (evtTimeRaw) {
      const parsed = new Date(evtTimeRaw);
      evtTime = isNaN(parsed.getTime()) ? new Date() : parsed;
    } else {
      evtTime = new Date();
    }
    // 5. No degradamos last_event_at con eventos más antiguos
    const prevLast = log.whatsapp_last_event_at ? new Date(log.whatsapp_last_event_at) : null;
    const newLast = prevLast && prevLast.getTime() > evtTime.getTime() ? prevLast : evtTime;

    // metadata.wati_events aditivo
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    const watiEvents = (meta.wati_events ?? {}) as Record<string, string>;
    const tsField = TIMESTAMP_FIELD[incoming];
    if (tsField && !watiEvents[tsField]) {
      watiEvents[tsField] = evtTime.toISOString();
    }

    const update: Record<string, unknown> = {
      whatsapp_estado: nuevo,
      whatsapp_last_event_at: newLast.toISOString(),
      metadata: { ...meta, wati_events: watiEvents, provider: "wati" },
    };

    if (incoming === "failed") {
      update.whatsapp_failed_code = String(ev?.failedCode ?? ev?.errorCode ?? "") || null;
      update.whatsapp_failed_detail = String(ev?.failedDetail ?? ev?.errorDetail ?? ev?.errorMessage ?? "") || null;
      // Reflejar también en el status general de la fila
      update.status = "fallido";
      update.error_message = update.whatsapp_failed_detail ?? "WhatsApp failed";
      // Circuit breaker por spam: si Wati marca "Spam Rate limit hit",
      // etiquetamos y contamos incidencias recientes para pausar la cola.
      const detail = String(update.whatsapp_failed_detail ?? "");
      if (/spam.*rate.*limit/i.test(detail)) {
        update.metadata = {
          ...(update.metadata as Record<string, unknown>),
          wati_error_code: "WATI_SPAM_RATELIMIT",
          wati_spam_at: new Date().toISOString(),
        };
      }
    } else if (current !== "failed") {
      // Solo refrescamos `status` general si no estábamos en failed.
      // sent/delivered/read/replied → status='enviado'
      update.status = "enviado";
    }

    const { error: upErr } = await supabase
      .from("communication_logs")
      .update(update)
      .eq("id", log.id);
    if (upErr) { console.error("[wati-webhook] update error", upErr.message); continue; }
    summary.updated++;

    // Tras registrar un fallo por spam, evaluamos ventana de 2 min.
    if (incoming === "failed" && /spam.*rate.*limit/i.test(String(update.whatsapp_failed_detail ?? ""))) {
      try {
        const sinceIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("communication_logs")
          .select("id", { count: "exact", head: true })
          .in("channel", ["whatsapp_business", "whatsapp_asistido"])
          .eq("status", "fallido")
          .ilike("whatsapp_failed_detail", "%Spam Rate limit hit%")
          .gte("whatsapp_last_event_at", sinceIso);
        if ((count ?? 0) >= 3) {
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await supabase.from("whatsapp_drain_locks").upsert({
            lock_key: "wati_spam_pause",
            acquired_at: new Date().toISOString(),
            acquired_by: "wati_webhook_spam_breaker",
            expires_at: expiresAt,
          });
          console.warn(`[wati-webhook] SPAM burst detected (${count} in 2min) → cola pausada hasta ${expiresAt}`);
        }
      } catch (e) {
        console.error("[wati-webhook] spam-breaker error", (e as Error).message);
      }
    }
  }

  console.log("[wati-webhook] summary", summary);
  return new Response(JSON.stringify({ ok: true, ...summary }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});