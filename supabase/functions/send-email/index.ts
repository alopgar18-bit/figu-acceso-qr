// Edge function: send-email
// Procesa los communication_logs en estado 'pendiente' del canal 'email'
// y los envía vía Resend, actualizando status a 'enviado' o 'fallido'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Remitente por defecto (dominio verificado en Resend)
const DEFAULT_FROM_ADDRESS = "FIGURARTE Casting & Producción <casting@figurarte.app>";

// Lista blanca de remitentes permitidos (dominios verificados).
// Cualquier override de `from` que no coincida se ignora silenciosamente.
const ALLOWED_FROM_DOMAINS = ["figurarte.app"];
function isAllowedFrom(from: string): boolean {
  const match = from.match(/<([^>]+)>\s*$/);
  const email = (match ? match[1] : from).trim().toLowerCase();
  const domain = email.split("@")[1];
  return !!domain && ALLOWED_FROM_DOMAINS.includes(domain);
}

function formatMadridTime(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
}

function completeMissingTimes(body: string, session?: { starts_at?: string | null; ends_at?: string | null; doors_open_at?: string | null } | null): string {
  if (!session) return body;
  const access = formatMadridTime(session.doors_open_at ?? session.starts_at);
  const start = formatMadridTime(session.starts_at);
  const end = formatMadridTime(session.ends_at);
  return body
    .replace(/\{\{\s*hora_acceso\s*\}\}/gi, access)
    .replace(/\{\{\s*hora_inicio\s*\}\}/gi, start)
    .replace(/\{\{\s*hora_fin\s*\}\}/gi, end)
    .replace(/(Hora de acceso:\s*)(?=(?:Hora de inicio:|Hora fin aprox\.?:|<\/p>|<br\s*\/?\s*>|\n|$))/gi, access ? `$1${access} ` : "$1")
    .replace(/(Hora de inicio:\s*)(?=(?:Hora fin aprox\.?:|<\/p>|<br\s*\/?\s*>|\n|$))/gi, start ? `$1${start} ` : "$1")
    .replace(/(Hora fin aprox\.?:\s*)(?=(?:<\/p>|<br\s*\/?\s*>|\n|$))/gi, end ? `$1${end}` : "$1")
    .replace(/(<strong>\s*Acceso:\s*<\/strong>\s*)(?=(?:·|<\/div>|<br\s*\/?\s*>|\n|$))/gi, access ? `$1${access} ` : "$1")
    .replace(/(<strong>\s*Inicio:\s*<\/strong>\s*)(?=(?:·|<\/div>|<br\s*\/?\s*>|\n|$))/gi, start ? `$1${start} ` : "$1")
    .replace(/(<strong>\s*Fin aprox\.?:\s*<\/strong>\s*)(?=(?:<\/div>|<br\s*\/?\s*>|\n|$))/gi, end ? `$1${end}` : "$1");
}

const BACKGROUND_THRESHOLD = 20;
const PAGE_SIZE = 1000;
const MAX_BACKGROUND_LOGS = 50000;

interface ProcessOptions {
  fromAddress: string;
  batchSize: number;
  delayMs: number;
  resendKey: string;
}

