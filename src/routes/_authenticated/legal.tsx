import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shield, Plus, FileText, CheckCircle2, Clock, Pencil } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/legal")({
  component: Page,
});

const KIND_LABELS: Record<string, string> = {
  privacidad: "Privacidad",
  imagen: "Imagen",
  futuros_procesos: "Futuros procesos",
  terminos: "Términos",
  otro: "Otro",
};

type LegalKind = Database["public"]["Enums"]["legal_text_kind"];

type LegalRow = {
  id: string;
  kind: LegalKind;
  version: string;
  title: string;
  body: string;
  is_active: boolean;
  effective_from: string;
  created_at: string;
};

type FormState = {
  id?: string;
  title: string;
  kind: LegalKind;
  version: string;
  body: string;
  status: "borrador" | "publicado";
};

const EMPTY: FormState = { title: "", kind: "privacidad", version: "1.0", body: "", status: "borrador" };

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: legalTexts = [], isLoading } = useQuery({
    queryKey: ["legal-texts-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_texts")
        .select("id, kind, version, title, body, is_active, effective_from, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LegalRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (input: FormState) => {
      const payload = {
        title: input.title.trim(),
        kind: input.kind,
        version: input.version.trim(),
        body: input.body,
        is_active: input.status === "publicado",
      };
      if (input.id) {
        const { error } = await supabase.from("legal_texts").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("legal_texts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["legal-texts-admin"] });
      toast.success("Texto legal guardado");
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const startNew = () => { setForm(EMPTY); setOpen(true); };
  const startEdit = (r: LegalRow) => {
    setForm({
      id: r.id, title: r.title, kind: r.kind, version: r.version,
      body: r.body, status: r.is_active ? "publicado" : "borrador",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Legal / RGPD"
        description="Textos legales, versiones, política de privacidad, consentimientos y exportación RGPD."
        actions={
          <Button className="uppercase tracking-wider" onClick={startNew}>
            <Plus className="h-4 w-4 mr-2" />Nuevo
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : legalTexts.length === 0 ? (
        <EmptyState
          icon={<Shield className="h-12 w-12" />}
          title="Sin versiones publicadas"
          description="Publica la primera versión del texto legal para empezar a registrar consentimientos."
        />
      ) : (
        <Card className="rounded-none">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Texto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Versión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vigente desde</TableHead>
                  <TableHead className="w-20 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legalTexts.map((text) => (
                  <TableRow key={text.id}>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div>
                          <div className="font-semibold">{text.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2 max-w-xl">{text.body}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{KIND_LABELS[text.kind] ?? text.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{text.version}</TableCell>
                    <TableCell>
                      <Badge variant={text.is_active ? "default" : "outline"} className="gap-1">
                        {text.is_active ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {text.is_active ? "Publicado" : "Borrador"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(text.effective_from).toLocaleDateString("es-ES")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(text)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar texto legal" : "Nuevo texto legal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as LegalKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Versión</Label>
                <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0" />
              </div>
            </div>
            <div>
              <Label>Contenido</Label>
              <Textarea rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "borrador" | "publicado" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="publicado">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.title.trim() || !form.body.trim() || save.isPending}>
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
