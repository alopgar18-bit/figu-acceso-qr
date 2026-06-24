import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, CheckCircle2, Users, Loader2, Wand2, Search, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateAssignmentProposal } from "@/lib/assignment-engine.functions";
import { promoteSessionOverridesToVenuePlan } from "@/lib/venue-plans.functions";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  applySeatMovesClient,
  fetchSessionOccupancyClient,
  setSeatManualClient,
  suggestSeatResolutionLocal,
} from "@/lib/seats-browser";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import {
  SEAT_OVERRIDE_DEFAULT_COLORS,
  SEAT_OVERRIDE_LABELS,
  UNAVAILABLE_OVERRIDE_CATEGORIES,
} from "@/lib/seats.functions";
import type {
  OccupancyResponse,
  SeatCell,
  ResolutionPlan,
  SeatOverrideCategory,
} from "@/lib/seats.functions";
import { ApplySeatCorrectionsDialog } from "@/components/apply-seat-corrections-dialog";
import { ResolveConflictsPanel } from "@/components/resolve-conflicts-panel";

export const Route = createFileRoute("/_authenticated/sesiones/$sessionId/plano")({
  component: PlanoPage,
});

type FilterMode = "todos" | "conflictos" | "libres";

function PlanoPage() {
  const { sessionId } = Route.useParams();
  const router = useRouter();
  const { isAdmin } = useAuth();

  const occQuery = useQuery({
    queryKey: ["session-occupancy", sessionId],
    queryFn: () => fetchSessionOccupancyClient(sessionId),
    retry: false,
  });

  const [zoneFilter, setZoneFilter] = useState<string>("__all__");
  const [mode, setMode] = useState<FilterMode>("todos");
  const [search, setSearch] = useState("");
  const [openCell, setOpenCell] = useState<SeatCell | null>(null);

  const data = occQuery.data;
  const zones = data?.zones ?? [];
  const visibleZones = useMemo(() => {
    if (!data) return [];
    return zones.filter((z) => zoneFilter === "__all__" || z.zone === zoneFilter);
  }, [zones, zoneFilter, data]);

  const searchNorm = search.trim().toLowerCase();
  const matchesSearch = (cell: SeatCell) =>
    !searchNorm ||
    cell.occupants.some(
      (o) =>
        o.full_name.toLowerCase().includes(searchNorm) ||
        (o.dni ?? "").toLowerCase().includes(searchNorm),
    );

  const suggestMut = useMutation({
    mutationFn: (cell: SeatCell) => {
      if (!data) throw new Error("Plano no cargado");
      return Promise.resolve(suggestSeatResolutionLocal(data, cell));
    },
  });

  const applyMut = useMutation({
    mutationFn: (vars: { moves: ResolutionPlan["moves"]; allow_cross_zone: boolean }) =>
      applySeatMovesClient(sessionId, vars.moves, vars.allow_cross_zone),
    onSuccess: (res) => {
      toast.success(`${res.applied} cambio(s) aplicados${res.failed ? `, ${res.failed} fallido(s)` : ""}`);
      occQuery.refetch();
      setOpenCell(null);
      suggestMut.reset();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al aplicar"),
  });

  const applyAllSafeMut = useMutation({
    mutationFn: async () => {
      if (!data) return { applied: 0, failed: 0 };
      const allMoves: ResolutionPlan["moves"] = [];
      for (const cell of data.conflicts) {
        try {
          const plan = suggestSeatResolutionLocal(data, cell);
          if (!plan.unsafe && plan.moves.length > 0) allMoves.push(...plan.moves);
        } catch (e) {
          console.error("plan failed for cell", cell, e);
        }
      }
      if (allMoves.length === 0) return { applied: 0, failed: 0 };
      return applySeatMovesClient(sessionId, allMoves, false);
    },
    onSuccess: (res) => {
      toast.success(`Sugerencias seguras aplicadas: ${res.applied} cambio(s)`);
      occQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al aplicar lote"),
  });

  const manualMut = useMutation({
    mutationFn: (vars: { occupant_kind: "titular" | "acompanante"; occupant_id: string; zone: string; row: string; number: string }) =>
      setSeatManualClient(sessionId, vars),
    onSuccess: () => {
      toast.success("Asiento actualizado");
      occQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const generateUnseatedFn = useServerFn(generateAssignmentProposal);
  const assignUnseatedMut = useMutation({
    mutationFn: () => generateUnseatedFn({ data: { session_id: sessionId, only_unseated_qr: true } }),
    onSuccess: (res) => {
      toast.success(`Propuesta generada: ${res.total_assigned} asignados · ${res.total_unassigned} sin sitio`);
      router.navigate({ to: "/sesiones/$sessionId/asignacion", params: { sessionId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ----- Promote session overrides to reusable venue plan -----
  const promoteInfoQ = useQuery({
    queryKey: ["session-promote-info", sessionId],
    queryFn: async () => {
      const { data: s, error: sErr } = await supabase
        .from("event_sessions")
        .select("id, venue_plan_id, event_id, events:event_id(location_name, city, name)")
        .eq("id", sessionId)
        .single();
      if (sErr) throw sErr;
      const { count, error: cErr } = await supabase
        .from("session_seat_overrides")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      if (cErr) throw cErr;
      return {
        venue_plan_id: s.venue_plan_id as string | null,
        event_id: s.event_id as string,
        location_name: (s.events as any)?.location_name as string | null,
        city: (s.events as any)?.city as string | null,
        event_name: (s.events as any)?.name as string | null,
        overrides_count: count ?? 0,
      };
    },
  });

  const [promoteOpen, setPromoteOpen] = useState(false);

  const promoteEligible =
    !!promoteInfoQ.data &&
    !promoteInfoQ.data.venue_plan_id &&
    promoteInfoQ.data.overrides_count > 0;

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/sesiones">
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver a sesiones
        </Link>
      </Button>

      <PageHeader
        eyebrow="Plano de la sesión"
        title={data?.session.name ?? "Cargando…"}
        description="Vista de ocupación en tiempo real. Resuelve conflictos sin reenviar invitaciones."
        actions={
          <div className="flex gap-2">
            {isAdmin && promoteEligible && (
              <Button variant="outline" onClick={() => setPromoteOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Promover a plano de recinto
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/sesiones/$sessionId/asignacion" params={{ sessionId }}>
                <Wand2 className="h-4 w-4 mr-2" /> Asignación automática
              </Link>
            </Button>
            {data && data.totals.conflictos > 0 ? (
              <Button onClick={() => applyAllSafeMut.mutate()} disabled={applyAllSafeMut.isPending}>
                {applyAllSafeMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
                Aplicar sugerencias seguras
              </Button>
            ) : null}
          </div>
        }
      />

      {isAdmin && promoteEligible && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Este plano vive solo en esta sesión</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Tienes {promoteInfoQ.data?.overrides_count} butacas dibujadas. Conviértelas en un plano de recinto
              reutilizable para asignarlo a otras sesiones del evento.
            </span>
            <Button size="sm" onClick={() => setPromoteOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Promover a plano de recinto
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <PromoteToVenuePlanDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        sessionId={sessionId}
        defaultVenueName={promoteInfoQ.data?.location_name ?? ""}
        defaultCity={promoteInfoQ.data?.city ?? ""}
        onDone={() => {
          promoteInfoQ.refetch();
          occQuery.refetch();
        }}
      />

      {data && data.totals.personas_con_qr_sin_asiento > 0 && data.totals.aforo_plano_fisico !== null && (
        <Alert>
          <Ticket className="h-4 w-4" />
          <AlertTitle>
            {data.totals.personas_con_qr_sin_asiento} persona(s) con QR sin butaca
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Generar una propuesta de asignación únicamente para los invitados con QR emitido que aún no tienen butaca. No
              tocará a quienes ya están sentados ni reenviará WhatsApp.
            </span>
            <Button
              size="sm"
              onClick={() => assignUnseatedMut.mutate()}
              disabled={assignUnseatedMut.isPending}
            >
              {assignUnseatedMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Asignar solo a QR sin asiento
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Los cambios no reenvían WhatsApp</AlertTitle>
        <AlertDescription>
          El enlace «Abrir entrada» que ya recibió cada invitado se mantiene válido. Al cambiar el asiento en la base de
          datos, la entrada actualizada se muestra automáticamente la próxima vez que el invitado la abra.
        </AlertDescription>
      </Alert>

      {occQuery.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo cargar el plano</AlertTitle>
          <AlertDescription className="space-y-3">
            <div>{occQuery.error instanceof Error ? occQuery.error.message : "Error desconocido"}</div>
            <Button size="sm" variant="outline" onClick={() => occQuery.refetch()}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : occQuery.isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <KpiCard
              label="Aforo plano"
              value={data.totals.aforo_plano}
              hint={
                data.totals.aforo_plano_fisico !== null
                  ? `Plano físico vinculado (${data.totals.aforo_plano_fisico} butacas) — base de cálculo`
                  : "Butacas reales dibujadas — base de cálculo"
              }
            />
            <KpiCard
              label="Aforo sesión"
              value={data.totals.aforo_sesion}
              tone={data.totals.desviacion_sesion !== 0 ? "warn" : undefined}
              hint={
                data.totals.desviacion_sesion !== 0
                  ? `Configurado en la sesión (${data.totals.desviacion_sesion > 0 ? "+" : ""}${data.totals.desviacion_sesion} vs plano)`
                  : "Configurado en la sesión"
              }
            />
            <KpiCard label="Butacas ocupadas" value={data.totals.butacas_ocupadas} />
            <KpiCard label="Personas" value={data.totals.personas_ocupadas} />
            <KpiCard
              label="Reservados"
              value={data.totals.reservados_no_disponibles}
              tone={data.totals.reservados_no_disponibles > 0 ? "warn" : undefined}
            />
            <KpiCard
              label="Libres"
              value={data.totals.libres_estimadas}
              tone={data.totals.overbooking > 0 ? "danger" : "ok"}
              hint={
                data.totals.overbooking > 0
                  ? `Overbooking: ${data.totals.overbooking} butacas asignadas por encima del aforo del plano`
                  : "Aforo plano − ocupadas − reservadas"
              }
            />
            <KpiCard
              label="Conflictos"
              value={data.totals.conflictos}
              tone={data.totals.conflictos > 0 ? "warn" : "ok"}
            />
            <KpiCard
              label="QR sin asiento"
              value={data.totals.personas_con_qr_sin_asiento}
              tone={data.totals.personas_con_qr_sin_asiento > 0 ? "warn" : "ok"}
              hint="Personas con QR emitido pendientes de butaca"
            />
          </div>
          {data.totals.overbooking > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Hay más butacas asignadas que aforo del plano</AlertTitle>
              <AlertDescription>
                Aforo plano: {data.totals.aforo_plano}. Butacas ocupadas: {data.totals.butacas_ocupadas}.
                {data.totals.reservados_no_disponibles > 0 && (
                  <> Reservadas (cámaras / bloqueadas): {data.totals.reservados_no_disponibles}.</>
                )}{" "}
                Sobran {data.totals.overbooking} asignaciones. Revisa conflictos o ajusta el aforo.
              </AlertDescription>
            </Alert>
          )}
          {data.totals.excluidos_por_estado > 0 && (
            <p className="text-xs text-muted-foreground">
              {data.totals.excluidos_por_estado} titular(es) cancelados con butaca conservada no se cuentan como ocupantes. Limpia sus asientos cuando puedas.
            </p>
          )}

          <Card>
            <CardContent className="p-3 flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">Leyenda:</span>
              <LegendDot tone="free" label="Libre" />
              <LegendDot tone="occ" label="Ocupado" />
              <LegendDot tone="conflict" label="Conflicto" />
              {(Object.keys(SEAT_OVERRIDE_LABELS) as SeatOverrideCategory[]).map((cat) => {
                const count = data.overrides_summary.find((o) => o.category === cat)?.count ?? 0;
                return (
                  <span key={cat} className="inline-flex items-center gap-1 text-xs">
                    <span
                      className="inline-block h-3 w-3 rounded border"
                      style={{
                        backgroundColor: SEAT_OVERRIDE_DEFAULT_COLORS[cat],
                        borderColor: SEAT_OVERRIDE_DEFAULT_COLORS[cat],
                      }}
                    />
                    {SEAT_OVERRIDE_LABELS[cat]} ({count})
                  </span>
                );
              })}
              {isAdmin && (
                <div className="ml-auto flex gap-2">
                  <ApplySeatCorrectionsDialog
                    sessionId={sessionId}
                    onApplied={() => occQuery.refetch()}
                  />
                  <MarkSeatsDialog
                    sessionId={sessionId}
                    zones={zones.map((z) => z.zone)}
                    onSaved={() => occQuery.refetch()}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <ResolveConflictsPanel
              sessionId={sessionId}
              onRefresh={() => occQuery.refetch()}
            />
          )}

          <Card>
            <CardContent className="p-3 flex flex-wrap gap-2 items-center">
              <Select value={zoneFilter} onValueChange={setZoneFilter}>
                <SelectTrigger className="w-[260px]"><SelectValue placeholder="Todas las zonas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las zonas</SelectItem>
                  {zones.map((z) => (
                    <SelectItem key={z.zone} value={z.zone}>{z.zone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={mode} onValueChange={(v) => setMode(v as FilterMode)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los asientos</SelectItem>
                  <SelectItem value="conflictos">Sólo conflictos</SelectItem>
                  <SelectItem value="libres">Sólo libres</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar nombre o DNI…"
                  className="pl-8 w-[260px]"
                />
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <LegendDot tone="free" label="Libre" />
                <LegendDot tone="occ" label="Ocupado" />
                <LegendDot tone="conflict" label="Conflicto" />
                <Button size="sm" variant="outline" onClick={() => occQuery.refetch()}>
                  Recargar
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {visibleZones.map((z) => (
              <ZoneBlock
                key={z.zone}
                zone={z}
                mode={mode}
                matchesSearch={matchesSearch}
                onSeatClick={(cell) => setOpenCell(cell)}
              />
            ))}
          </div>
        </>
      )}

      <Sheet open={!!openCell} onOpenChange={(o) => { if (!o) { setOpenCell(null); suggestMut.reset(); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {openCell && (
            <CellDrawer
              cell={openCell}
              sessionId={sessionId}
              suggest={suggestMut.data}
              isSuggesting={suggestMut.isPending}
              onSuggest={() => suggestMut.mutate(openCell)}
              onApply={(moves, cross) => applyMut.mutate({ moves, allow_cross_zone: cross })}
              isApplying={applyMut.isPending}
              onManual={(o, zone, row, number) =>
                manualMut.mutate({ occupant_kind: o.kind, occupant_id: o.id, zone, row, number })
              }
              isManual={manualMut.isPending}
              onClose={() => { setOpenCell(null); suggestMut.reset(); router.invalidate(); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({
  label, value, tone, hint,
}: { label: string; value: number; tone?: "ok" | "warn" | "danger"; hint?: string }) {
  const cls =
    tone === "danger" ? "text-rose-600"
    : tone === "warn" ? "text-amber-600"
    : tone === "ok" ? "text-emerald-600"
    : "";
  return (
    <Card><CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-rose-600 mt-1 leading-tight">{hint}</div>}
    </CardContent></Card>
  );
}

function LegendDot({ tone, label }: { tone: "free" | "occ" | "conflict"; label: string }) {
  const c = tone === "free" ? "bg-emerald-200 border-emerald-400" : tone === "occ" ? "bg-sky-300 border-sky-500" : "bg-rose-400 border-rose-600";
  return (
    <span className="inline-flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded border ${c}`} /> {label}</span>
  );
}

function ZoneBlock({
  zone, mode, matchesSearch, onSeatClick,
}: {
  zone: OccupancyResponse["zones"][number];
  mode: FilterMode;
  matchesSearch: (c: SeatCell) => boolean;
  onSeatClick: (c: SeatCell) => void;
}) {
  const totalSeats = zone.rows.reduce((s, r) => s + r.seats.length, 0);
  const conflictos = zone.rows.reduce((s, r) => s + r.seats.filter((x) => x.occupants.length > 1).length, 0);
  const ocupados = zone.rows.reduce((s, r) => s + r.seats.filter((x) => x.occupants.length >= 1).length, 0);
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">{zone.zone}</div>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline">{ocupados}/{totalSeats} ocupados</Badge>
            {conflictos > 0 && <Badge variant="destructive">{conflictos} conflicto(s)</Badge>}
          </div>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="space-y-1 overflow-x-auto">
            {zone.rows.map((r) => (
              <div key={r.row} className="flex items-center gap-1">
                <div className="w-12 shrink-0 text-xs text-muted-foreground text-right pr-1">F{r.row}</div>
                <div className="flex flex-wrap gap-[3px]">
                  {r.seats.map((s) => {
                    const isUnavail = !!s.category && UNAVAILABLE_OVERRIDE_CATEGORIES.has(s.category);
                    const visible =
                      (mode === "todos") ||
                      (mode === "conflictos" && s.occupants.length > 1) ||
                      (mode === "libres" && s.occupants.length === 0 && !isUnavail);
                    const matches = matchesSearch(s);
                    if (!visible || !matches) {
                      return <Seat key={s.number} dim cell={s} onClick={() => onSeatClick(s)} />;
                    }
                    return <Seat key={s.number} cell={s} onClick={() => onSeatClick(s)} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function Seat({ cell, dim, onClick }: { cell: SeatCell; dim?: boolean; onClick: () => void }) {
  const conflict = cell.occupants.length > 1;
  const occupied = cell.occupants.length === 1;
  const isUnavailable = !!cell.category && UNAVAILABLE_OVERRIDE_CATEGORIES.has(cell.category);
  const hasOverride = !!cell.category;
  let cls = "";
  let style: React.CSSProperties | undefined;
  if (hasOverride && cell.color) {
    // pintamos con el color del override; texto oscuro/claro según luminosidad simple
    style = {
      backgroundColor: cell.color,
      borderColor: cell.color,
      color: "#fff",
    };
    cls = "transition";
  } else if (conflict) {
    cls = "bg-rose-400 border-rose-600 text-rose-950 hover:bg-rose-500";
  } else if (occupied) {
    cls = "bg-sky-300 border-sky-500 text-sky-950 hover:bg-sky-400";
  } else {
    cls = "bg-emerald-200 border-emerald-400 text-emerald-900 hover:bg-emerald-300";
  }
  const dimCls = dim ? "opacity-30" : "";
  const disabled = isUnavailable && cell.occupants.length === 0;
  const label = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={style}
      className={`h-6 min-w-[26px] px-1 text-[10px] font-medium rounded border ${cls} ${dimCls} ${disabled ? "cursor-not-allowed" : ""}`}
    >
      {cell.number}
    </button>
  );
  if (hasOverride) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{label}</TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1 max-w-xs">
            <div className="font-medium">F{cell.row} · Asiento {cell.number}</div>
            <div>{SEAT_OVERRIDE_LABELS[cell.category!]}</div>
            {cell.notes && <div className="text-muted-foreground">{cell.notes}</div>}
            {cell.occupants.map((o) => (
              <div key={o.id}>
                {o.kind === "titular" ? "👤" : "👥"} {o.full_name}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  if (cell.occupants.length === 0) return label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-1 max-w-xs">
          <div className="font-medium">F{cell.row} · Asiento {cell.number}</div>
          {cell.occupants.map((o) => (
            <div key={o.id} className="flex items-center gap-1">
              <span className={o.kind === "titular" ? "text-foreground" : "text-muted-foreground"}>
                {o.kind === "titular" ? "👤" : "👥"} {o.full_name}
              </span>
              {o.dni && <span className="text-muted-foreground">· {o.dni}</span>}
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Diálogo: marcar butacas con categoría (overrides) ────────────────────────

function parseSeatRange(input: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const part of input.split(/[,;\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Math.min(Number(m[1]), Number(m[2]));
      const b = Math.max(Number(m[1]), Number(m[2]));
      for (let n = a; n <= b; n++) {
        const k = String(n);
        if (!seen.has(k)) { seen.add(k); result.push(k); }
      }
    } else if (/^\d+$/.test(part)) {
      if (!seen.has(part)) { seen.add(part); result.push(part); }
    }
  }
  return result;
}

function MarkSeatsDialog({
  sessionId, zones, onSaved,
}: { sessionId: string; zones: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [zoneMode, setZoneMode] = useState<"existing" | "manual">("existing");
  const [zoneSel, setZoneSel] = useState<string>(zones[0] ?? "");
  const [zoneManual, setZoneManual] = useState("");
  const [row, setRow] = useState("");
  const [seats, setSeats] = useState("");
  const [category, setCategory] = useState<SeatOverrideCategory>("reservado_camaras");
  const [color, setColor] = useState("");
  const [notes, setNotes] = useState("");

  const finalZone = (zoneMode === "existing" ? zoneSel : zoneManual).trim();
  const parsed = parseSeatRange(seats);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!finalZone) throw new Error("Selecciona una zona");
      if (!row.trim()) throw new Error("Indica la fila");
      if (parsed.length === 0) throw new Error("Indica al menos un asiento (ej: 12-18, 20)");
      const rows = parsed.map((n) => ({
        session_id: sessionId,
        seat_zone: finalZone,
        seat_row: row.trim(),
        seat_number: n,
        category,
        color: color.trim() || null,
        notes: notes.trim() || null,
      }));
      const { error } = await supabase
        .from("session_seat_overrides")
        .upsert(rows, { onConflict: "session_id,seat_zone,seat_row,seat_number" });
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} butaca(s) marcadas como ${SEAT_OVERRIDE_LABELS[category]}`);
      setSeats("");
      setNotes("");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al guardar"),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!finalZone || !row.trim() || parsed.length === 0) {
        throw new Error("Indica zona, fila y asientos a desmarcar");
      }
      const { error } = await supabase
        .from("session_seat_overrides")
        .delete()
        .eq("session_id", sessionId)
        .eq("seat_zone", finalZone)
        .eq("seat_row", row.trim())
        .in("seat_number", parsed);
      if (error) throw new Error(error.message);
      return parsed.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} butaca(s) desmarcadas`);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al borrar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3 w-3 mr-1" /> Marcar butacas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar butacas con categoría</DialogTitle>
          <DialogDescription>
            Marca butacas reservadas para cámaras, bloqueadas, MR o VR. Se pintarán con su color en el plano y los reservados/bloqueados dejarán de contar como libres.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Zona</label>
            <div className="flex gap-2">
              <Select value={zoneMode} onValueChange={(v) => setZoneMode(v as "existing" | "manual")}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Existente</SelectItem>
                  <SelectItem value="manual">Otra…</SelectItem>
                </SelectContent>
              </Select>
              {zoneMode === "existing" ? (
                <Select value={zoneSel} onValueChange={setZoneSel}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecciona zona" /></SelectTrigger>
                  <SelectContent>
                    {zones.map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={zoneManual} onChange={(e) => setZoneManual(e.target.value)} placeholder="Nombre exacto de la zona" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Fila</label>
              <Input value={row} onChange={(e) => setRow(e.target.value)} placeholder="Ej: 8" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Asientos</label>
              <Input value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="12-18, 20" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Categoría</label>
            <Select value={category} onValueChange={(v) => {
              setCategory(v as SeatOverrideCategory);
              setColor("");
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SEAT_OVERRIDE_LABELS) as SeatOverrideCategory[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block h-3 w-3 rounded border" style={{ backgroundColor: SEAT_OVERRIDE_DEFAULT_COLORS[k] }} />
                      {SEAT_OVERRIDE_LABELS[k]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Color (opcional)</label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder={SEAT_OVERRIDE_DEFAULT_COLORS[category]} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Notas (opcional)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} placeholder="Ej: cámara central" />
            </div>
          </div>

          {parsed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Se aplicará a {parsed.length} butaca(s): {parsed.join(", ")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending || saveMut.isPending}
          >
            {deleteMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Desmarcar"}
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || deleteMut.isPending}
          >
            {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CellDrawer({
  cell, suggest, isSuggesting, onSuggest, onApply, isApplying, onManual, isManual, onClose,
}: {
  cell: SeatCell;
  sessionId: string;
  suggest: ResolutionPlan | undefined;
  isSuggesting: boolean;
  onSuggest: () => void;
  onApply: (moves: ResolutionPlan["moves"], cross: boolean) => void;
  isApplying: boolean;
  onManual: (o: SeatCell["occupants"][number], zone: string, row: string, number: string) => void;
  isManual: boolean;
  onClose: () => void;
}) {
  const isConflict = cell.occupants.length > 1;
  const [editing, setEditing] = useState<{ id: string; zone: string; row: string; number: string } | null>(null);
  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {cell.zone} · F{cell.row} · Asiento {cell.number}
        </SheetTitle>
        <SheetDescription>
          {cell.occupants.length === 0
            ? "Asiento libre"
            : `${cell.occupants.length} persona(s) asignada(s) a esta butaca`}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-3">
        {cell.occupants.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay nadie asignado aquí.</p>
        )}
        {cell.occupants.map((o) => (
          <Card key={o.id}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {o.kind === "titular" ? <Users className="h-4 w-4" /> : <Users className="h-4 w-4 opacity-60" />}
                    {o.full_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {o.kind === "titular" ? "Titular" : "Acompañante"}
                    {o.dni && <> · DNI {o.dni}</>}
                    {o.status && <> · {o.status}</>}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing({ id: o.id, zone: cell.zone, row: cell.row, number: cell.number })}>
                  Cambiar asiento
                </Button>
              </div>
              {editing?.id === o.id && (
                <div className="grid grid-cols-3 gap-2">
                  <Input value={editing.zone} onChange={(e) => setEditing({ ...editing, zone: e.target.value })} placeholder="Zona" />
                  <Input value={editing.row} onChange={(e) => setEditing({ ...editing, row: e.target.value })} placeholder="Fila" />
                  <Input value={editing.number} onChange={(e) => setEditing({ ...editing, number: e.target.value })} placeholder="Nº" />
                  <div className="col-span-3 flex gap-2">
                    <Button size="sm" disabled={isManual} onClick={() => {
                      onManual(o, editing.zone.trim(), editing.row.trim(), editing.number.trim());
                      setEditing(null);
                    }}>{isManual ? <Loader2 className="h-3 w-3 animate-spin" /> : "Guardar"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {isConflict && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-amber-600" /> Resolución sugerida
              </div>
              <Button size="sm" variant="outline" onClick={onSuggest} disabled={isSuggesting}>
                {isSuggesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
                Calcular sugerencia
              </Button>
            </div>

            {suggest && (
              <Card>
                <CardContent className="p-3 space-y-2 text-sm">
                  <div className="font-medium">{strategyLabel(suggest.strategy)}</div>
                  {suggest.notes.map((n, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{n}</p>
                  ))}
                  <div className="space-y-1">
                    {suggest.moves.map((m, i) => (
                      <div key={i} className="text-xs flex items-center gap-1 flex-wrap">
                        <Badge variant="secondary">{m.occupant_kind === "titular" ? "Titular" : "Acomp."}</Badge>
                        <span>{m.occupant_name}</span>
                        <span className="text-muted-foreground">→</span>
                        {m.to ? (
                          <span>{m.to.zone}, F{m.to.row}, asiento {m.to.number}</span>
                        ) : (
                          <span className="text-rose-700">liberar / fusionar</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {suggest.moves.length > 0 && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" disabled={isApplying} onClick={() => onApply(suggest.moves, suggest.unsafe)}>
                        {isApplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        {suggest.unsafe ? "Aplicar (incluye cambio de zona)" : "Aplicar sugerencia"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={onClose}>Cerrar</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function strategyLabel(s: ResolutionPlan["strategy"]): string {
  switch (s) {
    case "merge_duplicate_person": return "Fusión de duplicado";
    case "stay_oldest_relocate_others": return "Mantener el más antiguo y reubicar al resto";
    case "cross_zone_required": return "Requiere cambio de zona";
    default: return "Sin cambios";
  }
}

function PromoteToVenuePlanDialog({
  open, onOpenChange, sessionId, defaultVenueName, defaultCity, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string;
  defaultVenueName: string;
  defaultCity: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [venueName, setVenueName] = useState(defaultVenueName);
  const [city, setCity] = useState(defaultCity);
  const [planName, setPlanName] = useState("Configuración principal");
  const [linkToSession, setLinkToSession] = useState(true);

  // Sync defaults when they arrive
  useMemo(() => { if (defaultVenueName && !venueName) setVenueName(defaultVenueName); }, [defaultVenueName]);
  useMemo(() => { if (defaultCity && !city) setCity(defaultCity); }, [defaultCity]);

  const promoteFn = useServerFn(promoteSessionOverridesToVenuePlan);
  const mut = useMutation({
    mutationFn: () => promoteFn({ data: {
      sessionId, venueName: venueName.trim(), city: city.trim() || null,
      planName: planName.trim(), linkToSession,
    } }),
    onSuccess: (res) => {
      toast.success(`Plano creado con ${res.seatsCreated} butacas`);
      onOpenChange(false);
      onDone();
      router.navigate({ to: "/planos/$planId", params: { planId: res.venuePlanId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promover a plano de recinto</DialogTitle>
          <DialogDescription>
            Las butacas que ya dibujaste en esta sesión se guardarán como un plano reutilizable. Después podrás
            asignarlo a otras sesiones desde la edición de cada sesión.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre del recinto</Label>
            <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Cartuja Center CITE Sevilla" />
          </div>
          <div>
            <Label>Ciudad</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sevilla" />
          </div>
          <div>
            <Label>Nombre del plano</Label>
            <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Configuración principal" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={linkToSession}
              onChange={(e) => setLinkToSession(e.target.checked)}
            />
            Vincular este plano a la sesión actual
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancelar</Button>
          <Button
            disabled={!venueName.trim() || !planName.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Crear plano de recinto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}