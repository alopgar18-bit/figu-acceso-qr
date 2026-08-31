import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint público invocado por pg_cron cada minuto.
 * Toma jobs en cola con lock atómico y los ejecuta con SERVICE_ROLE,
 * independientemente de si el usuario que los creó sigue conectado.
 *
 * Autenticación: `apikey` header debe coincidir con SUPABASE_PUBLISHABLE_KEY
 * o con SUPABASE_ANON_KEY. No devuelve PII.
 */
export const Route = createFileRoute("/api/public/jobs/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        const provided = request.headers.get("apikey") ?? "";
        if (!anon || provided !== anon) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const owner = `worker-${crypto.randomUUID()}`;
        const results: Array<{ id: string; kind: string; status: string; error?: string }> = [];
        const maxJobs = 5;
        const budgetMs = 25_000; // deja margen dentro del límite del worker
        const startedAt = Date.now();

        for (let i = 0; i < maxJobs; i++) {
          if (Date.now() - startedAt > budgetMs) break;

          const { data: job, error: claimErr } = await supabaseAdmin.rpc(
            "claim_next_background_job",
            { _owner: owner, _lock_seconds: 120 },
          );
          if (claimErr) {
            console.error("[jobs.tick] claim failed", claimErr);
            break;
          }
          if (!job) break;

          const j = job as unknown as {
            id: string;
            kind: string;
            payload: Record<string, unknown>;
            attempts: number;
            max_attempts: number;
          };

          try {
            await runJob(j, supabaseAdmin);
            await supabaseAdmin
              .from("background_jobs")
              .update({
                status: "done",
                finished_at: new Date().toISOString(),
                lock_owner: null,
                lock_expires_at: null,
              })
              .eq("id", j.id);
            results.push({ id: j.id, kind: j.kind, status: "done" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const nextStatus = j.attempts >= j.max_attempts ? "failed" : "queued";
            await supabaseAdmin
              .from("background_jobs")
              .update({
                status: nextStatus,
                error: msg,
                finished_at: nextStatus === "failed" ? new Date().toISOString() : null,
                lock_owner: null,
                lock_expires_at: null,
              })
              .eq("id", j.id);
            results.push({ id: j.id, kind: j.kind, status: nextStatus, error: msg });
          }
        }

        // Vigilante: si quedan WhatsApp pendientes y no hay bloqueo de cola
        // vigente, relanza la cola sola (evita que un tramo caído la deje parada).
        let watchdog: string = "no_aplica";
        try {
          const { count: pendientes } = await supabaseAdmin
            .from("communication_logs")
            .select("id", { count: "exact", head: true })
            .eq("channel", "whatsapp_business")
            .eq("status", "pendiente");
          if ((pendientes ?? 0) > 0) {
            const { data: lock } = await supabaseAdmin
              .from("whatsapp_drain_locks")
              .select("expires_at")
              .eq("lock_key", "wati_drain")
              .maybeSingle();
            const vigente = lock?.expires_at && new Date(lock.expires_at).getTime() > Date.now();
            if (!vigente) {
              await dispatchSendWhatsapp({ id: "watchdog", payload: {} }, supabaseAdmin);
              watchdog = "relanzada";
            } else {
              watchdog = "en_curso";
            }
          } else {
            watchdog = "sin_pendientes";
          }
        } catch (err) {
          watchdog = `error: ${err instanceof Error ? err.message : String(err)}`;
          console.error("[jobs.tick] watchdog whatsapp", err);
        }

        // Vigilante de email: mismo mecanismo que WhatsApp, con el lock
        // "email_drain" que usa la función de envío por tramos.
        let watchdogEmail: string = "no_aplica";
        try {
          const { count: pendientesEmail } = await supabaseAdmin
            .from("communication_logs")
            .select("id", { count: "exact", head: true })
            .eq("channel", "email")
            .eq("status", "pendiente");
          if ((pendientesEmail ?? 0) > 0) {
            const { data: lockEmail } = await supabaseAdmin
              .from("whatsapp_drain_locks")
              .select("expires_at")
              .eq("lock_key", "email_drain")
              .maybeSingle();
            const vigente = lockEmail?.expires_at && new Date(lockEmail.expires_at).getTime() > Date.now();
            if (!vigente) {
              await dispatchSendEmail({ id: "watchdog", payload: {} }, supabaseAdmin);
              watchdogEmail = "relanzada";
            } else {
              watchdogEmail = "en_curso";
            }
          } else {
            watchdogEmail = "sin_pendientes";
          }
        } catch (err) {
          watchdogEmail = `error: ${err instanceof Error ? err.message : String(err)}`;
          console.error("[jobs.tick] watchdog email", err);
        }

        return new Response(JSON.stringify({ processed: results.length, results, watchdog, watchdogEmail }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });


      },
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runJob(job: { id: string; kind: string; payload: Record<string, unknown> }, admin: any): Promise<void> {
  switch (job.kind) {
    case "send_whatsapp":
      return dispatchSendWhatsapp(job, admin);
    case "send_email":
      return dispatchSendEmail(job, admin);
    default:
      throw new Error(`Kind no soportado por el tick: ${job.kind}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatchSendWhatsapp(job: { id: string; payload: Record<string, unknown> }, admin: any): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no disponibles");
  const ids = Array.isArray(job.payload?.ids) ? (job.payload.ids as string[]) : undefined;
  const res = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      ...(process.env.INTERNAL_JOBS_SECRET ? { "x-internal-secret": process.env.INTERNAL_JOBS_SECRET } : {}),
    },
    body: JSON.stringify(ids ? { ids } : {}),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
  if (job.id !== "watchdog") {
    await admin.from("background_jobs").update({ progress: parsed, result: parsed }).eq("id", job.id);
  }

  if (!res.ok && res.status !== 409) throw new Error(`send-whatsapp ${res.status}: ${text.slice(0, 200)}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dispatchSendEmail(job: { id: string; payload: Record<string, unknown> }, admin: any): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no disponibles");
  const body: Record<string, unknown> = { background: true, ...job.payload };
  const res = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      ...(process.env.INTERNAL_JOBS_SECRET ? { "x-internal-secret": process.env.INTERNAL_JOBS_SECRET } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
  if (job.id !== "watchdog") {
    await admin.from("background_jobs").update({ progress: parsed, result: parsed }).eq("id", job.id);
  }
  if (!res.ok && res.status !== 409) throw new Error(`send-email ${res.status}: ${text.slice(0, 200)}`);
}