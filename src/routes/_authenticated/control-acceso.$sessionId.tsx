import { useState, useCallback, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ScanLine, Search, BarChart3, AlertTriangle, CheckCircle2, XCircle, Clock, Ban, ShieldAlert, WifiOff, UserCheck, Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { QrScanner, extractQrToken } from "@/components/qr-scanner";
import { validateQr, manualCheckin, createIncident, searchSessionParticipants, type ValidationResult } from "@/lib/access.functions";
import { useSessionDashboard, useSessionIncidents } from "@/lib/use-access";
import { INCIDENT_TYPE_LABELS, INCIDENT_TYPES, type IncidentType } from "@/lib/incident-constants";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/control-acceso/$sessionId")({
  component: Page,
});

function Page() {
  const { sessionId } = Route.useParams();
  const { isAdmin, hasAnyRole } = useAuth();
  const isCoord = isAdmin || hasAnyRole(["coordinador"]);

  const { data: session, isLoading } = useQuery({
    queryKey: ["session-with-event", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("*, events(id, name, status)")
        .eq("id", sessionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!session) {
    return <div className="text-sm text-destructive">Sesión no encontrada</div>;
  }

  const event = session.events as { id: string; name: string; status: string } | null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/control-acceso" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Sesiones
        </Link>
      </div>
      <div>
        <div className="text-xs uppercase tracking-[0.25em] text-primary font-semibold">{event?.name}</div>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase mt-1">{session.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(new Date(session.starts_at), "PPpp", { locale: es })} · Aforo {session.capacity}
        </p>
      </div>

      <OnlineBanner />

      <Tabs defaultValue="scanner" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="scanner"><ScanLine className="h-4 w-4 mr-2" />Escáner</TabsTrigger>
          <TabsTrigger value="search"><Search className="h-4 w-4 mr-2" />Buscar</TabsTrigger>
          <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-2" />Aforo</TabsTrigger>
          <TabsTrigger value="incidents"><AlertTriangle className="h-4 w-4 mr-2" />Incidencias</TabsTrigger>
        </TabsList>

        <TabsContent value="scanner" className="mt-6">
          <ScannerTab sessionId={sessionId} eventId={session.event_id} isCoord={isCoord} />
        </TabsContent>
        <TabsContent value="search" className="mt-6">
          <SearchTab sessionId={sessionId} eventId={session.event_id} isCoord={isCoord} />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab sessionId={sessionId} />
        </TabsContent>
        <TabsContent value="incidents" className="mt-6">
          <IncidentsTab sessionId={sessionId} eventId={session.event_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OnlineBanner() {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  if (online) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <WifiOff className="h-4 w-4" />
      Sin conexión. La validación requiere conexión a internet.
    </div>
  );
}

// ─────── Scanner ───────
function ScannerTab({ sessionId, eventId, isCoord }: { sessionId: string; eventId: string; isCoord: boolean }) {
  const validate = useServerFn(validateQr);
  const qc = useQueryClient();
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [showIncident, setShowIncident] = useState(false);

  const onScan = useCallback(async (text: string) => {
    if (pending) return;
    setPending(true);
    try {
      const token = extractQrToken(text);
      const r = await validate({
        data: {
          qrToken: token,
          sessionId,
          eventId,
          deviceInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : undefined,
        },
      });
      setResult(r);
      qc.invalidateQueries({ queryKey: ["access", "dashboard", sessionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error de validación");
    } finally {
      setPending(false);
    }
  }, [pending, validate, sessionId, eventId, qc]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-4">
        <QrScanner onResult={onScan} paused={pending || !!result} />
        <p className="mt-3 text-xs text-muted-foreground text-center">
          Apunta al QR de la entrada digital del asistente.
        </p>
      </Card>

      <div>
        {result ? (
          <ResultPanel
            result={result}
            onContinue={() => setResult(null)}
            onIncident={() => setShowIncident(true)}
            isCoord={isCoord}
          />
        ) : (
          <Card className="p-8 text-center">
            <ScanLine className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Listo para escanear</p>
          </Card>
        )}
      </div>

      <IncidentDialog
        open={showIncident}
        onOpenChange={setShowIncident}
        sessionId={sessionId}
        eventId={eventId}
        participantId={result?.participant?.id ?? null}
        defaultTitle={result ? `Incidencia: ${result.message}` : ""}
      />
    </div>
  );
}

function ResultPanel({ result, onContinue, onIncident, isCoord }: { result: ValidationResult; onContinue: () => void; onIncident: () => void; isCoord: boolean }) {
  const ok = result.code === "ok";
  const tone = ok ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400" :
    result.code === "qr_ya_usado" ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400" :
    "bg-destructive/10 border-destructive/40 text-destructive";
  const Icon = ok ? CheckCircle2 : result.code === "qr_ya_usado" ? Clock : result.code === "persona_bloqueada" ? Ban : result.code === "qr_cancelado" ? XCircle : ShieldAlert;

  return (
    <Card className={`p-6 border-2 ${tone}`}>
      <div className="flex items-center gap-3">
        <Icon className="h-12 w-12" />
        <div>
          <div className="text-2xl font-black uppercase tracking-tight">{result.message}</div>
          {result.code === "qr_ya_usado" && result.checkin && (
            <div className="text-xs opacity-80">Validado {format(new Date(result.checkin.checked_in_at), "PPpp", { locale: es })}</div>
          )}
        </div>
      </div>

      {result.person && (
        <div className="mt-5 rounded-md bg-background/60 p-4 text-foreground">
          <div className="text-lg font-semibold">
            {result.person.first_name} {result.person.last_name ?? ""}
          </div>
          <div className="mt-2 text-sm text-muted-foreground space-y-0.5">
            {isCoord && result.person.dni && <div>DNI: {result.person.dni}</div>}
            {isCoord && result.person.email && <div>{result.person.email}</div>}
            {isCoord && result.person.phone && <div>{result.person.phone}</div>}
            {result.participant?.companions_count ? (
              <div>Acompañantes: {result.participant.companions_count}</div>
            ) : null}
            {result.person.is_blocked && result.person.blocked_reason && (
              <div className="text-destructive font-medium">Motivo bloqueo: {result.person.blocked_reason}</div>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="lg" className="flex-1" onClick={onContinue}>Siguiente</Button>
        <Button size="lg" variant="outline" onClick={onIncident}>
          <AlertTriangle className="h-4 w-4 mr-2" />Crear incidencia
        </Button>
      </div>
    </Card>
  );
}

// ─────── Search ───────
type SearchRow = {
  id: string;
  status: string;
  companions_count: number;
  attendee_type: string;
  event_id: string;
  session_id: string;
  people: { first_name: string; last_name: string | null; dni: string | null; email: string | null; phone: string | null; is_blocked: boolean } | null;
};

function SearchTab({ sessionId, eventId, isCoord }: { sessionId: string; eventId: string; isCoord: boolean }) {
  const search = useServerFn(searchSessionParticipants);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchRow | null>(null);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setLoading(true);
    try {
      const rows = await search({ data: { sessionId, query: q.trim() } });
      setResults(rows as unknown as SearchRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error en búsqueda");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-4">
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            placeholder="Nombre, DNI, email o teléfono…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
        <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {results.map((r) => {
            const p = r.people as { first_name: string; last_name: string | null; dni: string | null; email: string | null; phone: string | null; is_blocked: boolean } | null;
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left rounded-md border px-3 py-2 hover:border-primary transition-colors ${selected?.id === r.id ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="font-medium">{p?.first_name} {p?.last_name ?? ""}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  {isCoord && p?.dni && <span>{p.dni}</span>}
                </div>
              </button>
            );
          })}
          {!loading && q && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Sin resultados</p>
          )}
        </div>
      </Card>

      <div>
        {selected ? (
          <ParticipantDetail
            participant={selected}
            sessionId={sessionId}
            eventId={eventId}
            isCoord={isCoord}
            onDone={() => setSelected(null)}
          />
        ) : (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Selecciona un asistente para ver detalle y gestionar entrada manual.
          </Card>
        )}
      </div>
    </div>
  );
}

function ParticipantDetail({
  participant,
  sessionId,
  eventId,
  isCoord,
  onDone,
}: {
  participant: { id: string; status: string; companions_count: number; attendee_type: string; people: unknown };
  sessionId: string;
  eventId: string;
  isCoord: boolean;
  onDone: () => void;
}) {
  const manual = useServerFn(manualCheckin);
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const p = participant.people as { first_name: string; last_name: string | null; dni: string | null; email: string | null; phone: string | null; is_blocked: boolean } | null;

  const onManual = async () => {
    if (reason.trim().length < 3) {
      toast.error("Indica un motivo (mínimo 3 caracteres)");
      return;
    }
    setSubmitting(true);
    try {
      await manual({
        data: {
          participantId: participant.id,
          sessionId,
          eventId,
          reason: reason.trim(),
          companionsValidated: participant.companions_count,
        },
      });
      toast.success("Check-in manual registrado");
      qc.invalidateQueries({ queryKey: ["access", "dashboard", sessionId] });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <div className="text-xs uppercase text-muted-foreground tracking-wider">Asistente</div>
        <div className="text-xl font-semibold mt-1">{p?.first_name} {p?.last_name ?? ""}</div>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline">{participant.status}</Badge>
          <Badge variant="secondary">{participant.attendee_type}</Badge>
          {participant.companions_count > 0 && <Badge>+{participant.companions_count} acomp.</Badge>}
          {p?.is_blocked && <Badge variant="destructive">Bloqueado</Badge>}
        </div>
        {isCoord && (
          <div className="mt-3 text-sm text-muted-foreground space-y-0.5">
            {p?.dni && <div>DNI: {p.dni}</div>}
            {p?.email && <div>{p.email}</div>}
            {p?.phone && <div>{p.phone}</div>}
          </div>
        )}
      </div>

      <div className="border-t pt-4 space-y-2">
        <Label htmlFor="reason">Check-in manual — motivo</Label>
        <Textarea
          id="reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="P. ej. QR ilegible, móvil sin batería…"
        />
        <div className="flex gap-2">
          <Button onClick={onManual} disabled={submitting} className="flex-1">
            <UserCheck className="h-4 w-4 mr-2" />Registrar entrada
          </Button>
          <Button variant="outline" onClick={() => setShowIncident(true)}>
            <AlertTriangle className="h-4 w-4 mr-2" />Incidencia
          </Button>
        </div>
      </div>

      <IncidentDialog
        open={showIncident}
        onOpenChange={setShowIncident}
        sessionId={sessionId}
        eventId={eventId}
        participantId={participant.id}
      />
    </Card>
  );
}

// ─────── Dashboard ───────
function DashboardTab({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useSessionDashboard(sessionId);
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const stats = [
    { label: "Aforo", value: data.capacity },
    { label: "Confirmados", value: data.confirmados },
    { label: "Check-ins (escaneos)", value: data.checkins },
    { label: "Personas dentro", value: data.totalPersonsCheckedIn },
    { label: "Pendientes", value: data.pendientes },
    { label: "Incidencias", value: data.incidents.length },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-end justify-between mb-3">
          <div className="text-sm uppercase tracking-wider text-muted-foreground">Ocupación</div>
          <div className="text-3xl font-black tabular-nums">{data.occupancyPct}%</div>
        </div>
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full transition-all ${data.occupancyPct > 100 ? "bg-destructive" : data.occupancyPct > 85 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, data.occupancyPct)}%` }} />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{data.totalPersonsCheckedIn} / {data.capacity} personas</div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-black tabular-nums mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider mb-3">Últimos accesos</h3>
        {data.lastCheckins.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin check-ins todavía.</p>
        ) : (
          <ul className="divide-y">
            {data.lastCheckins.map((c) => {
              const ep = c.event_participants as { people: { first_name: string; last_name: string | null } | null } | null;
              const pp = ep?.people;
              return (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{pp ? `${pp.first_name} ${pp.last_name ?? ""}` : "Asistente"}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(c.checked_in_at), "HH:mm:ss", { locale: es })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─────── Incidents ───────
function IncidentsTab({ sessionId, eventId }: { sessionId: string; eventId: string }) {
  const { data, isLoading } = useSessionIncidents(sessionId);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><AlertTriangle className="h-4 w-4 mr-2" />Nueva incidencia</Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : !data || data.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sin incidencias en esta sesión</Card>
      ) : (
        <Card className="divide-y">
          {data.map((i) => {
            const ep = i.event_participants as { people: { first_name: string; last_name: string | null } | null } | null;
            return (
              <div key={i.id} className="p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{i.title}</div>
                  {i.description && <p className="text-sm text-muted-foreground mt-0.5">{i.description}</p>}
                  {ep?.people && (
                    <p className="text-xs text-muted-foreground mt-1">Asistente: {ep.people.first_name} {ep.people.last_name ?? ""}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <Badge variant={i.severity === "critica" || i.severity === "alta" ? "destructive" : "secondary"}>{i.severity}</Badge>
                  <div className="text-xs text-muted-foreground mt-1">{format(new Date(i.created_at), "HH:mm", { locale: es })}</div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <IncidentDialog open={open} onOpenChange={setOpen} sessionId={sessionId} eventId={eventId} />
    </div>
  );
}

function IncidentDialog({
  open,
  onOpenChange,
  sessionId,
  eventId,
  participantId,
  defaultTitle,
  defaultType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  eventId: string;
  participantId?: string | null;
  defaultTitle?: string;
  defaultType?: IncidentType;
}) {
  const create = useServerFn(createIncident);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [severity, setSeverity] = useState<"baja" | "media" | "alta" | "critica">("media");
  const [incidentType, setIncidentType] = useState<IncidentType>("manual");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle ?? "");
      setDesc("");
      setSeverity("media");
      setIncidentType(defaultType ?? "manual");
    }
  }, [open, defaultTitle, defaultType]);

  const submit = async () => {
    if (title.trim().length < 2) { toast.error("Indica un título"); return; }
    setSubmitting(true);
    try {
      await create({ data: { eventId, sessionId, participantId: participantId ?? null, title: title.trim(), description: desc.trim() || null, severity, incidentType } });
      toast.success("Incidencia creada");
      qc.invalidateQueries({ queryKey: ["access", "incidents", sessionId] });
      qc.invalidateQueries({ queryKey: ["access", "dashboard", sessionId] });
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva incidencia</DialogTitle>
          <DialogDescription>Queda registrada con el validador, la sesión y, si procede, el asistente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo de incidencia</Label>
            <Select value={incidentType} onValueChange={(v) => setIncidentType(v as IncidentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{INCIDENT_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="i-title">Título</Label>
            <Input id="i-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="i-desc">Descripción</Label>
            <Textarea id="i-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <Label>Severidad</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baja">Baja</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}