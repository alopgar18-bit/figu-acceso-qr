import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Pause, Play, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SendWhatsappError, invokeSendWhatsapp } from "@/lib/send-whatsapp-client";

interface Status {
  lockActive: boolean;
  lockExpiresAt: string | null;
  lockAcquiredAt: string | null;
  spamPauseActive: boolean;
  spamPauseUntil: string | null;
  pending: number;
  sentRecent: number;
  failedRecent: number;
  spamFailedRecent: number;
  lastSentAt: string | null;
  ratePerMin: number;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m ${diff % 60}s`;
  return `hace ${Math.floor(diff / 3600)}h`;
}

export function WhatsappQueueStatusBanner() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const sinceIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [lockRes, spamLockRes, pendRes, sentRes, failRes, spamFailRes, lastRes] = await Promise.all([
      supabase.from("whatsapp_drain_locks").select("acquired_at, expires_at").eq("lock_key", "wati_drain").maybeSingle(),
      supabase.from("whatsapp_drain_locks").select("acquired_at, expires_at").eq("lock_key", "wati_spam_pause").maybeSingle(),
      supabase.from("communication_logs").select("id", { count: "exact", head: true })
        .in("channel", ["whatsapp_business", "whatsapp_asistido"]).eq("status", "pendiente"),
      supabase.from("communication_logs").select("id", { count: "exact", head: true })
        .in("channel", ["whatsapp_business", "whatsapp_asistido"]).eq("status", "enviado").gte("sent_at", sinceIso),
      supabase.from("communication_logs").select("id", { count: "exact", head: true })
        .in("channel", ["whatsapp_business", "whatsapp_asistido"]).eq("status", "fallido").gte("created_at", sinceIso),
      supabase.from("communication_logs").select("id", { count: "exact", head: true })
        .in("channel", ["whatsapp_business", "whatsapp_asistido"]).eq("status", "fallido")
        .ilike("whatsapp_failed_detail", "%Spam Rate limit hit%").gte("created_at", since24hIso),
      supabase.from("communication_logs").select("sent_at")
        .in("channel", ["whatsapp_business", "whatsapp_asistido"]).eq("status", "enviado")
        .order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const lock = lockRes.data as { acquired_at: string; expires_at: string } | null;
    const lockActive = !!lock && new Date(lock.expires_at).getTime() > Date.now();
    const spamLock = spamLockRes.data as { acquired_at: string; expires_at: string } | null;
    const spamPauseActive = !!spamLock && new Date(spamLock.expires_at).getTime() > Date.now();
    // Rate: enviados en los últimos 5 min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: last5 } = await supabase.from("communication_logs").select("id", { count: "exact", head: true })
      .in("channel", ["whatsapp_business", "whatsapp_asistido"]).eq("status", "enviado").gte("sent_at", fiveMinAgo);
    setSt({
      lockActive,
      lockAcquiredAt: lock?.acquired_at ?? null,
      lockExpiresAt: lock?.expires_at ?? null,
      spamPauseActive,
      spamPauseUntil: spamLock?.expires_at ?? null,
      pending: pendRes.count ?? 0,
      sentRecent: sentRes.count ?? 0,
      failedRecent: failRes.count ?? 0,
      spamFailedRecent: spamFailRes.count ?? 0,
      lastSentAt: (lastRes.data as { sent_at: string | null } | null)?.sent_at ?? null,
      ratePerMin: Math.round(((last5 ?? 0) / 5) * 10) / 10,
    });
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 5000);
    return () => clearInterval(id);
  }, []);

  if (!st) return null;
  // No mostrar el banner si no hay nada en juego.
  if (!st.lockActive && !st.spamPauseActive && st.pending === 0 && st.sentRecent === 0 && st.spamFailedRecent === 0) return null;

  const lastSentMs = st.lastSentAt ? Date.now() - new Date(st.lastSentAt).getTime() : null;
  const stalled = st.lockActive && (lastSentMs == null || lastSentMs > 3 * 60 * 1000);
  const state: "active" | "stalled" | "idle" =
    st.lockActive && !stalled ? "active" : st.lockActive && stalled ? "stalled" : "idle";

  const totalKnown = st.pending + st.sentRecent;
  const pct = totalKnown > 0 ? Math.round((st.sentRecent / totalKnown) * 100) : 0;
  const etaMin = st.ratePerMin > 0 && st.pending > 0 ? Math.ceil(st.pending / st.ratePerMin) : null;

  const resume = async () => {
    setBusy(true);
    try {
      const data = await invokeSendWhatsapp<{
        busy?: boolean;
        paused?: boolean;
        background?: boolean;
        message?: string;
        sent?: number;
        failed?: number;
      }>({});
      if (data?.busy) toast.message(data.message ?? "Ya hay un envío en curso");
      else if (data?.paused) toast.message(data.message ?? "Cola pausada por Wati", { duration: 12000 });
      else if (data?.background) toast.success(data.message ?? "Cola reanudada en segundo plano");
      else toast.success(`Enviados: ${data?.sent ?? 0} · Fallidos: ${data?.failed ?? 0}`);
      await load();
    } catch (e) {
      if (e instanceof SendWhatsappError && (e.status === 401 || e.status === 403)) {
        toast.error(e.message);
      } else {
        toast.error((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  const releaseLock = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("whatsapp_drain_locks").delete().eq("lock_key", "wati_drain");
      if (error) throw error;
      toast.success("Bloqueo liberado. Ya puedes relanzar la cola.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const releaseSpamPause = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("whatsapp_drain_locks").delete().eq("lock_key", "wati_spam_pause");
      if (error) throw error;
      toast.success("Pausa por spam liberada manualmente. Puedes relanzar la cola.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tone =
    st.spamPauseActive
      ? "border-orange-500/60 bg-orange-50 dark:bg-orange-950/30"
      : state === "active"
      ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/30"
      : state === "stalled"
      ? "border-amber-500/60 bg-amber-50 dark:bg-amber-950/30"
      : "border-slate-300 bg-slate-50 dark:bg-slate-900/30";

  const dot =
    st.spamPauseActive ? "bg-orange-500" : state === "active" ? "bg-emerald-500 animate-pulse" : state === "stalled" ? "bg-amber-500" : "bg-slate-400";

  const label =
    st.spamPauseActive ? "Cola WhatsApp pausada — Wati marcó envíos como spam"
    : state === "active" ? "Envío masivo WhatsApp en curso"
    : state === "stalled" ? "Envío masivo WhatsApp detenido"
    : st.pending > 0 ? "Hay WhatsApps pendientes sin enviar" : "Sin envíos activos";

  return (
    <Card className={`mb-4 ${tone}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot}`} />
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {st.spamPauseActive && st.spamPauseUntil
                  ? <>Reanuda automáticamente a las <strong>{new Date(st.spamPauseUntil).toLocaleTimeString("es-ES")}</strong>. Wati bloquea envíos si detecta ráfagas.</>
                  : st.lockActive
                  ? <>Worker activo desde {fmtAgo(st.lockAcquiredAt)} · último envío {fmtAgo(st.lastSentAt)}</>
                  : <>Sin worker activo · último envío {fmtAgo(st.lastSentAt)}</>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {st.spamPauseActive && (
              <Button size="sm" variant="outline" onClick={releaseSpamPause} disabled={busy}
                title="Elimina la pausa automática por spam. Solo úsalo si sabes que Wati ya no está bloqueando.">
                <Unlock className="h-3.5 w-3.5 mr-1" />Reanudar ahora
              </Button>
            )}
            {(state === "stalled" || (!st.lockActive && st.pending > 0)) && (
              <Button size="sm" onClick={resume} disabled={busy}>
                <Play className="h-3.5 w-3.5 mr-1" />Reanudar cola
              </Button>
            )}
            {st.lockActive && (
              <Button size="sm" variant="outline" onClick={releaseLock} disabled={busy}
                title="Borra el bloqueo del worker. Úsalo sólo si el worker está muerto y quieres relanzar limpio.">
                <Unlock className="h-3.5 w-3.5 mr-1" />Liberar bloqueo
              </Button>
            )}
          </div>
        </div>

        <Progress value={pct} />
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums">
          <span className="text-emerald-700 dark:text-emerald-400">Enviados (2h): <strong>{st.sentRecent}</strong></span>
          <span className="text-muted-foreground">Pendientes: <strong>{st.pending}</strong></span>
          <span className="text-red-700 dark:text-red-400">Fallidos (2h): <strong>{st.failedRecent}</strong></span>
          {st.spamFailedRecent > 0 && (
            <span className="text-orange-700 dark:text-orange-400">Spam Wati (24h): <strong>{st.spamFailedRecent}</strong></span>
          )}
          <span className="text-muted-foreground">Ritmo: <strong>{st.ratePerMin}</strong> msg/min</span>
          {etaMin != null && <span className="text-muted-foreground">ETA: <strong>~{etaMin} min</strong></span>}
          {state === "stalled" && (
            <span className="text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
              <Pause className="h-3 w-3" />Sin envíos desde hace más de 3 min
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}