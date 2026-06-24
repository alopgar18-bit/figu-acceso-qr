import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, LayoutGrid, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/planos/")({
  component: PlanosIndex,
});

function PlanosIndex() {
  const qc = useQueryClient();
  const [venueDialogOpen, setVenueDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);

  const venuesQ = useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const plansQ = useQuery({
    queryKey: ["venue_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_plans")
        .select("*, venues(name, city), venue_seats(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Recintos"
        title="Planos físicos"
        description="Define recintos y planos reutilizables. Cada plano contiene zonas y butacas que luego se asocian a sesiones."
        actions={
          <>
            <Dialog open={venueDialogOpen} onOpenChange={setVenueDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Building2 className="mr-2 h-4 w-4" /> Nuevo recinto
                </Button>
              </DialogTrigger>
              <NewVenueDialog onDone={() => { setVenueDialogOpen(false); qc.invalidateQueries({ queryKey: ["venues"] }); }} />
            </Dialog>
            <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!venuesQ.data?.length}>
                  <Plus className="mr-2 h-4 w-4" /> Nuevo plano
                </Button>
              </DialogTrigger>
              <NewPlanDialog
                venues={venuesQ.data ?? []}
                onDone={() => { setPlanDialogOpen(false); qc.invalidateQueries({ queryKey: ["venue_plans"] }); }}
              />
            </Dialog>
          </>
        }
      />

      {plansQ.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : !plansQ.data?.length ? (
        <EmptyState
          icon={<LayoutGrid className="h-10 w-10 text-muted-foreground" />}
          title="Aún no hay planos"
          description={venuesQ.data?.length ? "Crea tu primer plano para empezar." : "Crea primero un recinto y después un plano."}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plansQ.data.map((p: any) => (
            <Link key={p.id} to="/planos/$planId" params={{ planId: p.id }}>
              <Card className="hover:border-primary transition cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    {p.is_active ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <div className="font-medium text-foreground">{p.venues?.name}</div>
                  {p.venues?.city && <div>{p.venues.city}</div>}
                  <div>v{p.version} · {p.venue_seats?.[0]?.count ?? 0} butacas</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewVenueDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("venues").insert({ name, city: city || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recinto creado"); setName(""); setCity(""); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Error al crear"),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nuevo recinto</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Teatro Principal" /></div>
        <div><Label>Ciudad</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Madrid" /></div>
      </div>
      <DialogFooter>
        <Button disabled={!name || m.isPending} onClick={() => m.mutate()}>Crear</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewPlanDialog({ venues, onDone }: { venues: any[]; onDone: () => void }) {
  const [venueId, setVenueId] = useState<string>(venues[0]?.id ?? "");
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("venue_plans").insert({ venue_id: venueId, name });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plano creado"); setName(""); onDone(); },
    onError: (e: any) => toast.error(e.message ?? "Error al crear"),
  });
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nuevo plano</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Recinto</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Nombre del plano</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Configuración estándar" /></div>
      </div>
      <DialogFooter>
        <Button disabled={!name || !venueId || m.isPending} onClick={() => m.mutate()}>Crear</Button>
      </DialogFooter>
    </DialogContent>
  );
}