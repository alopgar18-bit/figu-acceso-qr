import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { importVenueSeats } from "@/lib/venue-seats.functions";
import { bulkAssignVenuePlanToSessions } from "@/lib/venue-plans.functions";

const SEAT_CATEGORIES = [
  { value: "libre", label: "Libre", color: "#e5e7eb" },
  { value: "reservado_camaras", label: "Reservado cámaras", color: "#374151" },
  { value: "bloqueado", label: "Bloqueado", color: "#9ca3af" },
  { value: "movilidad_reducida", label: "Movilidad reducida", color: "#3b82f6" },
  { value: "acompanante_mr", label: "Acompañante MR", color: "#93c5fd" },
  { value: "visibilidad_reducida", label: "Visibilidad reducida", color: "#f59e0b" },
] as const;

const categoryColor = (cat: string) => SEAT_CATEGORIES.find((c) => c.value === cat)?.color ?? "#e5e7eb";

export const Route = createFileRoute("/_authenticated/planos/$planId")({
  component: PlanEditor,
});

function PlanEditor() {
  const { planId } = Route.useParams();
  const qc = useQueryClient();
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [paintCategory, setPaintCategory] = useState<string>("libre");

  const planQ = useQuery({
    queryKey: ["venue_plan", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_plans")
        .select("*, venues(name, city)")
        .eq("id", planId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const zonesQ = useQuery({
    queryKey: ["venue_zones", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_zones")
        .select("*")
        .eq("plan_id", planId)
        .order("display_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const seatsQ = useQuery({
    queryKey: ["venue_seats", planId, selectedZoneId],
    enabled: !!selectedZoneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_seats")
        .select("*")
        .eq("plan_id", planId)
        .eq("zone_id", selectedZoneId!)
        .order("row_index")
        .order("col_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateSeat = useMutation({
    mutationFn: async (vars: { id: string; default_category: string }) => {
      const { error } = await supabase
        .from("venue_seats")
        .update({ default_category: vars.default_category })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venue_seats", planId, selectedZoneId] }),
    onError: (e: any) => toast.error(e.message),
  });

  const seatsByGrid = useMemo(() => {
    const seats = seatsQ.data ?? [];
    if (!seats.length) return { rows: [] as any[][], maxCol: 0 };
    const maxRow = Math.max(...seats.map((s) => s.row_index));
    const maxCol = Math.max(...seats.map((s) => s.col_index));
    const grid: any[][] = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(null));
    seats.forEach((s) => { grid[s.row_index][s.col_index] = s; });
    return { rows: grid, maxCol };
  }, [seatsQ.data]);

  if (planQ.isLoading) return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
  if (!planQ.data) return <div>Plano no encontrado.</div>;

  return (
    <div>
      <Link to="/planos" className="inline-flex items-center text-sm text-muted-foreground mb-4 hover:text-foreground">
        <ArrowLeft className="mr-1 h-3 w-3" /> Volver
      </Link>
      <PageHeader
        eyebrow={planQ.data.venues?.name}
        title={planQ.data.name}
        description={`v${planQ.data.version} · ${planQ.data.venues?.city ?? ""}`}
        actions={<ImportSeatsButton planId={planId} />}
      />

      <LinkedSessionsCard planId={planId} />

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        {/* Sidebar: zones */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Zonas</CardTitle>
              <NewZoneButton planId={planId} order={(zonesQ.data?.length ?? 0)} />
            </CardHeader>
            <CardContent className="space-y-1">
              {zonesQ.isLoading ? <Skeleton className="h-8" /> :
                !zonesQ.data?.length ? (
                  <p className="text-xs text-muted-foreground">Sin zonas. Crea la primera para empezar.</p>
                ) : (
                  zonesQ.data.map((z) => (
                    <button
                      key={z.id}
                      onClick={() => setSelectedZoneId(z.id)}
                      className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 hover:bg-accent ${selectedZoneId === z.id ? "bg-accent font-medium" : ""}`}
                    >
                      <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: z.color }} />
                      {z.name}
                    </button>
                  ))
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Categoría a pintar</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Select value={paintCategory} onValueChange={setPaintCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEAT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} /> {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Haz clic en una butaca del grid para asignarle esta categoría.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Leyenda</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {SEAT_CATEGORIES.map((c) => (
                <div key={c.value} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: c.color }} />
                  {c.label}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{selectedZoneId ? zonesQ.data?.find((z) => z.id === selectedZoneId)?.name : "Selecciona una zona"}</span>
              {selectedZoneId && <Badge variant="outline">{seatsQ.data?.length ?? 0} butacas</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedZoneId ? (
              <p className="text-sm text-muted-foreground">Selecciona una zona para ver sus butacas.</p>
            ) : seatsQ.isLoading ? (
              <Skeleton className="h-64" />
            ) : !seatsQ.data?.length ? (
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Esta zona aún no tiene butacas.</p>
                <p>Usa el import masivo (Fase 2) para cargar la disposición desde Excel.</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <div className="inline-block space-y-1">
                  {seatsByGrid.rows.map((row, ri) => (
                    <div key={ri} className="flex gap-1">
                      {row.map((seat, ci) => (
                        seat ? (
                          <button
                            key={seat.id}
                            title={`${seat.row_label}-${seat.seat_number} · ${seat.default_category}`}
                            onClick={() => updateSeat.mutate({ id: seat.id, default_category: paintCategory })}
                            className="w-7 h-7 rounded border text-[9px] flex items-center justify-center hover:ring-2 hover:ring-primary"
                            style={{ backgroundColor: categoryColor(seat.default_category) }}
                          >
                            {seat.seat_number}
                          </button>
                        ) : (
                          <div key={`${ri}-${ci}`} className="w-7 h-7" />
                        )
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NewZoneButton({ planId, order }: { planId: string; order: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("venue_zones").insert({ plan_id: planId, name, color, display_order: order });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Zona creada"); setName(""); setOpen(false); qc.invalidateQueries({ queryKey: ["venue_zones", planId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Plus className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva zona</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Platea Puerta 2" /></div>
          <div><Label>Color</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" /></div>
        </div>
        <DialogFooter>
          <Button disabled={!name || m.isPending} onClick={() => m.mutate()}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSeatsButton({ planId }: { planId: string }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importVenueSeats);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
      if (!rows.length) {
        toast.error("El archivo no tiene filas.");
        return;
      }
      const result = await importFn({ data: { planId, rows, replace } });
      toast.success(
        `${result.inserted} butacas · ${result.zones_created} zonas nuevas${result.errors.length ? ` · ${result.errors.length} errores` : ""}`,
      );
      if (result.errors.length) {
        console.warn("Errores de import:", result.errors);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["venue_zones", planId] }),
        qc.invalidateQueries({ queryKey: ["venue_seats", planId] }),
      ]);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al importar");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="mr-2 h-4 w-4" /> Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Importar butacas desde Excel</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Columnas esperadas: <code>zona</code>, <code>fila</code>, <code>numero</code>,
            <code> categoria</code> (opcional), <code>row_index</code>, <code>col_index</code> (opcionales),
            <code> activo</code> (opcional).
          </p>
          <p className="text-xs text-muted-foreground">
            Categorías válidas: libre, reservado_camaras, bloqueado, movilidad_reducida, acompanante_mr, visibilidad_reducida.
            Si no indicas índices, se calculan automáticamente por zona y fila.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Reemplazar todas las butacas existentes del plano
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}