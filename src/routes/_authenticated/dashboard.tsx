import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock, RefreshCw, ScanLine, Inbox, BarChart3, Settings2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Próximas sesiones · FIGURARTE Gatekeeper" },
      { name: "description", content: "Resumen ligero de las próximas sesiones de grabación." },
    ],
  }),
});

type Row = {
  id: string;
  name: string;
  starts_at: string;
  capacity: number;
  event_id: string;
  event_name: string;
  stats?: { solicitudes: number; aprobados: number; asistentes: number };
};

// Panel ligero: solo las próximas sesiones, sin refresco automático.
function useUpcomingSessions() {
  return useQuery({
    queryKey: ["dashboard-upcoming"],
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - 12 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("event_sessions")
        .select("id, name, starts_at, capacity, event_id, events(name)")
        .gte("starts_at", since)
        .neq("status", "cancelada")
        .order("starts_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      const rows: Row[] = (data ?? []).map((s: any) => ({
        id: s.id, name: s.name, starts_at: s.starts_at, capacity: s.capacity ?? 0,
        event_id: s.event_id, event_name: s.events?.name ?? "",
      }));
      if (rows.length === 0) return rows;
      const { data: counts, error: cErr } = await supabase.rpc("session_summary_counts", {
        _session_ids: rows.map((r) => r.id),
      });
      if (cErr) throw cErr;
      const byId = new Map((counts ?? []).map((c) => [c.session_id, c]));
      return rows.map((r) => {
        const c = byId.get(r.id);
        return c
          ? { ...r, stats: { solicitudes: Number(c.solicitudes), aprobados: Number(c.aprobados), asistentes: Number(c.asistentes) } }
          : r;
      });
    },
  });
}

function DashboardPage() {
  const { roles } = useAuth();
  const isValidadorOnly = roles.length > 0 && roles.every((r) => r === "validador");
  const { data, isLoading, isError, refetch, isFetching } = useUpcomingSessions();
  if (isValidadorOnly) return <Navigate to="/control-acceso" />;

  return (
    <div>
      <PageHeader
        eyebrow="Inicio"
        title="Próximas sesiones"
        description="Resumen rápido. Pulsa Actualizar para ver cifras al momento."
        actions={
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Actualizar
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">No se han podido cargar las sesiones. Pulsa Actualizar.</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay sesiones próximas. <Link to="/eventos" className="text-primary underline">Ver eventos</Link></p>
      ) : (
        <div className="space-y-3">
          {data.map((s) => {
            const d = new Date(s.starts_at);
            return (
              <Card key={s.id}>
                <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground truncate">{s.event_name}</div>
                    <div className="font-bold text-lg truncate">{s.name}</div>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-3 mt-1">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <Stat label="Aforo" value={s.capacity} />
                    <Stat label="Solicitudes" value={s.stats?.solicitudes ?? "—"} />
                    <Stat label="Aprobados" value={s.stats?.aprobados ?? "—"} />
                    <Stat label="Asistentes" value={s.stats?.asistentes ?? "—"} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm"><Link to="/control-acceso/$sessionId" params={{ sessionId: s.id }}><ScanLine className="h-4 w-4 mr-1" />Acceso</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link to="/solicitudes"><Inbox className="h-4 w-4 mr-1" />Solicitudes</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link to="/informes/$eventId" params={{ eventId: s.event_id }}><BarChart3 className="h-4 w-4 mr-1" />Informe</Link></Button>
                    <Button asChild size="sm" variant="ghost"><Link to="/eventos/$eventId/sesiones/$sessionId" params={{ eventId: s.event_id, sessionId: s.id }}><Settings2 className="h-4 w-4 mr-1" />Sesión</Link></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xl font-black tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
