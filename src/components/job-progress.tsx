import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, XCircle, Pause, Ban } from "lucide-react";
import { getBackgroundJob } from "@/lib/jobs.functions";
import { useKeepSessionAlive } from "@/hooks/use-keep-session-alive";

interface JobProgressProps {
  jobId: string;
  title?: string;
}

/**
 * Muestra el progreso de un background_job con polling ligero (3s).
 * Sobrevive al cierre de pestaña: al reabrir, muestra el estado actual.
 */
export function JobProgress({ jobId, title }: JobProgressProps) {
  const fetchJob = useServerFn(getBackgroundJob);
  const { data: job } = useQuery({
    queryKey: ["background_job", jobId],
    queryFn: () => fetchJob({ data: { id: jobId } }),
    refetchInterval: (q) => {
      const j = q.state.data;
      if (!j) return 3000;
      return ["done", "failed", "cancelled"].includes(j.status) ? false : 3000;
    },
  });

  const isActive = !!job && !["done", "failed", "cancelled"].includes(job.status);
  useKeepSessionAlive(isActive);

  if (!job) return null;

  const progress = (job.progress ?? {}) as { total?: number; done?: number; failed?: number; current_step?: string };
  const total = progress.total ?? 0;
  const done = progress.done ?? 0;
  const failed = progress.failed ?? 0;
  const pct = total > 0 ? Math.round(((done + failed) / total) * 100) : 0;

  const iconByStatus = {
    queued: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
    running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
    done: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    failed: <XCircle className="h-4 w-4 text-destructive" />,
    paused: <Pause className="h-4 w-4 text-amber-600" />,
    cancelled: <Ban className="h-4 w-4 text-muted-foreground" />,
  } as const;

  const labelByStatus = {
    queued: "En cola",
    running: "En proceso",
    done: "Completado",
    failed: "Con errores",
    paused: "Pausado",
    cancelled: "Cancelado",
  } as const;

  const status = job.status as keyof typeof labelByStatus;

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {iconByStatus[status] ?? iconByStatus.queued}
          <span>{title ?? `Proceso ${job.kind}`}</span>
        </div>
        <span className="text-xs text-muted-foreground">{labelByStatus[status] ?? status}</span>
      </div>
      {total > 0 && <Progress value={pct} />}
      <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
        {total > 0 && <span>{done + failed} / {total}</span>}
        {failed > 0 && <span className="text-destructive">Fallidos: {failed}</span>}
        {progress.current_step && <span>{progress.current_step}</span>}
      </div>
      {job.error && <div className="text-xs text-destructive">{job.error}</div>}
    </div>
  );
}