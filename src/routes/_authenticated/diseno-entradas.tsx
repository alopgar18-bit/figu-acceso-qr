import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Copy, Pencil, Trash2, AlertCircle, Star } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEvents, useEventSessions } from "@/lib/use-events";
import {
  DEFAULT_FOOTER_NOTE, DEFAULT_TICKET_NOTICES, NOTICE_ICON_MAP, NOTICE_ICON_OPTIONS,
  parseTicketDesign, type TicketDesign, type TicketNotice, type TicketNoticeIcon,
} from "@/lib/ticket-design";
import {
  useTicketDesigns, useUpsertTicketDesign, useDuplicateTicketDesign,
  useDeleteTicketDesign, type TicketDesignRow,
} from "@/lib/use-ticket-designs";

export const Route = createFileRoute("/_authenticated/diseno-entradas")({
  component: Page,
});

type Assignment =
  | { kind: "none" }
  | { kind: "global" }
  | { kind: "event"; eventId: string }
  | { kind: "session"; eventId: string; sessionId: string };

function emptyDesign(): TicketDesign {
  return {
    header_bg: "#111111",
    header_text_color: "#ffffff",
    notices: DEFAULT_TICKET_NOTICES,
    footer_note: DEFAULT_FOOTER_NOTE,
    instructions_override: null,
  };
}

function Page() {
  const { data: designs = [], isLoading } = useTicketDesigns();
  const duplicate = useDuplicateTicketDesign();
  const del = useDeleteTicketDesign();
  const [editing, setEditing] = useState<TicketDesignRow | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administración"
        title="Diseño de entradas"
        description="Biblioteca de diseños. Jerarquía de aplicación: sesión > evento > diseño global por defecto."
        actions={
          <Button onClick={() => setEditing("new")} className="uppercase tracking-wider">
            <Plus className="h-4 w-4 mr-2" />Nuevo diseño
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Asignación</TableHead>
                <TableHead>Actualizado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && designs.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                  Sin diseños. Crea el primero para empezar.
                </TableCell></TableRow>
              )}
              {designs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell><ScopeBadge design={d} /></TableCell>
                  <TableCell className="text-xs">{new Date(d.updated_at).toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(d)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try { await duplicate.mutateAsync(d); toast.success("Diseño duplicado"); }
                        catch (e) { toast.error((e as Error).message); }
                      }}
                      title="Duplicar"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(d.id)} title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <DesignEditor
          source={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar diseño</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmDelete) return;
                try { await del.mutateAsync(confirmDelete); toast.success("Diseño eliminado"); }
                catch (e) { toast.error((e as Error).message); }
                setConfirmDelete(null);
              }}
            >Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScopeBadge({ design }: { design: TicketDesignRow }) {
  const { data: events = [] } = useEvents();
  if (design.is_global_default) {
    return <Badge variant="secondary"><Star className="h-3 w-3 mr-1" />Global por defecto</Badge>;
  }
  if (design.scope_event_id) {
    const ev = events.find((e) => e.id === design.scope_event_id);
    return <Badge variant="outline">Evento: {ev?.name ?? "—"}</Badge>;
  }
  if (design.scope_session_id) {
    return <Badge variant="outline">Sesión específica</Badge>;
  }
  return <Badge variant="outline">Sin asignar</Badge>;
}