async function processEmailBatch(
  supabase: ReturnType<typeof createClient>,
  logs: Array<{ id: string; to_address: string | null; subject: string | null; body: string | null; metadata: Record<string, unknown> | null; session_id: string | null }>,
  opts: ProcessOptions,
) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const sessionIds = Array.from(new Set(logs.map((l) => l.session_id).filter(Boolean))) as string[];
  const sessionsById = new Map<string, { starts_at?: string | null; ends_at?: string | null; doors_open_at?: string | null }>();
  if (sessionIds.length > 0) {
    const { data: sessions } = await supabase
      .from("event_sessions")
      .select("id, starts_at, ends_at, doors_open_at")
      .in("id", sessionIds);
    for (const s of (sessions ?? []) as Array<{ id: string }>) sessionsById.set(s.id, s as never);
  }

  let sent = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!log.to_address) {
      failed++;
      await supabase.from("communication_logs")
        .update({ status: "fallido", error_message: "Sin destinatario" })
        .eq("id", log.id);
      errors.push({ id: log.id, error: "Sin destinatario" });
      continue;
    }
    try {
      const enrichedBody = completeMissingTimes(log.body ?? "", sessionsById.get(log.session_id ?? ""));
      const isHtml = enrichedBody.trim().startsWith("<");
      const perLogFrom = (log.metadata as Record<string, unknown> | null)?.from;
      const effectiveFrom = typeof perLogFrom === "string" && perLogFrom.trim().length > 0
        ? perLogFrom.trim()
        : opts.fromAddress;
      const payload: Record<string, unknown> = {
        from: effectiveFrom,
        to: [log.to_address],
        subject: log.subject ?? "(sin asunto)",
      };
      if (isHtml) payload.html = enrichedBody;
      else payload.text = enrichedBody;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.resendKey}` },
        body: JSON.stringify(payload),
      });

      if (res.status === 429) {
        // Respeta Retry-After y deja el resto pendiente para la próxima invocación.
        const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
        const waitMs = Math.min(Math.max(retryAfter, 1), 60) * 1000;
        console.warn(`[send-email] Resend 429, esperando ${waitMs}ms y abortando lote`);
        await sleep(waitMs);
        errors.push({ id: log.id, error: "Resend 429 rate limit, reintentar" });
        break;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Resend ${res.status}: ${text.slice(0, 500)}`);
      }
      const result = await res.json();
      await supabase.from("communication_logs").update({
        status: "enviado",
        sent_at: new Date().toISOString(),
        error_message: null,
        metadata: { ...(log.metadata ?? {}), resend_id: result.id ?? null },
      }).eq("id", log.id);
      sent++;
    } catch (e) {
      const message = (e as Error).message ?? "Error desconocido";
      await supabase.from("communication_logs")
        .update({ status: "fallido", error_message: message })
        .eq("id", log.id);
      errors.push({ id: log.id, error: message });
      failed++;
    }

    const isLast = i === logs.length - 1;
    const isBatchBoundary = (i + 1) % opts.batchSize === 0;
    if (!isLast) {
      if (isBatchBoundary) await sleep(opts.delayMs * 2);
      else if (opts.delayMs > 0) await sleep(opts.delayMs);
    }
  }

  return { sent, failed, processed: logs.length, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: solo administradores autenticados pueden invocar esta función.
    const auth = await requireAdmin(req, corsHeaders);
    if (!auth.ok) return auth.response;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({
          configured: false,
          message: "El servicio de email no está configurado. La cola se ha creado y los correos se enviarán cuando se active.",
          sent: 0,
          failed: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    let body: { limit?: number; ids?: string[]; batch_size?: number; delay_ms?: number; from?: string; background?: boolean } = {};
    try { body = await req.json(); } catch (_) { /* empty body */ }
    const limit = Math.min(Math.max(body.limit ?? 100, 1), 1000);
    const batchSize = Math.min(Math.max(body.batch_size ?? 100, 1), 200);
    const delayMs = Math.min(Math.max(body.delay_ms ?? 500, 0), 10000);
    const requestedFrom = (body.from && typeof body.from === "string") ? body.from.trim() : "";
    const fromAddress = requestedFrom && isAllowedFrom(requestedFrom)
      ? requestedFrom
      : DEFAULT_FROM_ADDRESS;

    // Resolver logs: si vienen ids explícitos los usamos, si no paginamos TODOS los pendientes.
    type LogRow = { id: string; to_address: string | null; subject: string | null; body: string | null; metadata: Record<string, unknown> | null; session_id: string | null };
    let allLogs: LogRow[] = [];
    if (body.ids && body.ids.length > 0) {
      const { data, error } = await supabase
        .from("communication_logs")
        .select("id, to_address, subject, body, metadata, session_id")
        .eq("channel", "email")
        .eq("status", "pendiente")
        .in("id", body.ids);
      if (error) throw error;
      allLogs = (data ?? []) as LogRow[];
    } else {
      const wantsBackground = body.background === true;
      const hardCap = wantsBackground ? MAX_BACKGROUND_LOGS : limit;
      let offset = 0;
      while (offset < hardCap) {
        const pageSize = Math.min(PAGE_SIZE, hardCap - offset);
        const { data, error } = await supabase
          .from("communication_logs")
          .select("id, to_address, subject, body, metadata, session_id")
          .eq("channel", "email")
          .eq("status", "pendiente")
          .order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const rows = (data ?? []) as LogRow[];
        if (rows.length === 0) break;
        allLogs = allLogs.concat(rows);
        if (rows.length < pageSize) break;
        offset += rows.length;
      }
    }

    const opts: ProcessOptions = { fromAddress, batchSize, delayMs, resendKey: RESEND_API_KEY };

    const shouldBackground = body.background === true || allLogs.length > BACKGROUND_THRESHOLD;
    if (shouldBackground && allLogs.length > 0) {
      const ids = allLogs.map((l) => l.id);
      // deno-lint-ignore no-explicit-any
      const ctx = globalThis as any;
      const bgPromise = processEmailBatch(supabase, allLogs, opts)
        .catch((e) => console.error("[send-email][bg] error", e));
      if (ctx.EdgeRuntime?.waitUntil) ctx.EdgeRuntime.waitUntil(bgPromise);
      return new Response(
        JSON.stringify({
          configured: true,
          background: true,
          queued: ids.length,
          queued_ids: ids,
          from: fromAddress,
          batch_size: batchSize,
          delay_ms: delayMs,
          message: `Procesando ${ids.length} envíos en segundo plano. Puedes cerrar esta ventana; el envío continúa en el servidor.`,
        }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await processEmailBatch(supabase, allLogs, opts);
    return new Response(
      JSON.stringify({ configured: true, ...result, from: fromAddress, batch_size: batchSize, delay_ms: delayMs }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});