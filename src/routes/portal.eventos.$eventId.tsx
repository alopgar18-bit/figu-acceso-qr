import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, AlertTriangle } from "lucide-react";
import { useClientContext, useClientEventDetail, useClientIncidents } from "@/lib/use-client-portal";
import { labelOf, EVENT_STATUS_OPTIONS, EVENT_TYPE_OPTIONS, SESSION_STATUS_OPTIONS } from "@/lib/event-constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/eventos/$eventId")({
  component: EventDetail,
});

function EventDetail() {
  const { eventId } = Route.useParams();
  const { data: ctx } = useClientContext();
  const perms = ctx?.perms;
  const { data, isLoading } = useClientEventDetail(eventId);
  const { data: incidents = [] } = useClientIncidents(perms?.see_incidents ? eventId : undefined);

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  const { event, sessions, statsBySession, totals } = data;

  const handleExportCSV = () => {
    if (!perms?.export_data) {
      toast.error("Tu acceso no permite descargar datos.");
      return;
    }
    const headers = ["Sesion", "Inicio", "Aforo", "Solicitudes", "Aprobados", "Confirmados", "Check-ins"];
    const rows = sessions.map((s) => {
      const st = statsBySession.get(s.id) ?? { solicitudes: 0, aprobados: 0, confirmados: 0, checkins: 0 };
      return [s.name, s.starts_at ?? "", s.capacity ?? 0, st.solicitudes, st.aprobados, st.confirmados, st.checkins].join(";");
    });
    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${event.name}-sesiones.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
        <Link to="/portal/eventos"><ArrowLeft className="h-4 w-4 mr-2" />Eventos</Link>
      </Button>

      <PageHeader
        eyebrow={labelOf(EVENT_TYPE_OPTIONS, event.event_type)}
        title={event.name}
        description={[event.location_name, event.city].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">{labelOf(EVENT_STATUS_OPTIONS, event.status)}</Badge>
            {perms?.export_data && (
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />CSV
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <Stat label="Sesiones" value={totals.sesiones} />
        <Stat label="Aforo total" value={totals.capacidad} />
        <Stat label="Solicitudes" value={totals.solicitudes} />
        <Stat label="Confirmados" value={totals.confirmados} />
        {perms?.see_checkin_status && <Stat label="Check-ins" value={totals.checkins} />}
      </div>

      <Tabs defaultValue="sesiones">
        <TabsList>
          <TabsTrigger value="sesiones">Sesiones</TabsTrigger>
          <TabsTrigger value="stats">Estadísticas</TabsTrigger>
          {perms?.see_incidents && <TabsTrigger value="inc">Incidencias</TabsTrigger>}
        </TabsList>

        <TabsContent value="sesiones" className="mt-4">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">Este evento aún no tiene sesiones programadas.</p>
          ) : (
            <div className="border bg-background">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="text-left p-3">Sesión</th>
                    <th className="text-left p-3">Inicio</th>
                    <th className="text-right p-3">Aforo</th>
                    <th className="text-right p-3">Confirmados</th>
                    {perms?.see_checkin_status && <th className="text-right p-3">Check-ins</th>}
                    <th className="text-right p-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.map((s) => {
                    const st = statsBySession.get(s.id) ?? { confirmados: 0, checkins: 0, personasConf: 0 };
                    const occ = s.capacity ? Math.round((st.personasConf / s.capacity) * 100) : 0;
                    return (
                      <tr key={s.id}>
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3 text-muted-foreground">{s.starts_at ? new Date(s.starts_at).toLocaleString("es-ES") : "—"}</td>
                        <td className="p-3 text-right">{s.capacity}</td>
                        <td className="p-3 text-right">{st.confirmados} <span className="text-xs text-muted-foreground">({occ}%)</span></td>
                        {perms?.see_checkin_status && <td className="p-3 text-right">{st.checkins}</td>}
                        <td className="p-3 text-right">
                          <Badge variant="outline">{labelOf(SESSION_STATUS_OPTIONS, s.status)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <Card className="rounded-none">
            <CardHeader><CardTitle className="text-sm uppercase tracking-wider">Resumen del evento</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
              <div><div className="text-muted-foreground text-xs uppercase tracking-wider">Solicitudes recibidas</div><div className="text-2xl font-bold">{totals.solicitudes}</div></div>
              <div><div className="text-muted-foreground text-xs uppercase tracking-wider">Confirmados</div><div className="text-2xl font-bold">{totals.confirmados}</div></div>
              <div><div className="text-muted-foreground text-xs uppercase tracking-wider">Aforo</div><div className="text-2xl font-bold">{totals.capacidad}</div></div>
              {perms?.see_checkin_status && (
                <div><div className="text-muted-foreground text-xs uppercase tracking-wider">Check-ins</div><div className="text-2xl font-bold">{totals.checkins}</div></div>
              )}
              <div className="sm:col-span-2 text-xs text-muted-foreground pt-2 border-t">
                Los datos personales (nombres, DNI, email, teléfono) no se muestran salvo que FIGURARTE haya activado esos permisos para tu cliente.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {perms?.see_incidents && (
          <TabsContent value="inc" className="mt-4">
            {incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">Sin incidencias registradas.</p>
            ) : (
              <ul className="divide-y border bg-background">
                {incidents.map((i) => (
                  <li key={i.id} className="p-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{i.title}</span>
                        <Badge variant="outline" className="text-[10px]">{i.severity}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{i.status}</Badge>
                      </div>
                      {i.description && <p className="text-xs text-muted-foreground mt-1">{i.description}</p>}
                      <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                        {i.event_sessions?.name ?? ""} · {new Date(i.created_at).toLocaleString("es-ES")}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="rounded-none border-l-4 border-l-primary">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-black mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}