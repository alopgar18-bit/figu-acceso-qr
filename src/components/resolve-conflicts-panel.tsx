import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, Download, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { utils, writeFile } from "xlsx";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  clearSeatsBulk,
  listSeatConflicts,
  type ConflictOccupant,
  type DuplicateGroup,
} from "@/lib/seat-conflicts.functions";

type SelectionKey = string; // `${kind}:${id}`
const occKey = (o: ConflictOccupant): SelectionKey => `${o.kind}:${o.id}`;

export function ResolveConflictsPanel({
  sessionId,
  onRefresh,
}: {
  sessionId: string;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const listFn = useServerFn(listSeatConflicts);
  const clearFn = useServerFn(clearSeatsBulk);

  const q = useQuery({
    queryKey: ["seat-conflicts", sessionId],
    queryFn: () => listFn({ data: { session_id: sessionId } }),
    enabled: open,
  });

  const data = q.data;

  const [dupSel, setDupSel] = useState<Set<SelectionKey>>(new Set());
  const [canSel, setCanSel] = useState<Set<SelectionKey>>(new Set());

  const dupTotal = useMemo(
    () => data?.duplicates.reduce((s, g) => s + g.occupants.length, 0) ?? 0,
    [data],
  );

  const clearMut = useMutation({
    mutationFn: async (vars: {
      occs: { kind: "titular" | "acompanante"; id: string }[];
      reason: string;
    }) =>
      clearFn({
        data: {
          session_id: sessionId,
          occupants: vars.occs,
          reason: vars.reason,
        },
      }),
    onSuccess: (res, vars) => {
      toast.success(`${res.cleared} asignaciones liberadas (${vars.reason})`);
      setDupSel(new Set());
      setCanSel(new Set());
      q.refetch();
      onRefresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al liberar"),
  });

  function exportXlsx() {
    if (!data) return;
    const wb = utils.book_new();
    const dupRows = data.duplicates.flatMap((g) =>
      g.occupants.map((o) => ({
        Zona: g.zone,
        Fila: g.row,
        Asiento: g.number,
        Tipo: o.kind,
        Nombre: o.full_name,
        Email: o.email ?? "",
        DNI: o.dni ?? "",
        Estado: o.status ?? "",
        "Creado el": o.created_at,
      })),
    );
    utils.book_append_sheet(wb, utils.json_to_sheet(dupRows), "Duplicados");
    const canRows = data.canceled_with_seat.map((o) => ({
      Tipo: o.kind,
      Nombre: o.full_name,
      Email: o.email ?? "",
      DNI: o.dni ?? "",
      Estado: o.status ?? "",
      Zona: o.zone,
      Fila: o.row,
      Asiento: o.number,
    }));
    utils.book_append_sheet(wb, utils.json_to_sheet(canRows), "Cancelados con butaca");
    const offRows = data.off_plan.map((o) => ({
      Tipo: o.kind,
      Nombre: o.full_name,
      Email: o.email ?? "",
      Zona: o.zone,
      Fila: o.row,
      Asiento: o.number,
    }));
    utils.book_append_sheet(wb, utils.json_to_sheet(offRows), "Fuera del plano");
    writeFile(wb, `conflictos-sesion-${sessionId.slice(0, 8)}.xlsx`);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 p-3 hover:bg-muted/40 transition rounded"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Resolver conflictos (lote)
              {data && (
                <>
                  {data.duplicates.length > 0 && (
                    <Badge variant="destructive">
                      {data.duplicates.length} butacas duplicadas
                    </Badge>
                  )}
                  {data.canceled_with_seat.length > 0 && (
                    <Badge variant="outline">
                      {data.canceled_with_seat.length} cancelados con butaca
                    </Badge>
                  )}
                </>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-3 space-y-4 border-t">
            {q.isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            )}
            {data && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={exportXlsx}>
                    <Download className="h-3 w-3 mr-1" /> Exportar a Excel
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => q.refetch()}>
                    Recargar
                  </Button>
                </div>

                {/* Duplicados */}
                <section className="space-y-2">
                  <div className="text-sm font-medium flex items-center justify-between">
                    <span>
                      Duplicados de butaca · {data.duplicates.length} butacas afectadas (
                      {dupTotal} personas)
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={dupSel.size === 0 || clearMut.isPending}
                      onClick={() => {
                        const occs: { kind: "titular" | "acompanante"; id: string }[] = [];
                        for (const k of dupSel) {
                          const [kind, id] = k.split(":");
                          occs.push({ kind: kind as "titular" | "acompanante", id });
                        }
                        clearMut.mutate({
                          occs,
                          reason: "Liberar duplicado seleccionado",
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Liberar seleccionados ({dupSel.size})
                    </Button>
                  </div>
                  {data.duplicates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sin butacas duplicadas. 🎉
                    </p>
                  ) : (
                    <ScrollArea className="h-64 border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-1 w-8"></th>
                            <th className="text-left p-1">Butaca</th>
                            <th className="text-left p-1">Tipo</th>
                            <th className="text-left p-1">Nombre</th>
                            <th className="text-left p-1">Email</th>
                            <th className="text-left p-1">Creado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.duplicates.map((g) => (
                            <DupRows
                              key={`${g.zone}-${g.row}-${g.number}`}
                              group={g}
                              selected={dupSel}
                              setSelected={setDupSel}
                            />
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  )}
                </section>

                {/* Cancelados con butaca */}
                <section className="space-y-2">
                  <div className="text-sm font-medium flex items-center justify-between">
                    <span>
                      Cancelados con butaca · {data.canceled_with_seat.length}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={data.canceled_with_seat.length === 0}
                        onClick={() =>
                          setCanSel(new Set(data.canceled_with_seat.map(occKey)))
                        }
                      >
                        Seleccionar todos
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={canSel.size === 0 || clearMut.isPending}
                        onClick={() => {
                          const occs: { kind: "titular" | "acompanante"; id: string }[] = [];
                          for (const k of canSel) {
                            const [kind, id] = k.split(":");
                            occs.push({ kind: kind as "titular" | "acompanante", id });
                          }
                          clearMut.mutate({
                            occs,
                            reason: "Liberar butaca de cancelados",
                          });
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Liberar seleccionados ({canSel.size})
                      </Button>
                    </div>
                  </div>
                  {data.canceled_with_seat.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Ningún cancelado conserva butaca.
                    </p>
                  ) : (
                    <ScrollArea className="h-48 border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="text-left p-1 w-8"></th>
                            <th className="text-left p-1">Nombre</th>
                            <th className="text-left p-1">Email</th>
                            <th className="text-left p-1">Estado</th>
                            <th className="text-left p-1">Butaca</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.canceled_with_seat.map((o) => (
                            <tr key={occKey(o)} className="border-t">
                              <td className="p-1">
                                <Checkbox
                                  checked={canSel.has(occKey(o))}
                                  onCheckedChange={(v) => {
                                    setCanSel((prev) => {
                                      const n = new Set(prev);
                                      if (v) n.add(occKey(o));
                                      else n.delete(occKey(o));
                                      return n;
                                    });
                                  }}
                                />
                              </td>
                              <td className="p-1">
                                {o.kind === "titular" ? "👤" : "👥"} {o.full_name}
                              </td>
                              <td className="p-1 text-muted-foreground">{o.email ?? "—"}</td>
                              <td className="p-1">
                                <Badge variant="outline">{o.status ?? "—"}</Badge>
                              </td>
                              <td className="p-1">
                                {o.zone} F{o.row} #{o.number}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  )}
                </section>

                {/* Fuera del plano (placeholder hasta módulo de planos) */}
                {data.off_plan.length > 0 && (
                  <section className="space-y-2">
                    <div className="text-sm font-medium">
                      Asignaciones fuera del plano · {data.off_plan.length}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Exporta a Excel para revisar. La detección automática se completará con el
                      módulo de planos físicos.
                    </p>
                  </section>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function DupRows({
  group,
  selected,
  setSelected,
}: {
  group: DuplicateGroup;
  selected: Set<SelectionKey>;
  setSelected: (fn: (s: Set<SelectionKey>) => Set<SelectionKey>) => void;
}) {
  return (
    <>
      {group.occupants.map((o, i) => (
        <tr key={occKey(o)} className="border-t">
          <td className="p-1">
            <Checkbox
              checked={selected.has(occKey(o))}
              onCheckedChange={(v) =>
                setSelected((prev) => {
                  const n = new Set(prev);
                  if (v) n.add(occKey(o));
                  else n.delete(occKey(o));
                  return n;
                })
              }
            />
          </td>
          <td className="p-1 font-mono">
            {i === 0 ? `${group.zone} F${group.row} #${group.number}` : ""}
          </td>
          <td className="p-1">{o.kind === "titular" ? "Titular" : "Acomp."}</td>
          <td className="p-1">{o.full_name}</td>
          <td className="p-1 text-muted-foreground">{o.email ?? "—"}</td>
          <td className="p-1 text-muted-foreground">
            {o.created_at.slice(0, 10)}
          </td>
        </tr>
      ))}
    </>
  );
}