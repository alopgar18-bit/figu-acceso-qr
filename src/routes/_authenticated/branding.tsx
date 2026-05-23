import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useEvents } from "@/lib/use-events";

export const Route = createFileRoute("/_authenticated/branding")({
  component: Page,
});

type BrandRow = {
  id: string;
  name: string;
  logo_url: string | null;
  cover_url: string | null;
  primary_color: string;
  secondary_color: string;
  client_id: string | null;
  event_id: string | null;
};

type FormState = {
  id?: string;
  name: string;
  logo_url: string;
  cover_url: string;
  primary_color: string;
  secondary_color: string;
  client_id: string;
  event_id: string;
};

const EMPTY: FormState = {
  name: "",
  logo_url: "",
  cover_url: "",
  primary_color: "#000000",
  secondary_color: "#ffffff",
  client_id: "",
  event_id: "",
};

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["brand_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_profiles" as never)
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BrandRow[];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: events = [] } = useEvents();

  const save = useMutation({
    mutationFn: async (input: FormState) => {
      const payload = {
        name: input.name.trim(),
        logo_url: input.logo_url.trim() || null,
        cover_url: input.cover_url.trim() || null,
        primary_color: input.primary_color,
        secondary_color: input.secondary_color,
        client_id: input.client_id || null,
        event_id: input.event_id || null,
      };
      const db = supabase.from("brand_profiles" as never) as unknown as {
        update: (p: typeof payload) => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
        insert: (p: typeof payload) => Promise<{ error: unknown }>;
      };
      if (input.id) {
        const { error } = await db.update(payload).eq("id", input.id);
        if (error) throw error as Error;
      } else {
        const { error } = await db.insert(payload);
        if (error) throw error as Error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand_profiles"] });
      toast.success("Branding guardado");
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_profiles" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand_profiles"] });
      toast.success("Perfil eliminado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startNew = () => { setForm(EMPTY); setOpen(true); };
  const startEdit = (r: BrandRow) => {
    setForm({
      id: r.id, name: r.name,
      logo_url: r.logo_url ?? "", cover_url: r.cover_url ?? "",
      primary_color: r.primary_color, secondary_color: r.secondary_color,
      client_id: r.client_id ?? "", event_id: r.event_id ?? "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Branding"
        description="Personaliza logo, colores y firma de emails para cada evento o cliente."
        actions={
          <Button className="uppercase tracking-wider" onClick={startNew}>
            <Plus className="h-4 w-4 mr-2" />Nuevo
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Palette className="h-12 w-12" />}
          title="Branding por defecto activo"
          description="Sube assets personalizados para clientes/productoras o eventos específicos."
        />
      ) : (
        <Card className="rounded-none">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Colores</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead className="w-32 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const client = clients.find((c) => c.id === r.client_id);
                  const event = events.find((e) => e.id === r.event_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {r.logo_url
                            ? <img src={r.logo_url} alt="" className="h-8 w-8 rounded object-cover border" />
                            : <div className="h-8 w-8 rounded border bg-muted" />}
                          <span className="font-semibold">{r.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded border" style={{ background: r.primary_color }} />
                          <span className="h-5 w-5 rounded border" style={{ background: r.secondary_color }} />
                          <span className="text-xs text-muted-foreground font-mono">{r.primary_color} / {r.secondary_color}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {client ? `Cliente: ${client.name}` : event ? `Evento: ${event.name}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => remove.mutate(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar branding" : "Nuevo branding"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre del perfil</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Logo (URL)</Label>
              <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <Label>Imagen de portada (URL)</Label>
              <Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Color principal</Label>
                <div className="flex gap-2">
                  <Input type="color" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} className="w-14 p-1" />
                  <Input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Color secundario</Label>
                <div className="flex gap-2">
                  <Input type="color" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} className="w-14 p-1" />
                  <Input value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cliente</Label>
                <Select value={form.client_id || "none"} onValueChange={(v) => setForm({ ...form, client_id: v === "none" ? "" : v, event_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Evento</Label>
                <Select value={form.event_id || "none"} onValueChange={(v) => setForm({ ...form, event_id: v === "none" ? "" : v, client_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.name.trim() || save.isPending}>
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
