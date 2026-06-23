import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, CheckCircle2, Users, Loader2, Wand2, Search, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
          data && data.totals.conflictos > 0 ? (
            <Button onClick={() => applyAllSafeMut.mutate()} disabled={applyAllSafeMut.isPending}>
              {applyAllSafeMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Aplicar sugerencias seguras
            </Button>
          ) : undefined
        }
      />

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <KpiCard label="Aforo" value={data.totals.aforo} />
            <KpiCard label="Butacas ocupadas" value={data.totals.butacas_ocupadas} />
            <KpiCard label="Personas" value={data.totals.personas_ocupadas} />
            <KpiCard label="Reservados" value={data.totals.reservados_no_disponibles} tone={data.totals.reservados_no_disponibles > 0 ? "warn" : undefined} />
            <KpiCard
              label="Libres"
              value={data.totals.libres_estimadas}
              tone={data.totals.overbooking > 0 ? "danger" : "ok"}
              hint={
                data.totals.overbooking > 0
                  ? `Overbooking: ${data.totals.overbooking} butacas asignadas por encima del aforo`
                  : undefined
              }
            />
            <KpiCard label="Conflictos" value={data.totals.conflictos} tone={data.totals.conflictos > 0 ? "warn" : "ok"} />
          </div>
          {data.totals.overbooking > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Hay más butacas asignadas que aforo</AlertTitle>
              <AlertDescription>
                Aforo configurado: {data.totals.aforo}. Butacas ocupadas: {data.totals.butacas_ocupadas}.
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

          {(data.overrides_summary.length > 0 || isAdmin) && (
            <Card>
              <CardContent className="p-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground">Leyenda:</span>
                <LegendDot tone="free" label="Libre" />
                <LegendDot tone="occ" label="Ocupado" />
                <LegendDot tone="conflict" label="Conflicto" />
                {data.overrides_summary.map((o) => (
                  <span key={o.category} className="inline-flex items-center gap-1 text-xs">
                    <span
                      className="inline-block h-3 w-3 rounded border"
                      style={{ backgroundColor: o.color, borderColor: o.color }}
                    />
                    {SEAT_OVERRIDE_LABELS[o.category]} ({o.count})
                  </span>
                ))}
                {isAdmin && (
                  <div className="ml-auto">
                    <MarkSeatsDialog
                      sessionId={sessionId}
                      zones={zones.map((z) => z.zone)}
                      onSaved={() => occQuery.refetch()}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
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
                    const visible =
                      (mode === "todos") ||
                      (mode === "conflictos" && s.occupants.length > 1) ||
                      (mode === "libres" && s.occupants.length === 0);
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
  const cls = conflict
    ? "bg-rose-400 border-rose-600 text-rose-950 hover:bg-rose-500"
    : occupied
    ? "bg-sky-300 border-sky-500 text-sky-950 hover:bg-sky-400"
    : "bg-emerald-200 border-emerald-400 text-emerald-900 hover:bg-emerald-300";
  const dimCls = dim ? "opacity-30" : "";
  const label = (
    <button
      type="button"
      onClick={onClick}
      className={`h-6 min-w-[26px] px-1 text-[10px] font-medium rounded border ${cls} ${dimCls} transition`}
    >
      {cell.number}
    </button>
  );
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