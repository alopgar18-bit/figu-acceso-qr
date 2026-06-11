import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useLocation, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import {
  Inbox, Search, Filter, X, AlertCircle, Image as ImageIcon,
  CheckCircle2, XCircle, Clock, ArrowRightLeft, Mail, Send, Download, Ban,
  Users as UsersIcon, QrCode, Trash2,
} from "lucide-react";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useEvents, useEventSessions } from "@/lib/use-events";
import { listEventForms } from "@/lib/forms.functions";
import { useQuery } from "@tanstack/react-query";
import {
  useParticipants, useBulkUpdateParticipants,
  findDuplicateIds, hasPhoto, type ParticipantFilters,
} from "@/lib/use-participants";
import {
  PARTICIPANT_STATUS_OPTIONS, ATTENDEE_TYPE_OPTIONS, APPROVED_LIKE,
  statusLabel, statusTone, ageFromBirth,
} from "@/lib/participant-constants";
import { useServerFn } from "@tanstack/react-start";
import { generateMissingTickets } from "@/lib/tickets.functions";
import { resendInvitations } from "@/lib/bulk-send.functions";
import { useDeleteParticipants } from "@/lib/use-admin-delete";
import { DangerousActionDialog } from "@/components/dangerous-action-dialog";
import { useAuth } from "@/hooks/use-auth";

const searchSchema = z.object({
  eventId: z.string().optional(),
  sessionId: z.string().optional(),
  importBatchId: z.string().optional(),
  formId: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  waitlist: z.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/solicitudes")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Page,
});

function Page() {
  const location = useLocation();
  if (location.pathname !== "/solicitudes") {
    return <Outlet />;
  }
  return <ListPage />;
}

