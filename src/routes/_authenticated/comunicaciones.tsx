import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, RotateCw, CheckCircle2, ExternalLink, Copy, Send, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TemplateEditorDialog } from "@/components/template-editor-dialog";
import {
  useTemplates,
  useDeleteTemplate,
  useCommunicationLogs,
  useUpdateLogStatus,
  type TemplateRow,
} from "@/lib/use-communications";
import {
  COMM_STATUS_OPTIONS,
  COMM_CHANNEL_OPTIONS,
  buildWhatsAppUrl,
  SENDER_EMAIL,
  type CommChannel,
  type CommStatus,
} from "@/lib/communication-constants";

export const Route = createFileRoute("/_authenticated/comunicaciones")({
  component: Page,
});

function Page() {
  const matches = useMatches();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { data: templates = [], isLoading: loadingTemplates } = useTemplates();
  const del = useDeleteTemplate();
  const hasChild = matches.some(
    (m) =>
      m.routeId === "/_authenticated/comunicaciones/envio" ||
      m.routeId === "/_authenticated/comunicaciones/cola",
  );
  if (hasChild) return <Outlet />;

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (t: TemplateRow) => {
    setEditing(t);
    setEditorOpen(true);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Comunicaciones"
        description={`Plantillas, envíos por email desde ${SENDER_EMAIL} y WhatsApp asistido, con cola e historial.`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/comunicaciones/envio"><Send className="h-4 w-4 mr-2" />Envío masivo</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/comunicaciones/cola"><ListChecks className="h-4 w-4 mr-2" />Cola de envíos</Link>
            </Button>
            <Button onClick={openNew} className="uppercase tracking-wider">
              <Plus className="h-4 w-4 mr-2" />Nueva plantilla
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
          <TabsTrigger value="queue">Cola y log</TabsTrigger>
          <TabsTrigger value="errors">Errores</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Asunto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Actualizado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingTemplates && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
                  )}
                  {!loadingTemplates && templates.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin plantillas. Crea la primera para empezar.</TableCell></TableRow>
                  )}
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell><Badge variant="outline">{labelFor(t.channel as CommChannel, COMM_CHANNEL_OPTIONS)}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.subject ?? "—"}</TableCell>
                      <TableCell>
                        {t.is_active ? <Badge variant="secondary">Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(t.updated_at).toLocaleString("es-ES")}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          <LogsTable />
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <LogsTable defaultStatus="fallido" />
        </TabsContent>
      </Tabs>

      <TemplateEditorDialog open={editorOpen} onOpenChange={setEditorOpen} template={editing} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar plantilla</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await del.mutateAsync(confirmDelete);
                  toast.success("Plantilla eliminada");
                } catch (e) {
                  toast.error((e as Error).message);
                }
                setConfirmDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function labelFor<T extends string>(value: T, opts: { value: T; label: string }[]) {
  return opts.find((o) => o.value === value)?.label ?? value;
}

function LogsTable({ defaultStatus }: { defaultStatus?: CommStatus }) {
  const [status, setStatus] = useState<CommStatus | "all">(defaultStatus ?? "all");
  const [channel, setChannel] = useState<CommChannel | "all">("all");
  const [search, setSearch] = useState("");
  const { data: logs = [], isLoading } = useCommunicationLogs({
    status: status === "all" ? undefined : status,
    channel: channel === "all" ? undefined : channel,
  });
  const updateStatus = useUpdateLogStatus();

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) => {
      const p = l.people;
      const name = p ? `${p.first_name} ${p.last_name ?? ""}`.toLowerCase() : "";
      return (
        name.includes(q) ||
        (l.to_address ?? "").toLowerCase().includes(q) ||
        (l.subject ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, search]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Input
            placeholder="Buscar nombre, email, asunto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as CommStatus | "all")}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {COMM_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={(v) => setChannel(v as CommChannel | "all")}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Canal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              {COMM_CHANNEL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Destinatario</TableHead>
              <TableHead>Asunto / Mensaje</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin registros</TableCell></TableRow>
            )}
            {filtered.map((l) => {
              const tone = COMM_STATUS_OPTIONS.find((o) => o.value === l.status)?.tone ?? "outline";
              const name = l.people ? `${l.people.first_name} ${l.people.last_name ?? ""}`.trim() : "—";
              return (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("es-ES")}</TableCell>
                  <TableCell><Badge variant="outline">{labelFor(l.channel as CommChannel, COMM_CHANNEL_OPTIONS)}</Badge></TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground">{l.to_address ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm max-w-md">
                    {(() => {
                      const plain = (l.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                      const display = l.subject && l.subject.trim()
                        ? l.subject
                        : plain.slice(0, 80) + (plain.length > 80 ? "…" : "");
                      return <div className="font-medium truncate" title={display}>{display || "—"}</div>;
                    })()}
                    {l.error_message && <div className="text-xs text-destructive mt-1">{l.error_message}</div>}
                  </TableCell>
                  <TableCell><Badge variant={tone}>{labelFor(l.status as CommStatus, COMM_STATUS_OPTIONS)}</Badge></TableCell>
                  <TableCell className="text-right">
                    {l.channel === "whatsapp_asistido" && l.to_address && l.body && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(buildWhatsAppUrl(l.to_address!, l.body!), "_blank", "noopener")}
                        title="Abrir WhatsApp"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    {l.body && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(l.body!);
                          toast.success("Copiado");
                        }}
                        title="Copiar"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    {l.status === "pendiente" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await updateStatus.mutateAsync({ id: l.id, status: "enviado" });
                            toast.success("Marcado como enviado");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                        title="Marcar enviado"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {l.status === "fallido" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await updateStatus.mutateAsync({ id: l.id, status: "pendiente", error_message: null });
                            toast.success("Reintentado");
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                        title="Reintentar"
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
