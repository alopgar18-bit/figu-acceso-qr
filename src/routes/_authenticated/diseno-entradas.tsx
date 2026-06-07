import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useEvents } from "@/lib/use-events";
import {
  DEFAULT_FOOTER_NOTE,
  DEFAULT_TICKET_NOTICES,
  NOTICE_ICON_MAP,
  NOTICE_ICON_OPTIONS,
  parseTicketDesign,
  type TicketDesign,
  type TicketNotice,
  type TicketNoticeIcon,
} from "@/lib/ticket-design";

export const Route = createFileRoute("/_authenticated/diseno-entradas")({
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const { data: events = [], isLoading } = useEvents();
  const [eventId, setEventId] = useState<string>("");

  useEffect(() => {
    if (!eventId && events.length > 0) setEventId(events[0].id);
  }, [events, eventId]);

  const event = events.find((e) => e.id === eventId);
  const initial = useMemo<TicketDesign>(
    () => parseTicketDesign(event?.ticket_design),
    [event?.id, event?.ticket_design],
  );

  const [headerBg, setHeaderBg] = useState<string>("");
  const [headerColor, setHeaderColor] = useState<string>("");
  const [footerNote, setFooterNote] = useState<string>("");
  const [instructions, setInstructions] = useState<string>("");
  const [notices, setNotices] = useState<TicketNotice[]>([]);

  useEffect(() => {
    setHeaderBg(initial.header_bg ?? event?.brand_color ?? "#111111");
    setHeaderColor(initial.header_text_color ?? "#ffffff");
    setFooterNote(initial.footer_note ?? DEFAULT_FOOTER_NOTE);
    setInstructions(initial.instructions_override ?? "");
    setNotices(initial.notices.length > 0 ? initial.notices : DEFAULT_TICKET_NOTICES);
  }, [initial, event?.brand_color]);

  const save = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error("Sin evento");
      const payload: TicketDesign = {
        header_bg: headerBg || null,
        header_text_color: headerColor || null,
        footer_note: footerNote || null,
        instructions_override: instructions || null,
        notices: notices.filter((n) => n.text.trim()),
      };
      const { error } = await supabase
        .from("events")
        .update({ ticket_design: payload as unknown as never })
        .eq("id", event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Diseño de entrada guardado");
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetDefaults = () => {
    setHeaderBg(event?.brand_color ?? "#111111");
    setHeaderColor("#ffffff");
    setFooterNote(DEFAULT_FOOTER_NOTE);
    setInstructions("");
    setNotices(DEFAULT_TICKET_NOTICES);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administración"
        title="Diseño de entradas"
        description="Personaliza textos, avisos y colores de la entrada QR que ven los asistentes."
      />

      <Card>
        <CardContent className="p-4">
          <Label className="text-xs uppercase tracking-wider">Evento</Label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="mt-2 max-w-md"><SelectValue placeholder="Selecciona un evento" /></SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading && <Card><CardContent className="p-6 text-sm text-muted-foreground">Cargando…</CardContent></Card>}

      {event && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Editor */}
          <Card>
            <CardContent className="p-5 space-y-5">
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
                <Label>Instrucciones específicas para la entrada</Label>
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={3}
                  placeholder={`Por defecto se mostrarán las instrucciones del evento (${event.general_instructions ? "definidas" : "no definidas"}).`}
                />
                <p className="text-xs text-muted-foreground mt-1">Déjalo vacío para usar las instrucciones generales del evento o de la sesión.</p>
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
                  {notices.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin avisos. La entrada no mostrará ninguno.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>
                  {save.isPending ? "Guardando…" : "Guardar diseño"}
                </Button>
                <Button variant="outline" onClick={resetDefaults}>Restablecer valores por defecto</Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <div>
            <Label className="text-xs uppercase tracking-wider mb-2 block">Vista previa</Label>
            <TicketPreview
              eventName={event.name}
              sessionName="Sesión de ejemplo"
              headerBg={headerBg}
              headerColor={headerColor}
              notices={notices}
              footerNote={footerNote || DEFAULT_FOOTER_NOTE}
              instructions={instructions || event.general_instructions || ""}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TicketPreview(props: {
  eventName: string;
  sessionName: string;
  headerBg: string;
  headerColor: string;
  notices: TicketNotice[];
  footerNote: string;
  instructions: string;
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
