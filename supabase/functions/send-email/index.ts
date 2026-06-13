// Edge function: send-email
// Procesa los communication_logs en estado 'pendiente' del canal 'email'
// y los envía vía Resend, actualizando status a 'enviado' o 'fallido'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Remitente por defecto (dominio verificado en Resend)
const DEFAULT_FROM_ADDRESS = "FIGURARTE Casting & Producción <casting@figurarte.app>";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    let body: { limit?: number; ids?: string[]; batch_size?: number; delay_ms?: number; from?: string } = {};
    try { body = await req.json(); } catch (_) { /* empty body */ }
    const limit = Math.min(Math.max(body.limit ?? 100, 1), 1000);
    const batchSize = Math.min(Math.max(body.batch_size ?? 100, 1), 200);
    const delayMs = Math.min(Math.max(body.delay_ms ?? 500, 0), 10000);
    const fromAddress = (body.from && typeof body.from === "string" && body.from.trim().length > 0)
      ? body.from.trim()
      : DEFAULT_FROM_ADDRESS;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let query = supabase
      .from("communication_logs")
      .select("id, to_address, subject, body, metadata, session_id")
      .eq("channel", "email")
      .eq("status", "pendiente")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (body.ids && body.ids.length > 0) {
      query = supabase
        .from("communication_logs")
        .select("id, to_address, subject, body, metadata, session_id")
        .eq("channel", "email")
        .eq("status", "pendiente")
        .in("id", body.ids);
    }

    const { data: logs, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    const allLogs = logs ?? [];
    const sessionIds = Array.from(new Set(allLogs.map((log) => log.session_id).filter(Boolean)));
    const sessionsById = new Map<string, { starts_at?: string | null; ends_at?: string | null; doors_open_at?: string | null }>();
    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from("event_sessions")
        .select("id, starts_at, ends_at, doors_open_at")
        .in("id", sessionIds);
      for (const session of sessions ?? []) sessionsById.set(session.id, session);
    }

    let sent = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < allLogs.length; i++) {
      const log = allLogs[i];
      if (!log.to_address) {
        failed++;
        await supabase
          .from("communication_logs")
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
          : fromAddress;
        const payload: Record<string, unknown> = {
          from: effectiveFrom,
          to: [log.to_address],
          subject: log.subject ?? "(sin asunto)",
        };
        if (isHtml) payload.html = enrichedBody;
        else payload.text = enrichedBody;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Resend ${res.status}: ${text.slice(0, 500)}`);
        }
        const result = await res.json();

        await supabase
          .from("communication_logs")
          .update({
            status: "enviado",
            sent_at: new Date().toISOString(),
            error_message: null,
            metadata: { ...(log.metadata ?? {}), resend_id: result.id ?? null },
          })
          .eq("id", log.id);
        sent++;
      } catch (e) {
        const message = (e as Error).message ?? "Error desconocido";
        await supabase
          .from("communication_logs")
          .update({ status: "fallido", error_message: message })
          .eq("id", log.id);
        errors.push({ id: log.id, error: message });
        failed++;
      }

      // Delay entre emails dentro de un batch
      const isLast = i === allLogs.length - 1;
      const isBatchBoundary = (i + 1) % batchSize === 0;
      if (!isLast) {
        if (isBatchBoundary) {
          // Pausa más larga entre batches (2x el delay normal)
          await sleep(delayMs * 2);
        } else if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }

    return new Response(
      JSON.stringify({ configured: true, processed: allLogs.length, sent, failed, from: fromAddress, batch_size: batchSize, delay_ms: delayMs, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});