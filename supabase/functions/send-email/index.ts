// Edge function: send-email
// Procesa los communication_logs en estado 'pendiente' del canal 'email'
// y los envía vía Resend, actualizando status a 'enviado' o 'fallido'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM_ADDRESS = "Figurarte Casting <casting@figurarte.es>";

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

    let body: { limit?: number; ids?: string[] } = {};
    try { body = await req.json(); } catch (_) { /* empty body */ }
    const limit = Math.min(Math.max(body.limit ?? 100, 1), 200);

    let query = supabase
      .from("communication_logs")
      .select("id, to_address, subject, body, metadata")
      .eq("channel", "email")
      .eq("status", "pendiente")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (body.ids && body.ids.length > 0) {
      query = supabase
        .from("communication_logs")
        .select("id, to_address, subject, body, metadata")
        .eq("channel", "email")
        .eq("status", "pendiente")
        .in("id", body.ids);
    }

    const { data: logs, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    let sent = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const log of logs ?? []) {
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
        const isHtml = (log.body ?? "").trim().startsWith("<");
        const payload: Record<string, unknown> = {
          from: FROM_ADDRESS,
          to: [log.to_address],
          subject: log.subject ?? "(sin asunto)",
        };
        if (isHtml) payload.html = log.body ?? "";
        else payload.text = log.body ?? "";

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
    }

    return new Response(
      JSON.stringify({ configured: true, processed: (logs ?? []).length, sent, failed, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});