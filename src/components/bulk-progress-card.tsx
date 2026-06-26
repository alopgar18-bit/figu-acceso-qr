import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { X, Pause, Play } from "lucide-react";

interface BulkProgressCardProps {
  title: string;
  current: number;
  total: number;
  startedAt?: number;
  stats?: Array<{ label: string; value: number | string; tone?: "ok" | "warn" | "danger" }>;
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  done?: boolean;
  doneLabel?: string;
}

export function BulkProgressCard({
  title,
  current,
  total,
  startedAt,
  stats,
  paused,
  onPause,
  onResume,
  onCancel,
  done,
  doneLabel,
}: BulkProgressCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const rate = elapsed > 0 && current > 0 ? current / elapsed : 0;
  const remaining = total - current;
  const etaSec = rate > 0 ? Math.round(remaining / rate) : null;
  const etaTxt = etaSec !== null && remaining > 0
    ? etaSec >= 60
      ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`
      : `${etaSec}s`
    : null;

  return (
    <Card className={done ? "border-emerald-500/40 bg-emerald-500/5" : "border-primary/40 bg-primary/5"}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-sm">{title}</div>
          <div className="flex items-center gap-2">
            {!done && onPause && !paused && (
              <Button size="sm" variant="outline" onClick={onPause}>
                <Pause className="h-3 w-3 mr-1" />Pausar
              </Button>
            )}
            {!done && paused && onResume && (
              <Button size="sm" variant="outline" onClick={onResume}>
                <Play className="h-3 w-3 mr-1" />Reanudar
              </Button>
            )}
            {!done && onCancel && (
              <Button size="sm" variant="outline" onClick={onCancel}>
                <X className="h-3 w-3 mr-1" />Cancelar
              </Button>
            )}
          </div>
        </div>
        <Progress value={pct} />
        <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
          <span>
            {done ? (doneLabel ?? "Completado") : paused ? "Pausado" : "En curso"} · {current} / {total} ({pct}%)
          </span>
          {etaTxt && !done && <span>ETA ~{etaTxt}</span>}
        </div>
        {stats && stats.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            {stats.map((s, i) => (
              <div
                key={i}
                className={
                  s.tone === "ok"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : s.tone === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : s.tone === "danger"
                    ? "text-red-600 dark:text-red-400"
                    : ""
                }
              >
                <span className="text-muted-foreground">{s.label}: </span>
                <strong>{s.value}</strong>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}