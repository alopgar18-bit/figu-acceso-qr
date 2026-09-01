import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, FileSpreadsheet, AlertTriangle, Activity, Users, CheckCircle2, Clock, Loader2, RefreshCw, MousePointerClick } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventReport, useEventSessionsLite, inferReportPhase } from "@/lib/use-reports";
import { exportReportExcel, exportReportPDF, exportReportDetailExcel } from "@/lib/report-export";
import { exportReleasedSeatsExcel } from "@/lib/released-seats-export";


export const Route = createFileRoute("/_authenticated/informes/$eventId")({
  validateSearch: z.object({
    session_id: z.union([z.string().uuid(), z.literal("all")]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Informe de evento · FIGURARTE Access" },
      { name: "description", content: "Informe operativo de asistentes, accesos e incidencias por sesión." },
      { property: "og:title", content: "Informe de evento · FIGURARTE Access" },
      { property: "og:description", content: "Informe operativo de asistentes, accesos e incidencias por sesión." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EventReportPage,
});

function EventReportPage() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { data: sessionsLite, isLoading: sessionsLoading } = useEventSessionsLite(eventId);
  // El usuario elige explícitamente la sesión (o "todas") — así evitamos
  // lanzar la consulta pesada del evento completo por accidente.
  const sessionFilter = search.session_id ?? "";
  const list = sessionsLite ?? [];
  const scope = sessionFilter
    ? { eventId, sessionId: sessionFilter === "all" ? undefined : sessionFilter }
    : null;
  const { data, isLoading, isFetching, error, refetch } = useEventReport(scope);

  const phase = data ? inferReportPhase(data.event.starts_at, data.event.ends_at) : "previo";
  const currentSessionId = scope?.sessionId;
  const hasReport = !!data;

  const handleExcel = async () => {
    if (!data) return;
    try { await exportReportExcel(data, { sessionId: currentSessionId }); toast.success("Excel generado"); }
    catch (e) { toast.error("Error generando Excel"); console.error(e); }
  };
  const handleDetail = async () => {
    if (!data) return;
    try { await exportReportDetailExcel(data, { sessionId: currentSessionId }); toast.success("Detalle generado"); }
    catch (e) {
      console.error(e);
      const msg = e instanceof Error && e.message ? e.message : "Error generando detalle";
      toast.error(msg.length > 180 ? msg.slice(0, 180) + "…" : msg);
    }
  };
  const handleReleasedSeats = async () => {
    if (!data) return;
    try {
      const n = await exportReleasedSeatsExcel({
        eventId,
        sessionId: currentSessionId,
        eventName: data.event.name,
      });
      if (n === 0) toast.info("No hay butacas liberadas por cancelación en este filtro");
      else toast.success(`${n} butacas liberadas exportadas`);
    } catch (e) {
      console.error(e);
      toast.error("Error generando el Excel de butacas liberadas");
    }
  };
  const handlePDF = async () => {
    if (!data) return;
    try { await exportReportPDF(data, { sessionId: currentSessionId }); toast.success("PDF generado"); }
    catch (e) { toast.error("Error generando PDF"); console.error(e); }
  };


  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
        <Link to="/informes"><ArrowLeft className="h-4 w-4 mr-2" />Informes</Link>
      </Button>

      <PageHeader
        eyebrow={hasReport ? `Informe ${phase}` : "Informe"}
        title={data?.event.name ?? "Selecciona una sesión"}
        description={
          hasReport
            ? [data!.event.location_name, data!.event.city].filter(Boolean).join(" · ") || undefined
            : "Elige la sesión que quieres analizar para cargar el informe."
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={sessionFilter}
              onValueChange={(value) => {
                void navigate({
                  to: "/informes/$eventId",
                  params: { eventId },
                  search: { session_id: value as string },
                  replace: true,
                });
              }}
              disabled={sessionsLoading}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder={sessionsLoading ? "Cargando sesiones…" : "Selecciona sesión"} />
              </SelectTrigger>
              <SelectContent>
                {list.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
                <SelectItem value="all">Todas las sesiones (más lento)</SelectItem>
              </SelectContent>
            </Select>
            {isFetching && hasReport && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />Actualizando…
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExcel}
              disabled={!hasReport}
              title="Incluye hojas: Resumen, Sesiones, Asistentes, Detalle (titulares + acompañantes con nombre, email, teléfono, asiento) e Incidencias"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />Excel completo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDetail}
              disabled={!hasReport}
              title="Excel detallado: cada titular + acompañantes con nombre, DNI, email, teléfono, formulario de origen, sesión, asiento, check-in e incidencias"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />Excel detallado (titulares + acompañantes)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReleasedSeats}
              disabled={!hasReport}
              title="Butacas liberadas por cancelaciones o rechazos, listas para reasignar"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />Butacas liberadas (Excel)
            </Button>

            <Button size="sm" onClick={handlePDF} disabled={!hasReport}>
              <Download className="h-4 w-4 mr-2" />PDF
            </Button>
          </div>
        }
      />

      {!scope ? (
        <EmptySelectPrompt sessionsLoading={sessionsLoading} hasSessions={list.length > 0} />
      ) : error ? (
        <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <ReportSkeleton />
      ) : (
        <Tabs defaultValue={phase === "previo" ? "previo" : phase === "tiempo-real" ? "vivo" : "final"}>
        <TabsList>
          <TabsTrigger value="previo">Previo</TabsTrigger>
          <TabsTrigger value="vivo">Tiempo real</TabsTrigger>
          <TabsTrigger value="final">Final</TabsTrigger>
          <TabsTrigger value="sesiones">Por sesión</TabsTrigger>
        </TabsList>

        <TabsContent value="previo" className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<Users />} label="Solicitudes (personas)" value={data.totals.personasSolicitudes} />
          <Stat label="Pendientes (titulares)" value={data.totals.pendientes} />
          <Stat label="Aprobados (personas)" value={data.totals.personasAprobados} />
          <Stat label="Rechazados (personas)" value={data.totals.personasRechazados} />
          <Stat label="Lista de espera (personas)" value={data.totals.personasListaEspera} />
          <Stat icon={<CheckCircle2 />} label="Confirmados (personas)" value={data.totals.personasConfirmadas} />
          <Stat label="Cancelados (personas)" value={data.totals.personasCancelados} />
          <Stat label="Aforo disponible" value={Math.max(0, data.totals.capacidad - data.totals.personasConfirmadas)} />
          <Stat label="Ocupación" value={`${data.totals.ocupacion}%`} />
          <Stat label="Comunicaciones enviadas" value={data.totals.communicationsSent} />
          <Stat label="Errores comunicación" value={data.totals.communicationsErrors} tone={data.totals.communicationsErrors > 0 ? "danger" : "neutral"} />
        </TabsContent>

        <TabsContent value="vivo" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<CheckCircle2 />} label="Check-ins" value={data.totals.checkins} />
            <Stat icon={<Clock />} label="Pendientes de llegar" value={Math.max(0, data.totals.personasConfirmadas - data.totals.checkins)} />
            <Stat label="Aforo actual" value={data.totals.checkins} />
            <Stat icon={<Activity />} label="Validadores activos" value={data.totals.activeValidators} />
            <Stat icon={<AlertTriangle />} label="Incidencias" value={data.totals.incidents} tone={data.totals.incidents > 0 ? "warning" : "neutral"} />
            <Stat label="Intentos duplicados" value={data.totals.duplicateAttempts} />
          </div>
          <Card className="rounded-none">
            <CardHeader><CardTitle className="text-sm uppercase tracking-wider">Últimos accesos</CardTitle></CardHeader>
            <CardContent>
              {data.totals.lastCheckins.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin accesos aún.</p>
              ) : (
                <ul className="divide-y">
                  {data.totals.lastCheckins.map((c, i) => (
                    <li key={i} className="py-2 flex justify-between text-sm">
                      <span>{c.name}</span>
                      <span className="text-muted-foreground text-xs">{new Date(c.at).toLocaleTimeString("es-ES")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="final" className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total inscritos (personas)" value={data.totals.personasSolicitudes} />
          <Stat label="Total aprobados (personas)" value={data.totals.personasAprobados} />
          <Stat label="Total confirmados (personas)" value={data.totals.personasConfirmadas} />
          <Stat label="Asistentes reales" value={data.totals.checkins} />
          <Stat label="Entradas con QR" value={data.totals.checkinsQr} />
          <Stat label="Entradas manuales" value={data.totals.checkinsManual} />
          <Stat label="Entradas vía incidencia" value={data.totals.checkinsViaIncidencia} />
          <Stat label="No presentados (personas)" value={data.totals.personasNoPresentados} />
          <Stat label="Cancelaciones (personas)" value={data.totals.personasCancelados} />
          <Stat label="Lista de espera (personas)" value={data.totals.personasListaEspera} />
          <Stat label="Incidencias" value={data.totals.incidents} />
          <Stat
            label="Ratio confirmación → asistencia"
            value={data.totals.personasConfirmadas ? `${Math.round((data.totals.checkins / data.totals.personasConfirmadas) * 100)}%` : "—"}
          />
          <Stat
            label="Ratio no-show"
            value={data.totals.personasConfirmadas ? `${Math.round((data.totals.personasNoPresentados / data.totals.personasConfirmadas) * 100)}%` : "—"}
          />
        </TabsContent>

        <TabsContent value="sesiones" className="mt-6">
          <div className="border bg-background overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3">Sesión</th>
                  <th className="text-left p-3">Inicio</th>
                  <th className="text-right p-3">Aforo</th>
                  <th className="text-right p-3" title="Personas (titular + acompañantes)">Solic.</th>
                  <th className="text-right p-3" title="Personas (titular + acompañantes)">Aprob.</th>
                  <th className="text-right p-3" title="Personas confirmadas (titular + acompañantes)">Conf.</th>
                  <th className="text-right p-3">Asist.</th>
                  <th className="text-right p-3">QR</th>
                  <th className="text-right p-3">Manual</th>
                  <th className="text-right p-3">Incid.</th>
                  <th className="text-right p-3">No-show</th>
                  <th className="text-right p-3">Inc.</th>
                  <th className="text-right p-3">Ocup.</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.sessions.map((s) => {
                  const occ = s.capacity ? Math.round((s.stats.personasConfirmadas / s.capacity) * 100) : 0;
                  return (
                    <tr key={s.id}>
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-muted-foreground">{s.starts_at ? new Date(s.starts_at).toLocaleString("es-ES") : "—"}</td>
                      <td className="p-3 text-right">{s.capacity}</td>
                      <td className="p-3 text-right">{s.stats.personasSolicitudes}</td>
                      <td className="p-3 text-right">{s.stats.personasAprobados}</td>
                      <td className="p-3 text-right">{s.stats.personasConfirmadas}</td>
                      <td className="p-3 text-right">{s.stats.checkins}</td>
                      <td className="p-3 text-right">{s.stats.checkinsQr}</td>
                      <td className="p-3 text-right">{s.stats.checkinsManual}</td>
                      <td className="p-3 text-right">{s.stats.checkinsViaIncidencia}</td>
                      <td className="p-3 text-right">{s.stats.personasNoPresentados}</td>
                      <td className="p-3 text-right">{s.stats.incidencias}</td>
                      <td className="p-3 text-right">
                        <Badge variant={occ > 90 ? "destructive" : "outline"}>{occ}%</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone = "neutral" }: { icon?: React.ReactNode; label: string; value: number | string; tone?: "neutral" | "danger" | "warning" }) {
  const accent = tone === "danger" ? "border-l-destructive" : tone === "warning" ? "border-l-amber-500" : "border-l-primary";
  return (
    <Card className={`rounded-none border-l-4 ${accent}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          {icon && <span className="text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
        </div>
        <div className="text-2xl font-black mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptySelectPrompt({ sessionsLoading, hasSessions }: { sessionsLoading: boolean; hasSessions: boolean }) {
  return (
    <Card className="rounded-none border-dashed">
      <CardContent className="p-10 flex flex-col items-center text-center gap-3">
        {sessionsLoading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Cargando sesiones del evento…</p>
          </>
        ) : !hasSessions ? (
          <>
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm font-medium">Este evento no tiene sesiones</p>
            <p className="text-xs text-muted-foreground">Crea al menos una sesión para poder generar informes.</p>
          </>
        ) : (
          <>
            <MousePointerClick className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Selecciona una sesión para cargar el informe</p>
            <p className="text-xs text-muted-foreground max-w-md">
              Los eventos grandes pueden tardar varios segundos. Elegir una sesión concreta
              acelera la carga; "Todas las sesiones" carga el evento completo.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <Card className="rounded-none border-destructive/50">
      <CardContent className="p-10 flex flex-col items-center text-center gap-3">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">No se pudo cargar el informe</p>
        {message && <p className="text-xs text-muted-foreground max-w-lg break-words">{message}</p>}
        <p className="text-xs text-muted-foreground max-w-md">
          Puede deberse a un timeout por volumen de datos. Prueba con una sesión concreta
          o vuelve a intentarlo.
        </p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />Reintentar
        </Button>
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Generando informe… en eventos grandes puede tardar hasta un minuto.
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="rounded-none border-l-4 border-l-primary/40">
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}