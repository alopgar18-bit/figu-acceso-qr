import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Filter, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useAllIncidents } from "@/lib/use-access";
import { useEvents, useEventSessions } from "@/lib/use-events";
import { createIncident, resolveIncident } from "@/lib/access.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  INCIDENT_TYPE_LABELS,
  INCIDENT_TYPES,
  INCIDENT_TYPES_BY_CATEGORY,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_SEVERITY_LABELS,
  type IncidentType,
  type IncidentCategory,
  type IncidentStatus,
  type IncidentSeverity,
} from "@/lib/incident-constants";

export const Route = createFileRoute("/_authenticated/incidencias")({
  component: Page,
});

type IncidentRow = ReturnType<typeof useAllIncidents>["data"] extends (infer R)[] | undefined ? R : never;

function statusVariant(s: IncidentStatus): "default" | "secondary" | "destructive" | "outline" {
  if (s === "abierta") return "destructive";
  if (s === "en_proceso") return "default";
  if (s === "resuelta") return "secondary";
  return "outline";
}

function severityVariant(s: IncidentSeverity): "default" | "secondary" | "destructive" | "outline" {
  if (s === "critica" || s === "alta") return "destructive";
  if (s === "media") return "default";
  return "secondary";
}

function Page() {
  const { isAdmin, hasAnyRole, hasRole } = useAuth();
  const canResolve = isAdmin || hasRole("coordinador");
  const canCreate = canResolve || hasAnyRole(["validador"]);

  const { data: incidents = [], isLoading } = useAllIncidents();

  const [eventFilter, setEventFilter] = useState<string>("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<IncidentRow | null>(null);

  const eventsInList = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of incidents) {
      const ev = (i as IncidentRow).events as { id: string; name: string } | null;
      if (ev) map.set(ev.id, ev.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [incidents]);

  const sessionsInList = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of incidents) {
      const ss = (i as IncidentRow).event_sessions as { id: string; name: string } | null;
      const ev = (i as IncidentRow).events as { id: string } | null;
      if (ss && (eventFilter === "all" || ev?.id === eventFilter)) {
        map.set(ss.id, ss.name);
      }
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [incidents, eventFilter]);

  const filtered = useMemo(() => {
    return incidents.filter((i) => {
      const r = i as IncidentRow;
      const ev = r.events as { id: string } | null;
      const ss = r.event_sessions as { id: string } | null;
      if (eventFilter !== "all" && ev?.id !== eventFilter) return false;
      if (sessionFilter !== "all" && ss?.id !== sessionFilter) return false;
      if (typeFilter !== "all" && r.incident_type !== typeFilter) return false;
      if (categoryFilter !== "all" && (r as { category?: string }).category !== categoryFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const p = (r.event_participants as { people: { first_name: string; last_name: string | null; dni: string | null } | null } | null)?.people;
        const hay = [r.title, r.description, p?.first_name, p?.last_name, p?.dni].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, eventFilter, sessionFilter, typeFilter, categoryFilter, statusFilter, query]);

  const stats = useMemo(() => {
    let open = 0, inProg = 0, resolved = 0, rejected = 0;
    for (const i of filtered) {
      const s = (i as IncidentRow).status;
      if (s === "abierta") open++;
      else if (s === "en_proceso") inProg++;
      else if (s === "resuelta") resolved++;
      else if (s === "descartada") rejected++;
    }
    return { total: filtered.length, open, inProg, resolved, rejected };
  }, [filtered]);

  return (
    <div>
      <PageHeader
        eyebrow="Acceso"
        title="Incidencias"
        description="Registro, seguimiento y resolución de incidencias del control de acceso."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nueva incidencia
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Abiertas" value={stats.open} icon={<AlertTriangle className="h-4 w-4 text-destructive" />} />
        <StatCard label="En proceso" value={stats.inProg} icon={<Clock className="h-4 w-4 text-primary" />} />
        <StatCard label="Resueltas" value={stats.resolved} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
        <StatCard label="Rechazadas" value={stats.rejected} icon={<XCircle className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium">
          <Filter className="h-4 w-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {(Object.keys(INCIDENT_CATEGORY_LABELS) as IncidentCategory[]).map((c) => (
                <SelectItem key={c} value={c}>{INCIDENT_CATEGORY_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={(v) => { setEventFilter(v); setSessionFilter("all"); }}>
            <SelectTrigger><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los eventos</SelectItem>
              {eventsInList.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sessionFilter} onValueChange={setSessionFilter}>
            <SelectTrigger><SelectValue placeholder="Sesión" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sesiones</SelectItem>
              {sessionsInList.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {INCIDENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{INCIDENT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {(Object.keys(INCIDENT_STATUS_LABELS) as IncidentStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Buscar por título, persona, DNI…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-12 w-12" />}
          title="Sin incidencias"
          description="No hay incidencias que coincidan con los filtros."
        />
      ) : (
        <Card className="divide-y">
          {filtered.map((i) => {
            const r = i as IncidentRow;
            const ev = r.events as { name: string } | null;
            const ss = r.event_sessions as { name: string } | null;
            const p = (r.event_participants as { people: { first_name: string; last_name: string | null } | null } | null)?.people;
            return (
              <button
                key={r.id}
                onClick={() => setDetail(r)}
                className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-accent/40 transition"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {INCIDENT_TYPE_LABELS[r.incident_type as IncidentType]}
                    </Badge>
                    <span className="font-medium truncate">{r.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {ev?.name ?? "—"}{ss ? ` · ${ss.name}` : ""}
                    {p ? ` · ${p.first_name} ${p.last_name ?? ""}` : ""}
                  </div>
                  {r.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <Badge variant={severityVariant(r.severity as IncidentSeverity)}>
                    {INCIDENT_SEVERITY_LABELS[r.severity as IncidentSeverity]}
                  </Badge>
                  <Badge variant={statusVariant(r.status as IncidentStatus)} className="block">
                    {INCIDENT_STATUS_LABELS[r.status as IncidentStatus]}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "PPp", { locale: es })}
                  </div>
                </div>
              </button>
            );
          })}
        </Card>
      )}

      <CreateIncidentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <IncidentDetailDialog
        incident={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        canResolve={canResolve}
      />
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function CreateIncidentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createIncident);
  const { data: events = [] } = useEvents();
  const [eventId, setEventId] = useState("");
  const { data: sessions = [] } = useEventSessions(eventId || undefined);
  const [sessionId, setSessionId] = useState<string>("");
  const [category, setCategory] = useState<IncidentCategory>("entrada");
  const typeOptions = INCIDENT_TYPES_BY_CATEGORY[category];
  const [incidentType, setIncidentType] = useState<IncidentType>(typeOptions[0]);
  const [severity, setSeverity] = useState<IncidentSeverity>("media");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const mut = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          eventId,
          sessionId: sessionId || null,
          title,
          description: description || null,
          severity,
          incidentType,
          category,
        },
      }),
    onSuccess: () => {
      toast.success("Incidencia creada");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onOpenChange(false);
      setTitle(""); setDescription(""); setEventId(""); setSessionId(""); setCategory("entrada"); setIncidentType("no_recibio_qr"); setSeverity("media");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva incidencia</DialogTitle>
          <DialogDescription>Registra una incidencia para seguimiento y resolución.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-3">
            <div>
              <Label>Evento</Label>
              <Select value={eventId} onValueChange={(v) => { setEventId(v); setSessionId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecciona un evento" /></SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sesión (opcional)</Label>
              <Select value={sessionId} onValueChange={setSessionId} disabled={!eventId}>
                <SelectTrigger><SelectValue placeholder="Sin sesión específica" /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoría</Label>
                <Select value={category} onValueChange={(v) => {
                  const c = v as IncidentCategory;
                  setCategory(c);
                  setIncidentType(INCIDENT_TYPES_BY_CATEGORY[c][0]);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(INCIDENT_CATEGORY_LABELS) as IncidentCategory[]).map((c) => (
                      <SelectItem key={c} value={c}>{INCIDENT_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={incidentType} onValueChange={(v) => setIncidentType(v as IncidentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {typeOptions.map((t) => (
                      <SelectItem key={t} value={t}>{INCIDENT_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Severidad</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as IncidentSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(INCIDENT_SEVERITY_LABELS) as IncidentSeverity[]).map((s) => (
                    <SelectItem key={s} value={s}>{INCIDENT_SEVERITY_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
              <div>
                <Label>Severidad</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as IncidentSeverity)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(INCIDENT_SEVERITY_LABELS) as IncidentSeverity[]).map((s) => (
                      <SelectItem key={s} value={s}>{INCIDENT_SEVERITY_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} placeholder="Resumen breve" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} placeholder="Detalle de la incidencia" />
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!eventId || title.trim().length < 2 || mut.isPending}
          >
            {mut.isPending ? "Creando…" : "Crear incidencia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentDetailDialog({
  incident,
  onOpenChange,
  canResolve,
}: {
  incident: IncidentRow | null;
  onOpenChange: (v: boolean) => void;
  canResolve: boolean;
}) {
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveIncident);
  const [resolution, setResolution] = useState("");

  const mut = useMutation({
    mutationFn: async (status: IncidentStatus) =>
      resolveFn({ data: { incidentId: incident!.id, status, resolution: resolution || null } }),
    onSuccess: () => {
      toast.success("Incidencia actualizada");
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onOpenChange(false);
      setResolution("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!incident) return null;
  const r = incident;
  const ev = r.events as { name: string } | null;
  const ss = r.event_sessions as { name: string; starts_at?: string } | null;
  const p = (r.event_participants as { people: { first_name: string; last_name: string | null; dni: string | null } | null } | null)?.people;

  return (
    <Dialog open={!!incident} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{INCIDENT_TYPE_LABELS[r.incident_type as IncidentType]}</Badge>
            <span>{r.title}</span>
          </DialogTitle>
          <DialogDescription>
            Creada {format(new Date(r.created_at), "PPp", { locale: es })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={severityVariant(r.severity as IncidentSeverity)}>
              {INCIDENT_SEVERITY_LABELS[r.severity as IncidentSeverity]}
            </Badge>
            <Badge variant={statusVariant(r.status as IncidentStatus)}>
              {INCIDENT_STATUS_LABELS[r.status as IncidentStatus]}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Evento" value={ev?.name ?? "—"} />
            <Field label="Sesión" value={ss?.name ?? "—"} />
            <Field
              label="Persona"
              value={p ? `${p.first_name} ${p.last_name ?? ""}${p.dni ? ` · ${p.dni}` : ""}` : "—"}
            />
            <Field
              label="Resuelta"
              value={r.resolved_at ? format(new Date(r.resolved_at), "PPp", { locale: es }) : "—"}
            />
          </div>

          {r.description && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Descripción</div>
              <p className="whitespace-pre-wrap">{r.description}</p>
            </div>
          )}

          {r.resolution && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Resolución</div>
              <p className="whitespace-pre-wrap">{r.resolution}</p>
            </div>
          )}

          {canResolve && r.status !== "resuelta" && r.status !== "descartada" && (
            <div className="pt-2 border-t">
              <Label>Notas de resolución</Label>
              <Textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={3}
                placeholder="Describe cómo se resolvió la incidencia"
                maxLength={2000}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {canResolve && r.status !== "resuelta" && r.status !== "descartada" && (
            <>
              <Button variant="outline" onClick={() => mut.mutate("descartada")} disabled={mut.isPending}>
                <XCircle className="h-4 w-4 mr-2" /> Rechazar
              </Button>
              {r.status !== "en_proceso" && (
                <Button variant="secondary" onClick={() => mut.mutate("en_proceso")} disabled={mut.isPending}>
                  <Clock className="h-4 w-4 mr-2" /> En proceso
                </Button>
              )}
              <Button onClick={() => mut.mutate("resuelta")} disabled={mut.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> Resolver
              </Button>
            </>
          )}
          {(!canResolve || r.status === "resuelta" || r.status === "descartada") && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
