import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Copy, ExternalLink, Trash2, Loader2, Files } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { listEventForms, createPublicForm, deletePublicForm, updatePublicForm, duplicatePublicForm } from "@/lib/forms.functions";
import { useEventSessions } from "@/lib/use-events";
import { ATTENDEE_TYPE_OPTIONS, attendeeLabel, type AttendeeType } from "@/lib/participant-constants";
import { FormEditorDialog } from "@/components/form-editor-dialog";
import { FormQrDialog } from "@/components/form-qr-dialog";

const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador", publicado: "Publicado", cerrado: "Cerrado", archivado: "Archivado",
};
const STATUS_TONE: Record<string, "default" | "secondary" | "outline"> = {
  publicado: "default", borrador: "outline", cerrado: "secondary", archivado: "secondary",
};

export function EventFormsPanel({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listEventForms);
  const create = useServerFn(createPublicForm);
  const remove = useServerFn(deletePublicForm);
  const update = useServerFn(updatePublicForm);
  const dup = useServerFn(duplicatePublicForm);
  const { data: sessions = [] } = useEventSessions(eventId);

  const { data: forms, isLoading } = useQuery({
    queryKey: ["public-forms", eventId],
    queryFn: () => list({ data: { event_id: eventId } }),
  });

  const [open, setOpen] = useState(false);
  const [attendee, setAttendee] = useState<AttendeeType>("publico");
  const [title, setTitle] = useState("");
  const [sessionId, setSessionId] = useState<string>("all");
  const [busy, setBusy] = useState(false);

  const baseUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/f/`;
  }, []);

  async function onCreate() {
    const t = title.trim() || `Inscripción ${attendeeLabel(attendee)}`;
    setBusy(true);
    try {
      await create({
        data: {
          event_id: eventId,
          session_id: sessionId === "all" ? null : sessionId,
          attendee_type: attendee,
          title: t,
          status: "publicado",
        },
      });
      toast.success("Formulario creado");
      setOpen(false);
      setTitle("");
      qc.invalidateQueries({ queryKey: ["public-forms", eventId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-forms", eventId] });
      toast.success("Formulario eliminado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo eliminar"),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "publicado" | "cerrado" }) =>
      update({ data: { id, status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["public-forms", eventId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar"),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => dup({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-forms", eventId] });
      toast.success("Formulario duplicado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo duplicar"),
  });

  function copyUrl(slug: string) {
    const url = `${baseUrl}${slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success("URL copiada"));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base uppercase tracking-wider">Formularios públicos</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nuevo formulario</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo formulario por tipo</DialogTitle>
              <DialogDescription>
                Cada formulario genera una URL pública independiente y asigna el tipo de asistente automáticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tipo de asistente *</Label>
                <Select value={attendee} onValueChange={(v) => setAttendee(v as AttendeeType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ATTENDEE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sesión</Label>
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger><SelectValue placeholder="Todas las sesiones" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las sesiones del evento</SelectItem>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Título (opcional)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Inscripción ${attendeeLabel(attendee)}`} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={onCreate} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !forms || forms.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Aún no hay formularios. Crea uno por cada tipo de asistente (público, staff, VIP…).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Sesión</TableHead>
                <TableHead>URL pública</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((f) => {
                const sess = f.event_sessions as { name: string } | null;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.title}</TableCell>
                    <TableCell><Badge variant="outline">{attendeeLabel(f.attendee_type)}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{sess?.name ?? "Todas"}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/f/{f.slug}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_TONE[f.status] ?? "outline"}>{STATUS_LABEL[f.status] ?? f.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyUrl(f.slug)} title="Copiar URL">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <FormQrDialog url={`${baseUrl}${f.slug}`} title={f.title} />
                        <FormEditorDialog form={f as never} eventId={eventId} />
                        <Button asChild variant="ghost" size="sm" title="Abrir">
                          <a href={`/f/${f.slug}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStatus.mutate({ id: f.id, status: f.status === "publicado" ? "cerrado" : "publicado" })}
                        >
                          {f.status === "publicado" ? "Cerrar" : "Publicar"}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar este formulario?</AlertDialogTitle>
                              <AlertDialogDescription>
                                La URL pública dejará de funcionar. Las inscripciones recibidas se mantienen.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => del.mutate(f.id)} className="bg-destructive text-destructive-foreground">
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}