function ListPage() {
  const search = useSearch({ from: Route.id });
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: events = [] } = useEvents();
  const { data: sessions = [] } = useEventSessions(search.eventId);

  const listForms = useServerFn(listEventForms);
  const { data: eventForms = [] } = useQuery({
    queryKey: ["public-forms", search.eventId],
    enabled: !!search.eventId,
    queryFn: () => listForms({ data: { event_id: search.eventId! } }),
  });

  const [searchText, setSearchText] = useState("");
  const [extraFilters, setExtraFilters] = useState({
    city: "",
    province: "",
    gender: "" as "" | "F" | "M" | "X",
    minAge: "",
    maxAge: "",
    fromDate: "",
    toDate: "",
    hasPhoto: "" as "" | "yes" | "no",
    duplicates: false,
    blocked: false,
  });

  const filters: ParticipantFilters = useMemo(() => ({
    eventId: search.eventId,
    sessionId: search.sessionId,
    importBatchId: search.importBatchId,
    publicFormId: search.formId,
    statuses: search.waitlist
      ? ["lista_espera"]
      : search.status
        ? [search.status as never]
        : undefined,
    attendeeTypes: search.type ? [search.type as never] : undefined,
    search: searchText || undefined,
    city: extraFilters.city || undefined,
    province: extraFilters.province || undefined,
    gender: extraFilters.gender || undefined,
    minAge: extraFilters.minAge ? Number(extraFilters.minAge) : undefined,
    maxAge: extraFilters.maxAge ? Number(extraFilters.maxAge) : undefined,
    fromDate: extraFilters.fromDate ? new Date(extraFilters.fromDate).toISOString() : undefined,
    toDate: extraFilters.toDate ? new Date(extraFilters.toDate + "T23:59:59").toISOString() : undefined,
    blockedOnly: extraFilters.blocked || undefined,
  }), [search, searchText, extraFilters]);

  const {
    data: rows,
    loadedCount,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useParticipants(filters);

  const duplicateIds = useMemo(() => findDuplicateIds(rows), [rows]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (extraFilters.hasPhoto === "yes") r = r.filter((x) => hasPhoto(x.form_submissions?.payload));
    if (extraFilters.hasPhoto === "no") r = r.filter((x) => !hasPhoto(x.form_submissions?.payload));
    if (extraFilters.duplicates) r = r.filter((x) => duplicateIds.has(x.id));
    return r;
  }, [rows, extraFilters.hasPhoto, extraFilters.duplicates, duplicateIds]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredRows.map((r) => r.id)));
  };

  // Capacity warning by session
  const capacityWarnings = useMemo(() => {
    const bySession = new Map<string, { name: string; capacity: number; approved: number }>();
    for (const r of rows) {
      const s = r.event_sessions;
      if (!s) continue;
      const e = bySession.get(s.id) ?? { name: s.name, capacity: s.capacity, approved: 0 };
      if (APPROVED_LIKE.includes(r.status)) e.approved += 1 + (r.companions_count ?? 0);
      bySession.set(s.id, e);
    }
    return [...bySession.values()].filter((e) => e.capacity > 0 && e.approved > e.capacity);
  }, [rows]);

  const clearFilters = () => {
    setSearchText("");
    setExtraFilters({ city: "", province: "", gender: "", minAge: "", maxAge: "", fromDate: "", toDate: "", hasPhoto: "", duplicates: false, blocked: false });
    navigate({ search: {} });
  };

  const activeCount = [
    search.eventId, search.sessionId, search.importBatchId, search.status, search.type, search.waitlist,
    searchText, extraFilters.city, extraFilters.province, extraFilters.gender,
    extraFilters.minAge, extraFilters.maxAge, extraFilters.fromDate, extraFilters.toDate,
    extraFilters.hasPhoto, extraFilters.duplicates, extraFilters.blocked,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operativa"
        title={search.waitlist ? "Lista de espera" : "Solicitudes"}
        description={
          search.waitlist
            ? "Personas en espera de plaza. Muévelas a aprobado para cubrir bajas."
            : "Revisa, aprueba, rechaza o mueve a lista de espera las inscripciones recibidas."
        }
        actions={
          <div className="flex items-center gap-2">
            {!search.waitlist && (
              <Button asChild variant="outline" size="sm" className="uppercase tracking-wider">
                <Link to="/solicitudes" search={{ ...search, waitlist: true }}>
                  <Clock className="h-4 w-4 mr-2" />Lista de espera
                </Link>
              </Button>
            )}
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />Limpiar ({activeCount})
              </Button>
            )}
          </div>
        }
      />

      {capacityWarnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6 space-y-1 text-sm">
            {capacityWarnings.map((w) => (
              <div key={w.name} className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <span>
                  La sesión <strong>{w.name}</strong> tiene {w.approved} aprobados/confirmados sobre un aforo de {w.capacity}.
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label className="text-xs uppercase tracking-wider">Buscar</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Nombre, email, DNI, teléfono…"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Evento</Label>
              <Select
                value={search.eventId ?? "all"}
                onValueChange={(v) =>
                  navigate({ search: { ...search, eventId: v === "all" ? undefined : v, sessionId: undefined } })
                }
              >
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los eventos</SelectItem>
                  {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Sesión</Label>
              <Select
                value={search.sessionId ?? "all"}
                disabled={!search.eventId}
                onValueChange={(v) =>
                  navigate({ search: { ...search, sessionId: v === "all" ? undefined : v } })
                }
              >
                <SelectTrigger><SelectValue placeholder={search.eventId ? "Todas" : "Elige evento"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sesiones</SelectItem>
                  {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs uppercase tracking-wider">Estado</Label>
              <Select
                value={search.waitlist ? "lista_espera" : (search.status ?? "all")}
                onValueChange={(v) =>
                  navigate({ search: { ...search, status: v === "all" ? undefined : v, waitlist: undefined } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {PARTICIPANT_STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Tipo</Label>
              <Select
                value={search.type ?? "all"}
                onValueChange={(v) =>
                  navigate({ search: { ...search, type: v === "all" ? undefined : v } })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {ATTENDEE_TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Ciudad</Label>
              <Input value={extraFilters.city} onChange={(e) => setExtraFilters((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Provincia</Label>
              <Input value={extraFilters.province} onChange={(e) => setExtraFilters((f) => ({ ...f, province: e.target.value }))} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-6">
            <div>
              <Label className="text-xs uppercase tracking-wider">Género</Label>
              <Select
                value={extraFilters.gender || "all"}
                onValueChange={(v) => setExtraFilters((f) => ({ ...f, gender: (v === "all" ? "" : v) as "" | "F" | "M" | "X" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="F">Femenino</SelectItem>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="X">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Edad min</Label>
              <Input type="number" value={extraFilters.minAge} onChange={(e) => setExtraFilters((f) => ({ ...f, minAge: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Edad max</Label>
              <Input type="number" value={extraFilters.maxAge} onChange={(e) => setExtraFilters((f) => ({ ...f, maxAge: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Desde</Label>
              <Input type="date" value={extraFilters.fromDate} onChange={(e) => setExtraFilters((f) => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Hasta</Label>
              <Input type="date" value={extraFilters.toDate} onChange={(e) => setExtraFilters((f) => ({ ...f, toDate: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Foto</Label>
              <Select
                value={extraFilters.hasPhoto || "all"}
                onValueChange={(v) => setExtraFilters((f) => ({ ...f, hasPhoto: (v === "all" ? "" : v) as "" | "yes" | "no" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Con foto</SelectItem>
                  <SelectItem value="no">Sin foto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={extraFilters.duplicates} onCheckedChange={(c) => setExtraFilters((f) => ({ ...f, duplicates: !!c }))} />
              <span>Posibles duplicados</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={extraFilters.blocked} onCheckedChange={(c) => setExtraFilters((f) => ({ ...f, blocked: !!c }))} />
              <span>Solo bloqueados</span>
            </label>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3 w-3" />
              {filteredRows.length} resultado{filteredRows.length === 1 ? "" : "s"}
              {totalCount > loadedCount && (
                <span className="ml-1">· {loadedCount.toLocaleString("es-ES")} de {totalCount.toLocaleString("es-ES")} cargados</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {(selected.size > 0 || filteredRows.length > 0) && (
        <BulkActionsBar
          selectedIds={[...selected]}
          rows={filteredRows}
          clear={() => setSelected(new Set())}
        />
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-12 w-12" />}
              title="Sin resultados"
              description="Ajusta los filtros o espera nuevas inscripciones."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20 sticky left-0 bg-background z-10">Abrir</TableHead>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Evento / Sesión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Edad</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Acomp.</TableHead>
                  <TableHead>Recibida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => {
                  const person = r.people;
                  const age = ageFromBirth(person?.birth_date);
                  const tone = statusTone(r.status);
                  return (
                    <TableRow
                      key={r.id}
                      data-state={selected.has(r.id) ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('input,button,a,[role="checkbox"],label')) return;
                        navigate({ to: "/solicitudes/$participantId", params: { participantId: r.id } });
                      }}
                    >
                      <TableCell className="sticky left-0 bg-background z-10" onClick={(e) => e.stopPropagation()}>
                        <Button asChild variant="default" size="sm">
                          <Link to="/solicitudes/$participantId" params={{ participantId: r.id }}>Abrir</Link>
                        </Button>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link to="/solicitudes/$participantId" params={{ participantId: r.id }} className="font-medium hover:underline">
                            {person ? `${person.first_name} ${person.last_name ?? ""}`.trim() : "—"}
                          </Link>
                          {hasPhoto(r.form_submissions?.payload) && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
                          {duplicateIds.has(r.id) && <Badge variant="outline" className="text-[10px] uppercase">Duplicado</Badge>}
                          {person?.is_blocked && <Badge variant="destructive" className="text-[10px] uppercase">Bloqueado</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{person?.email ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium truncate max-w-[14rem]">{r.events?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[14rem]">{r.event_sessions?.name ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={tone}>{statusLabel(r.status)}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-sm">{ATTENDEE_TYPE_OPTIONS.find((t) => t.value === r.attendee_type)?.label ?? "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">{age ?? "—"}</TableCell>
                      <TableCell className="text-sm">{person?.city ?? "—"}</TableCell>
                      <TableCell className="text-sm tabular-nums">{r.companions_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage
              ? "Cargando..."
              : `Cargar más (${(totalCount - loadedCount).toLocaleString("es-ES")} restantes)`}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: ReturnType<typeof statusTone>; children: React.ReactNode }) {
  const classes: Record<typeof tone, string> = {
    neutral: "bg-muted text-foreground",
    info: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300",
    success: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
    danger: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={`uppercase tracking-wider text-[10px] ${classes[tone]}`}>
      {children}
    </Badge>
  );
}

function BulkActionsBar({
  selectedIds, rows, clear,
}: {
  selectedIds: string[];
  rows: import("@/lib/use-participants").ParticipantWithRelations[];
  clear: () => void;
}) {
  const navigate = useNavigate();
  const hasSelection = selectedIds.length > 0;
  const effectiveRows = hasSelection ? rows.filter((r) => selectedIds.includes(r.id)) : rows;
  const effectiveIds = effectiveRows.map((r) => r.id);
  const eventIds = new Set(effectiveRows.map((r) => r.event_id));
  const sessionIds = new Set(effectiveRows.map((r) => r.session_id));
  const singleEventId = eventIds.size === 1 ? [...eventIds][0] : null;
  const singleSessionId = sessionIds.size === 1 ? [...sessionIds][0] : null;
  const { data: sessions = [] } = useEventSessions(singleEventId ?? undefined);
  const bulk = useBulkUpdateParticipants();
  const genTickets = useServerFn(generateMissingTickets);
  const resendFn = useServerFn(resendInvitations);
  const [resendLoading, setResendLoading] = useState(false);
  const deleteParticipants = useDeleteParticipants();
  const { isAdmin } = useAuth();
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [targetSession, setTargetSession] = useState<string>("");
  const [genLoading, setGenLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (patch: Parameters<typeof bulk.mutate>[0]["patch"], action: string) => {
    if (!hasSelection) {
      toast.error("Selecciona al menos una solicitud.");
      return;
    }
    if (!singleEventId) {
      toast.error("Selecciona personas de un único evento para acciones masivas.");
      return;
    }
    bulk.mutate(
      { ids: selectedIds, eventId: singleEventId, patch, action },
      {
        onSuccess: () => {
          toast.success(`${selectedIds.length} actualizadas`);
          clear();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
      },
    );
  };

  const openBulkSend = (useAllFiltered: boolean) => {
    const ids = useAllFiltered ? rows.map((r) => r.id) : selectedIds;
    if (ids.length === 0) {
      toast.error("No hay destinatarios.");
      return;
    }
    const rowsForIds = rows.filter((r) => ids.includes(r.id));
    const evs = new Set(rowsForIds.map((r) => r.event_id));
    const ses = new Set(rowsForIds.map((r) => r.session_id));
    if (evs.size !== 1 || ses.size !== 1) {
      toast.error("Todos los destinatarios deben pertenecer al mismo evento y sesión. Filtra primero.");
      return;
    }
    const event_id = [...evs][0];
    const session_id = [...ses][0];
    const key = `bulk-send-${Date.now()}`;
    try {
      sessionStorage.setItem(key, JSON.stringify(ids));
    } catch {
      toast.error("Demasiados destinatarios para esta sesión del navegador.");
      return;
    }
    navigate({
      to: "/comunicaciones/envio",
      search: { selection_key: key, event_id, session_id },
    });
  };

  const generateQrBulk = async (useAllFiltered: boolean) => {
    const ids = useAllFiltered ? rows.map((r) => r.id) : selectedIds;
    if (ids.length === 0) {
      toast.error("Selecciona destinatarios.");
      return;
    }
    const rowsForIds = rows.filter((r) => ids.includes(r.id));
    const evs = new Set(rowsForIds.map((r) => r.event_id));
    const ses = new Set(rowsForIds.map((r) => r.session_id));
    if (evs.size !== 1 || ses.size !== 1) {
      toast.error("Todos deben ser del mismo evento y sesión.");
      return;
    }
    setGenLoading(true);
    try {
      const res = await genTickets({
        data: { event_id: [...evs][0], session_id: [...ses][0], participant_ids: ids },
      });
      toast.success(`Generados ${res.generated} QR (${res.skipped} ya existían).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error generando QR");
    } finally {
      setGenLoading(false);
    }
  };

  const resendBulk = async (useAllFiltered: boolean) => {
    const ids = useAllFiltered ? rows.map((r) => r.id) : selectedIds;
    if (ids.length === 0) {
      toast.error("Selecciona destinatarios.");
      return;
    }
    setResendLoading(true);
    try {
      const res = await resendFn({ data: { participant_ids: ids } });
      const parts: string[] = [`${res.queued} reencoladas`];
      if (res.skipped_no_template) parts.push(`${res.skipped_no_template} sin plantilla previa`);
      if (res.skipped_no_email) parts.push(`${res.skipped_no_email} sin email`);
      toast.success(parts.join(" · "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al reenviar");
    } finally {
      setResendLoading(false);
    }
  };

  const exportCsv = () => {
    const selectedRows = effectiveRows;
    const header = ["Nombre", "Apellidos", "Email", "Teléfono", "DNI", "Evento", "Sesión", "Estado", "Tipo", "Acomp."];
    const lines = [header.join(";")];
    for (const r of selectedRows) {
      const p = r.people;
      lines.push([
        p?.first_name ?? "", p?.last_name ?? "", p?.email ?? "", p?.phone ?? "", p?.dni ?? "",
        r.events?.name ?? "", r.event_sessions?.name ?? "",
        statusLabel(r.status), r.attendee_type, String(r.companions_count),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    }
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `solicitudes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="sticky top-14 z-10 border-primary/40 bg-primary/5">
      <CardContent className="py-3 flex flex-wrap items-center gap-2">
        <Badge className="uppercase tracking-wider">
          <UsersIcon className="h-3 w-3 mr-1" />
          {hasSelection
            ? `${selectedIds.length} seleccionad${selectedIds.length === 1 ? "a" : "as"}`
            : `${rows.length} filtrad${rows.length === 1 ? "a" : "as"}`}
        </Badge>
        {!hasSelection && (
          <span className="text-xs text-muted-foreground">
            Sin selección. Las acciones aplican a todos los resultados filtrados (mismo evento+sesión).
          </span>
        )}
        <div className="flex-1" />
        {hasSelection && (
          <>
            <Button size="sm" variant="default" onClick={() => run({ status: "aprobado", approved_at: new Date().toISOString() }, "participant.bulk_approve")}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Aprobar
            </Button>
            <Button size="sm" variant="outline" onClick={() => run({ status: "rechazado" }, "participant.bulk_reject")}>
              <XCircle className="h-4 w-4 mr-1" />Rechazar
            </Button>
            <Button size="sm" variant="outline" onClick={() => run({ status: "lista_espera" }, "participant.bulk_waitlist")}>
              <Clock className="h-4 w-4 mr-1" />Lista de espera
            </Button>
          </>
        )}
        <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!hasSelection || !singleEventId}>
              <ArrowRightLeft className="h-4 w-4 mr-1" />Cambiar sesión
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cambiar de sesión</DialogTitle>
              <DialogDescription>Mueve las solicitudes seleccionadas a otra sesión del mismo evento.</DialogDescription>
            </DialogHeader>
            <Select value={targetSession} onValueChange={setTargetSession}>
              <SelectTrigger><SelectValue placeholder="Selecciona sesión" /></SelectTrigger>
              <SelectContent>
                {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMoveDialogOpen(false)}>Cancelar</Button>
              <Button
                disabled={!targetSession}
                onClick={() => {
                  run({ session_id: targetSession }, "participant.bulk_move_session");
                  setMoveDialogOpen(false);
                }}
              >Mover</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          size="sm"
          variant="outline"
          disabled={effectiveIds.length === 0 || !singleEventId || !singleSessionId}
          onClick={() => openBulkSend(!hasSelection)}
          title={
            !singleEventId || !singleSessionId
              ? "Filtra por un único evento y sesión"
              : hasSelection
                ? "Comunicar a los seleccionados"
                : "Comunicar a todos los filtrados"
          }
        >
          <Mail className="h-4 w-4 mr-1" />
          Comunicar {hasSelection ? `(${selectedIds.length})` : `a todos (${rows.length})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={genLoading || effectiveIds.length === 0 || !singleEventId || !singleSessionId}
          onClick={() => generateQrBulk(!hasSelection)}
        >
          <QrCode className="h-4 w-4 mr-1" />Generar QR
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={resendLoading || effectiveIds.length === 0}
          onClick={() => resendBulk(!hasSelection)}
          title="Reencolar invitación usando la última plantilla enviada a cada persona"
        >
          <Send className="h-4 w-4 mr-1" />Reenviar invitación
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1" />Exportar
        </Button>
        {isAdmin && hasSelection && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive border-destructive/30"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />Eliminar
          </Button>
        )}
        {hasSelection && (
          <Button size="sm" variant="ghost" onClick={clear}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardContent>
      <DangerousActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar participantes"
        affectedCount={selectedIds.length}
        loading={deleteParticipants.isPending}
        destructiveLabel="Eliminar definitivamente"
        description={
          <>
            <p>
              Se eliminarán <strong>{selectedIds.length}</strong> participantes y todos sus
              registros asociados (QR, check-ins, acompañantes, consentimientos y comunicaciones).
            </p>
            <p className="text-destructive">Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={async () => {
          try {
            await deleteParticipants.mutateAsync(selectedIds);
            toast.success("Participantes eliminados");
            clear();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Error al eliminar");
          }
        }}
      />
    </Card>
  );
}

// Silence unused import warnings for icons retained for clarity
void Ban;