function DesignEditor({ source, onClose }: { source: TicketDesignRow | null; onClose: () => void }) {
  const upsert = useUpsertTicketDesign();
  const { data: events = [] } = useEvents();

  const initialDesign = useMemo<TicketDesign>(
    () => (source ? parseTicketDesign(source.design) : emptyDesign()),
    [source],
  );

  const [name, setName] = useState(source?.name ?? "");
  const [headerBg, setHeaderBg] = useState(initialDesign.header_bg ?? "#111111");
  const [headerColor, setHeaderColor] = useState(initialDesign.header_text_color ?? "#ffffff");
  const [footerNote, setFooterNote] = useState(initialDesign.footer_note ?? DEFAULT_FOOTER_NOTE);
  const [instructions, setInstructions] = useState(initialDesign.instructions_override ?? "");
  const [notices, setNotices] = useState<TicketNotice[]>(
    initialDesign.notices.length > 0 ? initialDesign.notices : DEFAULT_TICKET_NOTICES,
  );

  const initialAssignment: Assignment = source?.is_global_default
    ? { kind: "global" }
    : source?.scope_session_id
    ? { kind: "session", eventId: "", sessionId: source.scope_session_id }
    : source?.scope_event_id
    ? { kind: "event", eventId: source.scope_event_id }
    : { kind: "none" };

  const [assignKind, setAssignKind] = useState<Assignment["kind"]>(initialAssignment.kind);
  const [assignEventId, setAssignEventId] = useState<string>(
    initialAssignment.kind === "event" || initialAssignment.kind === "session" ? initialAssignment.eventId : "",
  );
  const [assignSessionId, setAssignSessionId] = useState<string>(
    initialAssignment.kind === "session" ? initialAssignment.sessionId : "",
  );

  const { data: sessions = [] } = useEventSessions(assignEventId || undefined);

  // If editing a session-scoped design, resolve its event from the session
  useEffect(() => {
    if (initialAssignment.kind !== "session" || assignEventId) return;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("event_sessions")
        .select("event_id")
        .eq("id", initialAssignment.sessionId)
        .maybeSingle();
      if (data?.event_id) setAssignEventId(data.event_id);
    })();
  }, [initialAssignment, assignEventId]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (assignKind === "event" && !assignEventId) { toast.error("Selecciona un evento"); return; }
    if (assignKind === "session" && (!assignEventId || !assignSessionId)) {
      toast.error("Selecciona evento y sesión"); return;
    }
    const design: TicketDesign = {
      header_bg: headerBg || null,
      header_text_color: headerColor || null,
      footer_note: footerNote || null,
      instructions_override: instructions || null,
      notices: notices.filter((n) => n.text.trim()),
    };
    try {
      await upsert.mutateAsync({
        id: source?.id,
        name: name.trim(),
        design,
        is_global_default: assignKind === "global",
        scope_event_id: assignKind === "event" ? assignEventId : null,
        scope_session_id: assignKind === "session" ? assignSessionId : null,
      });
      toast.success("Diseño guardado");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <Label>Nombre del diseño</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diseño principal eventos TV" />
          </div>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div>
              <Label>Asignación</Label>
              <Select value={assignKind} onValueChange={(v) => setAssignKind(v as Assignment["kind"])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar (sólo biblioteca)</SelectItem>
                  <SelectItem value="global">Global por defecto</SelectItem>
                  <SelectItem value="event">Evento concreto</SelectItem>
                  <SelectItem value="session">Sesión concreta</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Sólo un diseño por evento y por sesión. Solo un diseño global por defecto.
              </p>
            </div>

            {(assignKind === "event" || assignKind === "session") && (
              <div>
                <Label>Evento</Label>
                <Select value={assignEventId} onValueChange={(v) => { setAssignEventId(v); setAssignSessionId(""); }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona un evento" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {assignKind === "session" && assignEventId && (
              <div>
                <Label>Sesión</Label>
                <Select value={assignSessionId} onValueChange={setAssignSessionId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona una sesión" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {new Date(s.starts_at).toLocaleString("es-ES")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Color de fondo del header</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={headerBg} onChange={(e) => setHeaderBg(e.target.value)} className="w-16 h-10 p-1" />
                  <Input value={headerBg} onChange={(e) => setHeaderBg(e.target.value)} placeholder="#000000" />
                </div>
              </div>
              <div>
                <Label>Color del texto del header</Label>
                <div className="flex gap-2 mt-1">
                  <Input type="color" value={headerColor} onChange={(e) => setHeaderColor(e.target.value)} className="w-16 h-10 p-1" />
                  <Input value={headerColor} onChange={(e) => setHeaderColor(e.target.value)} placeholder="#ffffff" />
                </div>
              </div>
            </div>

            <div>
              <Label>Instrucciones (opcional)</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="Si lo dejas vacío se usarán las instrucciones del evento o de la sesión."
              />
            </div>

            <div>
              <Label>Texto de pie de entrada</Label>
              <Input value={footerNote} onChange={(e) => setFooterNote(e.target.value)} placeholder={DEFAULT_FOOTER_NOTE} />
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Avisos</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setNotices([...notices, { icon: "info", text: "" }])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Añadir aviso
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">Puedes usar HTML simple: <code>&lt;strong&gt;texto&lt;/strong&gt;</code></p>
              <div className="space-y-2">
                {notices.map((n, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Select value={n.icon} onValueChange={(v) => {
                      const next = [...notices];
                      next[i] = { ...n, icon: v as TicketNoticeIcon };
                      setNotices(next);
                    }}>
                      <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NOTICE_ICON_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={n.text}
                      onChange={(e) => {
                        const next = [...notices];
                        next[i] = { ...n, text: e.target.value };
                        setNotices(next);
                      }}
                      rows={2}
                      className="flex-1 text-xs"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setNotices(notices.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={upsert.isPending}>
                {upsert.isPending ? "Guardando…" : (source ? "Guardar cambios" : "Crear diseño")}
              </Button>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider mb-2 block">Vista previa</Label>
            <TicketPreview
              eventName={(assignKind === "event" || assignKind === "session") && assignEventId
                ? (events.find((e) => e.id === assignEventId)?.name ?? "Evento de ejemplo")
                : "Evento de ejemplo"}
              sessionName="Sesión de ejemplo"
              headerBg={headerBg}
              headerColor={headerColor}
              notices={notices}
              footerNote={footerNote || DEFAULT_FOOTER_NOTE}
              instructions={instructions}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketPreview(props: {
  eventName: string; sessionName: string; headerBg: string; headerColor: string;
  notices: TicketNotice[]; footerNote: string; instructions: string;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-4 max-w-md mx-auto">
      <div className="overflow-hidden shadow-xl border-2 rounded-lg bg-card" style={{ borderColor: props.headerBg }}>
        <div className="px-6 py-6 text-center" style={{ background: props.headerBg, color: props.headerColor }}>
          <div className="text-xl font-black uppercase tracking-tight">{props.eventName}</div>
          <div className="mt-1 text-sm opacity-90">{props.sessionName}</div>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="text-xs text-muted-foreground">Asistente</div>
          <div className="font-semibold">Nombre Apellido</div>
          <div className="bg-white border rounded p-3 flex items-center justify-center text-xs text-muted-foreground" style={{ height: 180 }}>
            [Código QR]
          </div>
          <Separator />
          <div className="space-y-2 text-xs">
            {props.notices.filter((n) => n.text.trim()).map((n, i) => {
              const Icon = NOTICE_ICON_MAP[n.icon] ?? AlertCircle;
              return (
                <div key={i} className="flex items-start gap-2 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 mt-0.5 text-foreground shrink-0" />
                  <span dangerouslySetInnerHTML={{ __html: n.text }} />
                </div>
              );
            })}
            {props.instructions && (
              <div className="text-muted-foreground whitespace-pre-line bg-muted/50 p-3 rounded">{props.instructions}</div>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-center text-muted-foreground">{props.footerNote}</p>
    </div>
  );
}
