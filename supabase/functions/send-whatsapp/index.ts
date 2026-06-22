// Edge function: send-whatsapp
// Procesa los communication_logs en estado 'pendiente' del canal
// 'whatsapp_business' o 'whatsapp_asistido' y los envía vía el proveedor
// indicado por el secret WHATSAPP_PROVIDER ("wassenger" por defecto, "wati"
// cuando se valide el cambio en producción).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizarTelefonoES } from "../_shared/phone.ts";
import {
  buildWatiParameters,
  formatFechaLarga,
  formatHora,
  watiSendTemplateBatch,
  watiSendTemplateIndividual,
  type InvitacionContext,
} from "../_shared/wati-format.ts";

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
    const PROVIDER = (Deno.env.get("WHATSAPP_PROVIDER") ?? "wassenger").toLowerCase();
    const WASSENGER_API_KEY = Deno.env.get("WASSENGER_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let body: { limit?: number; ids?: string[]; batch_size?: number; delay_ms?: number } = {};
    try { body = await req.json(); } catch (_) { /* empty body */ }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ─── Branch: WATI ────────────────────────────────────────────────────────
    if (PROVIDER === "wati") {
      return await runWati(supabase, body);
    }

    // ─── Branch: WASSENGER (intacto) ─────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// WATI
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATE_NAME = "entrada_grabacin";
const TEMPLATE_LANGUAGE = "es"; // Spanish (la plantilla aprobada en Wati es Spanish)
const PUBLIC_SITE_URL_FALLBACK = "https://figurarte.app";

type CommLogRow = {
  id: string;
  to_address: string | null;
  participant_id: string | null;
  event_id: string | null;
  session_id: string | null;
  batch_id: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
  whatsapp_estado: string | null;
  wati_local_message_id: string | null;
};

async function runWati(
  supabase: ReturnType<typeof createClient>,
  body: { limit?: number; ids?: string[] },
) {
  const endpoint = Deno.env.get("WATI_API_ENDPOINT");
  const token = Deno.env.get("WATI_ACCESS_TOKEN");
  const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? PUBLIC_SITE_URL_FALLBACK;

  if (!endpoint || !token) {
    return new Response(
      JSON.stringify({
        configured: false,
        provider: "wati",
        message: "Wati no está configurado: faltan WATI_API_ENDPOINT o WATI_ACCESS_TOKEN.",
        sent: 0, failed: 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const channels = ["whatsapp_business", "whatsapp_asistido"];
  const limit = Math.min(Math.max(body.limit ?? 100, 1), 1000);

  let query = supabase
    .from("communication_logs")
    .select("id, to_address, participant_id, event_id, session_id, batch_id, metadata, status, whatsapp_estado, wati_local_message_id")
    .in("channel", channels)
    .eq("status", "pendiente")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (body.ids && body.ids.length > 0) {
    query = supabase
      .from("communication_logs")
      .select("id, to_address, participant_id, event_id, session_id, batch_id, metadata, status, whatsapp_estado, wati_local_message_id")
      .in("channel", channels)
      .in("id", body.ids);
  }

  const { data: rawLogs, error: fetchErr } = await query;
  if (fetchErr) throw fetchErr;
  const logs = (rawLogs ?? []) as unknown as CommLogRow[];

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ id: string; error: string }> = [];

  // Filtramos por idempotencia y validaciones previas
  type Prepared = {
    log: CommLogRow;
    phone: string;
    ctx: InvitacionContext;
    isTest: boolean;
  };
  const prepared: Prepared[] = [];

  for (const log of logs) {
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    const isTest = meta.wati_test === true;
    const forceResend = meta.force_resend === true || isTest;

    // Idempotencia: omitir si ya enviado, salvo reenvío explícito
    const alreadySent = log.whatsapp_estado === "sent" || log.wati_local_message_id != null || log.status === "enviado";
    if (alreadySent && !forceResend) {
      skipped++;
      continue;
    }

    // Teléfono
    const phone = normalizarTelefonoES(log.to_address ?? "");
    if (!phone) {
      await supabase.from("communication_logs").update({
        status: "fallido",
        whatsapp_estado: "failed",
        error_message: "telefono_invalido",
        whatsapp_failed_detail: `Teléfono no válido: ${log.to_address ?? ""}`,
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "telefono_invalido" });
      failed++;
      continue;
    }

    if (!log.participant_id || !log.session_id || !log.event_id) {
      await supabase.from("communication_logs").update({
        status: "fallido",
        whatsapp_estado: "failed",
        error_message: "log_incompleto",
        whatsapp_failed_detail: "Falta participant_id/session_id/event_id en el log",
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "log_incompleto" });
      failed++;
      continue;
    }

    // Cargar participante + persona
    const { data: part } = await supabase
      .from("event_participants")
      .select("id, confirmation_token, seat_zone, seat_row, seat_number, person_id, people(first_name)")
      .eq("id", log.participant_id)
      .maybeSingle();
    if (!part) {
      await supabase.from("communication_logs").update({
        status: "fallido", whatsapp_estado: "failed",
        error_message: "participante_no_encontrado",
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "participante_no_encontrado" });
      failed++;
      continue;
    }
    const zona = (part.seat_zone ?? "").toString().trim();
    const fila = (part.seat_row ?? "").toString().trim();
    const asiento = (part.seat_number ?? "").toString().trim();
    if (!zona || !fila || !asiento) {
      await supabase.from("communication_logs").update({
        status: "fallido", whatsapp_estado: "failed",
        error_message: "pendiente_asiento",
        whatsapp_failed_detail: "Faltan zona/fila/asiento",
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "pendiente_asiento" });
      failed++;
      continue;
    }
    const token: string | null = part.confirmation_token ?? null;
    if (!token) {
      await supabase.from("communication_logs").update({
        status: "fallido", whatsapp_estado: "failed",
        error_message: "sin_confirmation_token",
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "sin_confirmation_token" });
      failed++;
      continue;
    }

    // Cargar sesión + evento
    const { data: sess } = await supabase
      .from("event_sessions")
      .select("id, starts_at, doors_open_at, ends_at, location_name, location_address, events(name)")
      .eq("id", log.session_id)
      .maybeSingle();
    if (!sess) {
      await supabase.from("communication_logs").update({
        status: "fallido", whatsapp_estado: "failed",
        error_message: "sesion_no_encontrada",
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "sesion_no_encontrada" });
      failed++;
      continue;
    }
    const startsAt: string | null = sess.starts_at ?? null;
    if (!startsAt) {
      await supabase.from("communication_logs").update({
        status: "fallido", whatsapp_estado: "failed",
        error_message: "sesion_sin_starts_at",
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "sesion_sin_starts_at" });
      failed++;
      continue;
    }
    const programa: string = ((sess.events as unknown as { name?: string })?.name) ?? "";
    const locName: string = ((sess as unknown as { location_name?: string | null }).location_name ?? "").toString().trim();
    const locAddr: string = ((sess as unknown as { location_address?: string | null }).location_address ?? "").toString().trim();
    const lugar: string = [locName, locAddr].filter(Boolean).join(", ");
    const doorsOpenAt: string | null = (sess as unknown as { doors_open_at?: string | null }).doors_open_at ?? null;
    const endsAt: string | null = (sess as unknown as { ends_at?: string | null }).ends_at ?? null;
    const horaAcceso: string = doorsOpenAt ? formatHora(doorsOpenAt) : "";
    const horaFin: string = endsAt ? formatHora(endsAt) : "";
    if (!programa || !lugar || !horaAcceso || !horaFin) {
      await supabase.from("communication_logs").update({
        status: "fallido", whatsapp_estado: "failed",
        error_message: "sesion_incompleta",
        whatsapp_failed_detail: `Faltan datos de sesión (programa/lugar/doors_open_at/ends_at)`,
      }).eq("id", log.id);
      errors.push({ id: log.id, error: "sesion_incompleta" });
      failed++;
      continue;
    }

    const nombre = ((part.people as unknown as { first_name?: string })?.first_name) ?? "";
    const enlace_entrada = `${publicSiteUrl.replace(/\/$/, "")}/og/c/${token}`;

    const ctx: InvitacionContext = {
      nombre,
      programa,
      fecha: formatFechaLarga(startsAt),
      hora_acceso: horaAcceso,
      hora_inicio: formatHora(startsAt),
      hora_fin: horaFin,
      zona, fila, asiento, lugar,
      enlace_entrada,
    };
    prepared.push({ log, phone, ctx, isTest });

    // Si es reenvío forzado, limpiamos campos previos para no liar el seguimiento.
    if (forceResend && (log.wati_local_message_id || log.whatsapp_estado)) {
      await supabase.from("communication_logs").update({
        wati_local_message_id: null,
        whatsapp_estado: null,
        whatsapp_failed_code: null,
        whatsapp_failed_detail: null,
        whatsapp_last_event_at: null,
        error_message: null,
      }).eq("id", log.id);
    }
  }

  // Modo INDIVIDUAL si hay un solo destinatario (o cualquier item marcado como test)
  // → uno por uno con sendTemplateMessage. Producción masiva → batch.
  const useBatch = prepared.length > 1 && prepared.every((p) => !p.isTest);

  if (!useBatch) {
    for (const p of prepared) {
      const broadcast = p.log.batch_id
        ? `batch_${p.log.batch_id}`
        : p.isTest
          ? `wati_test_${new Date().toISOString()}`
          : `manual_${new Date().toISOString()}`;
      const res = await watiSendTemplateIndividual({
        endpoint: endpoint!, token: token!,
        templateName: TEMPLATE_NAME,
        broadcastName: broadcast,
        whatsappNumber: p.phone,
        parameters: buildWatiParameters(p.ctx),
        language: TEMPLATE_LANGUAGE,
      });
      if (res.ok && res.localMessageId) {
        await supabase.from("communication_logs").update({
          status: "enviado",
          sent_at: new Date().toISOString(),
          wati_local_message_id: res.localMessageId,
          whatsapp_estado: "sent",
          error_message: null,
          metadata: {
            ...(p.log.metadata ?? {}),
            provider: "wati",
            wati_broadcast_name: broadcast,
          },
        }).eq("id", p.log.id);
        sent++;
      } else {
        await supabase.from("communication_logs").update({
          status: "fallido",
          whatsapp_estado: "failed",
          whatsapp_failed_detail: res.errorDetail ?? "Error desconocido de Wati",
          error_message: res.errorDetail ?? "Wati error",
          metadata: {
            ...(p.log.metadata ?? {}),
            provider: "wati",
            wati_broadcast_name: broadcast,
          },
        }).eq("id", p.log.id);
        failed++;
        errors.push({ id: p.log.id, error: res.errorDetail ?? "Wati error" });
      }
    }
  } else {
    // Batch
    const broadcast = prepared[0]?.log.batch_id
      ? `batch_${prepared[0].log.batch_id}`
      : `manual_${new Date().toISOString()}`;
    const receivers = prepared.map((p) => ({
      whatsappNumber: p.phone,
      customParams: buildWatiParameters(p.ctx),
    }));
    const res = await watiSendTemplateBatch({
      endpoint: endpoint!, token: token!,
      templateName: TEMPLATE_NAME,
      broadcastName: broadcast,
      receivers,
      language: TEMPLATE_LANGUAGE,
    });

    for (const p of prepared) {
      const r = res.perReceiver[p.phone] ?? { ok: false, localMessageId: null, errorDetail: res.errorDetail ?? "Sin respuesta" };
      if (r.ok && r.localMessageId) {
        await supabase.from("communication_logs").update({
          status: "enviado",
          sent_at: new Date().toISOString(),
          wati_local_message_id: r.localMessageId,
          whatsapp_estado: "sent",
          error_message: null,
          metadata: {
            ...(p.log.metadata ?? {}),
            provider: "wati",
            wati_broadcast_name: broadcast,
          },
        }).eq("id", p.log.id);
        sent++;
      } else {
        await supabase.from("communication_logs").update({
          status: "fallido",
          whatsapp_estado: "failed",
          whatsapp_failed_detail: r.errorDetail ?? "Error desconocido de Wati",
          error_message: r.errorDetail ?? "Wati error",
          metadata: {
            ...(p.log.metadata ?? {}),
            provider: "wati",
            wati_broadcast_name: broadcast,
          },
        }).eq("id", p.log.id);
        failed++;
        errors.push({ id: p.log.id, error: r.errorDetail ?? "Wati error" });
      }
    }
  }

  return new Response(
    JSON.stringify({
      configured: true, provider: "wati",
      processed: logs.length, sent, failed, skipped, errors,
      mode: useBatch ? "batch" : "individual",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}