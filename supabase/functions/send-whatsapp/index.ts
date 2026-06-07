// Edge function: send-whatsapp
// Procesa los communication_logs en estado 'pendiente' del canal
// 'whatsapp_business' o 'whatsapp_asistido' y los envía vía Wassenger,
// actualizando status a 'enviado' o 'fallido'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WASSENGER_ENDPOINT = "https://api.wassenger.com/v1/messages";

function normalizePhone(raw: string): string {
  let p = (raw ?? "").trim().replace(/[\s\-().]/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (!p.startsWith("+")) {
    // Asume España si parece móvil/fijo de 9 dígitos
    if (/^[6-9]\d{8}$/.test(p)) p = "+34" + p;
    else p = "+" + p;
  }
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const WASSENGER_API_KEY = Deno.env.get("WASSENGER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!WASSENGER_API_KEY) {
      return new Response(
        JSON.stringify({
          configured: false,
          message: "Wassenger no está configurado. Añade WASSENGER_API_KEY en los secrets.",
          sent: 0,
          failed: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    let body: { limit?: number; ids?: string[]; batch_size?: number; delay_ms?: number } = {};
    try { body = await req.json(); } catch (_) { /* empty body */ }
    const limit = Math.min(Math.max(body.limit ?? 100, 1), 1000);
    const batchSize = Math.min(Math.max(body.batch_size ?? 50, 1), 200);
    const delayMs = Math.min(Math.max(body.delay_ms ?? 800, 0), 10000);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const channels = ["whatsapp_business", "whatsapp_asistido"];

    let query = supabase
      .from("communication_logs")
      .select("id, to_address, body, metadata, channel")
      .in("channel", channels)
      .eq("status", "pendiente")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (body.ids && body.ids.length > 0) {
      query = supabase
        .from("communication_logs")
        .select("id, to_address, body, metadata, channel")
        .in("channel", channels)
        .eq("status", "pendiente")
        .in("id", body.ids);
    }

    const { data: logs, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    let sent = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    const allLogs = logs ?? [];
    for (let i = 0; i < allLogs.length; i++) {
      const log = allLogs[i];
      const phone = normalizePhone(log.to_address ?? "");
      if (!phone) {
        failed++;
        await supabase
          .from("communication_logs")
          .update({ status: "fallido", error_message: "Sin teléfono destinatario" })
          .eq("id", log.id);
        errors.push({ id: log.id, error: "Sin teléfono" });
        continue;
      }
      const message = (log.body ?? "").trim();
      if (!message) {
        failed++;
        await supabase
          .from("communication_logs")
          .update({ status: "fallido", error_message: "Mensaje vacío" })
          .eq("id", log.id);
        errors.push({ id: log.id, error: "Mensaje vacío" });
        continue;
      }

      try {
        const res = await fetch(WASSENGER_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Token": WASSENGER_API_KEY,
          },
          body: JSON.stringify({ phone, message }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Wassenger ${res.status}: ${text.slice(0, 500)}`);
        }
        const result = await res.json().catch(() => ({}));

        await supabase
          .from("communication_logs")
          .update({
            status: "enviado",
            sent_at: new Date().toISOString(),
            error_message: null,
            metadata: {
              ...(log.metadata ?? {}),
              wassenger_id: result?.id ?? null,
              wassenger_status: result?.status ?? null,
              provider: "wassenger",
            },
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

      const isLast = i === allLogs.length - 1;
      const isBatchBoundary = (i + 1) % batchSize === 0;
      if (!isLast) {
        if (isBatchBoundary) await sleep(delayMs * 2);
        else if (delayMs > 0) await sleep(delayMs);
      }
    }

    return new Response(
      JSON.stringify({ configured: true, processed: allLogs.length, sent, failed, batch_size: batchSize, delay_ms: delayMs, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});