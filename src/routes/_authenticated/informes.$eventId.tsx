import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileSpreadsheet, AlertTriangle, Activity, Users, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEventReport } from "@/lib/use-reports";
import { exportReportExcel, exportReportPDF, exportReportDetailExcel } from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/informes/$eventId")({
  component: EventReportPage,
});

function EventReportPage() {
  const { eventId } = Route.useParams();
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const scope = { eventId, sessionId: sessionFilter === "all" ? undefined : sessionFilter };
  const { data, isLoading } = useEventReport(scope);

  if (isLoading || !data) {
    return <p className="text-sm text-muted-foreground">Cargando informe…</p>;
  }

  const phase = inferPhase(data.event.starts_at, data.event.ends_at);

  const handleExcel = async () => {
    try { await exportReportExcel(data, { sessionId: scope.sessionId }); toast.success("Excel generado"); }
    catch (e) { toast.error("Error generando Excel"); console.error(e); }
  };
  const handleDetail = async () => {
    try { await exportReportDetailExcel(data, { sessionId: scope.sessionId }); toast.success("Detalle generado"); }
    catch (e) { toast.error("Error generando detalle"); console.error(e); }
  };
  const handlePDF = async () => {
    try { await exportReportPDF(data, { sessionId: scope.sessionId }); toast.success("PDF generado"); }
    catch (e) { toast.error("Error generando PDF"); console.error(e); }
  };

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
        <Link to="/informes"><ArrowLeft className="h-4 w-4 mr-2" />Informes</Link>
      </Button>

      <PageHeader
        eyebrow={`Informe ${phase}`}
        title={data.event.name}
        description={[data.event.location_name, data.event.city].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={sessionFilter} onValueChange={setSessionFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sesiones</SelectItem>
                {data.sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExcel}
              title="Incluye hojas: Resumen, Sesiones, Asistentes, Detalle (titulares + acompañantes con nombre, email, teléfono, asiento) e Incidencias"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />Excel completo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDetail}
              title="Hojas: Asistentes (con check-in + walk-ins), Inscritos (titulares + acompañantes con origen y detalle), No asistentes, Resumen del evento"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />Detalle por sesión
            </Button>
            <Button size="sm" onClick={handlePDF}>
              <Download className="h-4 w-4 mr-2" />PDF
            </Button>
          </div>
        }
      />

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
    </div>
  );
}

function inferPhase(startsAt: string | null, endsAt: string | null): "previo" | "tiempo-real" | "final" {
  if (!startsAt) return "previo";
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = endsAt ? new Date(endsAt).getTime() : start + 6 * 3600_000;
  if (now < start) return "previo";
  if (now > end) return "final";
  return "tiempo-real";
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