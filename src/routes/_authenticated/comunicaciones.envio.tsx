import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Send, QrCode, AlertCircle, CheckCircle2, Mail, Search as SearchIcon, Filter, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { generateMissingTickets } from "@/lib/tickets.functions";
import { queueBulkInvitations } from "@/lib/bulk-send.functions";
import { useTemplates, useUpsertTemplate } from "@/lib/use-communications";
import { renderTemplate, type RenderContext, SENDER_OPTIONS, DEFAULT_SENDER, COMM_CHANNEL_OPTIONS, type CommChannel } from "@/lib/communication-constants";
import { useEvents, useEventSessions } from "@/lib/use-events";
import { PARTICIPANT_STATUS_OPTIONS, ATTENDEE_TYPE_OPTIONS, statusLabel } from "@/lib/participant-constants";

const searchSchema = z.object({
  batch_id: z.string().uuid().optional(),
  event_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  selection_key: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/comunicaciones/envio")({
  validateSearch: (s) => searchSchema.parse(s),
  component: BulkSendPage,
});

interface PartRow {
  id: string;
  status: string;
  person_id: string;
  event_id?: string;
  session_id?: string;
  attendee_type?: string | null;
  created_at?: string | null;
  people:
    | {
        first_name: string;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        source?: string | null;
        dni?: string | null;
        city?: string | null;
        province?: string | null;
        gender?: string | null;
        birth_date?: string | null;
        is_blocked?: boolean | null;
      }
    | null;
}

function BulkSendPage() {
  const search = useSearch({ from: Route.id });
  const [eventId, setEventId] = useState<string | undefined>(search.event_id);
  const [sessionId, setSessionId] = useState<string | undefined>(search.session_id);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [senderValue, setSenderValue] = useState<string>(DEFAULT_SENDER.value);
  const [channel, setChannel] = useState<CommChannel>("email");
  const [sendPerCompanion, setSendPerCompanion] = useState<boolean>(true);
  const [includeCompanionsInTitular, setIncludeCompanionsInTitular] = useState<boolean>(true);
  const batchId = search.batch_id;
  const { data: events = [] } = useEvents();
  const { data: sessions = [] } = useEventSessions(eventId);

  // Participant IDs from a selection passed via sessionStorage (avoids huge URLs).
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (!search.selection_key) {
      setSelectedIds(null);
      return;
    }
    try {
      const raw = sessionStorage.getItem(search.selection_key);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) setSelectedIds(parsed);
      }
    } catch {
      // ignore
    }
  }, [search.selection_key]);

  // If a batch_id is provided, derive event/session from the batch.
  const batchInfo = useQuery({
    queryKey: ["batch_info", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("import_batches")
        .select("id, filename, event_id, session_id, events(name), event_sessions(name)")
        .eq("id", batchId!)
        .single();
      return data;
    },
  });

  useEffect(() => {
    if (batchInfo.data) {
      setEventId((cur) => cur ?? batchInfo.data!.event_id ?? undefined);
      setSessionId((cur) => cur ?? batchInfo.data!.session_id ?? undefined);
    }
  }, [batchInfo.data]);

  const handleEventChange = (value: string) => {
    setEventId(value);
    setSessionId(undefined);
  };

  // Participants for the selected session (and optionally batch via people.source)
  const participantsQ = useQuery({
    queryKey: ["bulk_participants", eventId, sessionId, batchId, batchInfo.data?.filename, selectedIds?.join(",") ?? null],
    enabled: (!!eventId && !!sessionId) || (!!selectedIds && selectedIds.length > 0),
    queryFn: async () => {
      let q = supabase
        .from("event_participants")
        .select("id, status, person_id, event_id, session_id, attendee_type, created_at, people(first_name,last_name,email,phone,source,dni,city,province,gender,birth_date,is_blocked)")
        .limit(5000);
      if (selectedIds && selectedIds.length > 0) {
        q = q.in("id", selectedIds);
      } else {
        q = q.eq("event_id", eventId!).eq("session_id", sessionId!);
      }
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as unknown as PartRow[];
      if (batchId && batchInfo.data?.filename) {
        const tag = `import:${batchInfo.data.filename}`;
        rows = rows.filter((r) => r.people?.source === tag);
      }
      // If event/session weren't set, derive from the first row.
      if (rows.length > 0) {
        const first = rows[0] as PartRow & { event_id?: string; session_id?: string };
        if (!eventId && first.event_id) setEventId(first.event_id);
        if (!sessionId && first.session_id) setSessionId(first.session_id);
      }
      return rows;
    },
  });

  const participants = (participantsQ.data ?? []) as PartRow[];

  // ---- Filtros sobre los participantes cargados (en cliente) ----
  const [flt, setFlt] = useState({
    search: "",
    status: "all" as string,
    type: "all" as string,
    city: "",
    province: "",
    gender: "all" as string,
    minAge: "",
    maxAge: "",
    fromDate: "",
    toDate: "",
    email: "all" as "all" | "yes" | "no",
    phone: "all" as "all" | "yes" | "no",
    qr: "all" as "all" | "yes" | "no",
    blocked: false,
  });
  const resetFilters = () =>
    setFlt({
      search: "", status: "all", type: "all", city: "", province: "", gender: "all",
      minAge: "", maxAge: "", fromDate: "", toDate: "",
      email: "all", phone: "all", qr: "all", blocked: false,
    });

  // IDs de los cargados (sin filtrar) para precargar tickets y logs.
  const loadedIds = participants.map((p) => p.id);

  // Tickets per participant
  const ticketsQ = useQuery({
    queryKey: ["bulk_tickets", loadedIds],
    enabled: loadedIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("participant_id, qr_token")
        .in("participant_id", loadedIds)
        .eq("revoked", false);
      return new Set((data ?? []).map((t) => t.participant_id));
    },
  });

  // Existing logs per participant for the selected template
  const sentQ = useQuery({
    queryKey: ["bulk_sent", loadedIds, templateId],
    enabled: loadedIds.length > 0 && !!templateId,
    queryFn: async () => {
      const { data } = await supabase
        .from("communication_logs")
        .select("participant_id, status")
        .eq("template_id", templateId!)
        .in("participant_id", loadedIds);
      return data ?? [];
    },
  });

  const ticketSet = ticketsQ.data ?? new Set<string>();

  const stats = useMemo(() => {
    let withEmail = 0;
    let withoutEmail = 0;
    let withTicket = 0;
    let withoutTicket = 0;
    for (const p of participants) {
      if (p.people?.email) withEmail++;
      else withoutEmail++;
      if (ticketSet.has(p.id)) withTicket++;
      else withoutTicket++;
    }
    const alreadyQueued = (sentQ.data ?? []).filter((r) => r.status === "pendiente" || r.status === "programado").length;
    const alreadySent = (sentQ.data ?? []).filter((r) => r.status === "enviado").length;
    return {
      total: participants.length,
      withEmail,
      withoutEmail,
      withTicket,
      withoutTicket,
      alreadyQueued,
      alreadySent,
    };
  }, [participants, ticketSet, sentQ.data]);

  const { data: templates = [] } = useTemplates();
  const channelTemplates = templates.filter((t) => t.channel === channel && t.is_active);
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const isWhatsapp = channel === "whatsapp_business" || channel === "whatsapp_asistido";
  const availableChannels = COMM_CHANNEL_OPTIONS.filter(
    (c) => c.value === "email" || c.value === "whatsapp_business" || c.value === "whatsapp_asistido",
  );

  // Reset selected template when channel changes if it doesn't belong to the channel.
  useEffect(() => {
    if (templateId && !channelTemplates.some((t) => t.id === templateId)) {
      setTemplateId(undefined);
    }
  }, [channel, templateId, channelTemplates]);

  // Server fn handles
  const genTickets = useServerFn(generateMissingTickets);
  const queueFn = useServerFn(queueBulkInvitations);
  const upsertTemplate = useUpsertTemplate();

  const handleGenerateMissingQr = async () => {
    if (!eventId || !sessionId) return;
    try {
      const missing = participants.filter((p) => !ticketSet.has(p.id)).map((p) => p.id);
      // En modo qr_propio también queremos generar tickets de acompañantes,
      // así que enviamos TODOS los participantes (la función ignora los que ya tienen ticket).
      const targetIds = participants.map((p) => p.id);
      if (targetIds.length === 0) {
        toast.info("No hay participantes en esta selección");
        return;
      }
      const res = await genTickets({
        data: { event_id: eventId, session_id: sessionId, participant_ids: targetIds },
      });
      const parts: string[] = [];
      parts.push(`${res.generated_titulars} titular(es)`);
      if (res.mode === "qr_propio") {
        parts.push(`${res.generated_companions} acompañante(s)`);
      }
      const skippedTotal = res.skipped_titulars + res.skipped_companions;
      const modeNote =
        res.mode === "mismo_qr"
          ? " · Sesión en modo 'un QR para el grupo': no se generan QR por acompañante."
          : "";
      if (res.generated === 0 && skippedTotal > 0) {
        toast.info(`Todos los QR ya existían (${skippedTotal}).${modeNote}`);
      } else {
        toast.success(`Generados ${parts.join(" + ")} (${skippedTotal} ya existían).${modeNote}`);
      }
      ticketsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCreateSuggestedTemplate = async () => {
    try {
      await upsertTemplate.mutateAsync({
        name: "Invitación público — El Perro Andaluz",
        channel: "email",
        subject: "Tu invitación para {{evento}}",
        body: `Hola {{nombre}},

Desde FIGURARTE te confirmamos tu invitación para asistir como público a "{{evento}}".

Sesión: {{sesion}}
Fecha: {{fecha}}
Hora de acceso: {{hora_acceso}}
Ubicación: {{ubicacion}}

Puedes acceder a tu entrada individual aquí:
{{enlace_entrada}}

Recuerda:
- Es imprescindible presentar esta invitación/QR para acceder.
- Acude con puntualidad.
- Lleva DNI o documento identificativo si lo tienes disponible.
- Atiende en todo momento las indicaciones del equipo de FIGURARTE.

Gracias,
FIGURARTE Casting & Producción`,
        is_active: true,
      });
      toast.success("Plantilla creada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleQueue = async () => {
    if (!eventId || !sessionId || !templateId) return;
    try {
      const res = await queueFn({
        data: {
          event_id: eventId,
          session_id: sessionId,
          batch_id: batchId,
          template_id: templateId,
          participant_ids: participants.map((p) => p.id),
          only_with_email: !isWhatsapp,
          only_with_ticket: true,
          skip_already_queued: true,
          send_per_companion: !isWhatsapp && sendPerCompanion,
          include_companions_in_titular: includeCompanionsInTitular,
          from: isWhatsapp ? undefined : senderValue,
        },
      });
      const compMsg = res.queued_companions
        ? ` + ${res.queued_companions} acompañante(s)`
        : "";
      toast.success(
        `Cola creada: ${res.queued} titular(es)${compMsg}. ${res.skipped_no_email} sin email · ${res.skipped_no_ticket} sin QR · ${res.skipped_already} ya en cola.`,
      );
      sentQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Preview render with first valid recipient
  const previewSample = useMemo(() => {
    if (!selectedTemplate) return null;
    const sample = isWhatsapp
      ? (participants.find((p) => p.people?.phone) ?? participants[0])
      : (participants.find((p) => p.people?.email) ?? participants[0]);
    if (!sample) return null;
    const ctx: RenderContext = {
      nombre: sample.people?.first_name ?? "",
      apellidos: sample.people?.last_name ?? "",
      evento: "(nombre del evento)",
      sesion: "(nombre de la sesión)",
      fecha: "(fecha)",
      hora_acceso: "(hora)",
      ubicacion: "(ubicación)",
      enlace_entrada: "https://…/c/<token>/entrada",
    };
    return {
      to: isWhatsapp
        ? (sample.people?.phone ?? "(sin teléfono)")
        : (sample.people?.email ?? "(sin email)"),
      subject: selectedTemplate.subject ? renderTemplate(selectedTemplate.subject, ctx) : "(sin asunto)",
      body: renderTemplate(selectedTemplate.body, ctx),
    };
  }, [selectedTemplate, participants, isWhatsapp]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comunicaciones"
        title="Envío masivo de invitaciones"
        description={
          batchInfo.data?.filename
            ? `Importación: ${batchInfo.data.filename}`
            : selectedIds && selectedIds.length > 0
              ? `${selectedIds.length} destinatarios seleccionados desde Solicitudes`
              : "Selecciona evento, sesión y plantilla."
        }
        actions={
          <Button variant="outline" asChild>
            <Link to="/comunicaciones"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Link>
          </Button>
        }
      />

      {/* Step 1 — Recipients summary */}
      <Card>
        <CardHeader>
          <CardTitle>1 · Destinatarios</CardTitle>
          <CardDescription>
            {eventId && sessionId
              ? "Resumen de los participantes que cumplen los filtros actuales."
              : "Falta seleccionar evento/sesión. Si vienes desde una importación, esto se rellena automáticamente."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!eventId || !sessionId ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Selecciona contexto</AlertTitle>
                <AlertDescription>
                  Elige manualmente el evento y la sesión para preparar los destinatarios.
                </AlertDescription>
              </Alert>
              <div className="grid gap-3 md:grid-cols-2">
                <Select value={eventId} onValueChange={handleEventChange}>
                  <SelectTrigger><SelectValue placeholder="Selecciona evento" /></SelectTrigger>
                  <SelectContent>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sessionId} onValueChange={setSessionId} disabled={!eventId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona sesión" /></SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>{session.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Stat label="Total" value={stats.total} />
              <Stat label="Con email" value={stats.withEmail} tone="ok" />
              <Stat label="Sin email" value={stats.withoutEmail} tone="warn" />
              <Stat label="Con QR" value={stats.withTicket} tone="ok" />
              <Stat label="Sin QR" value={stats.withoutTicket} tone="warn" />
              <Stat label="Ya en cola" value={stats.alreadyQueued} />
              <Stat label="Ya enviados" value={stats.alreadySent} tone="ok" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Generate missing QR */}
      {eventId && sessionId && (
        <Card>
          <CardHeader>
            <CardTitle>2 · QR faltantes</CardTitle>
            <CardDescription>
              Genera tickets/QR individuales para los participantes que aún no tienen uno. No requiere DNI, email ni teléfono.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Badge variant={stats.withoutTicket === 0 ? "secondary" : "destructive"}>
              {stats.withoutTicket} sin QR
            </Badge>
            <Button onClick={handleGenerateMissingQr} disabled={stats.withoutTicket === 0}>
              <QrCode className="h-4 w-4 mr-2" />Generar QR faltantes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Template */}
      {eventId && sessionId && (
        <Card>
          <CardHeader>
            <CardTitle>3 · Canal y plantilla</CardTitle>
            <CardDescription>Elige canal, remitente (si email) y plantilla. El envío real se procesa desde la cola.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Canal</label>
              <Select value={channel} onValueChange={(v) => setChannel(v as CommChannel)}>
                <SelectTrigger className="w-96"><SelectValue placeholder="Selecciona canal" /></SelectTrigger>
                <SelectContent>
                  {availableChannels.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isWhatsapp && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Remitente</label>
                <Select value={senderValue} onValueChange={setSenderValue}>
                  <SelectTrigger className="w-96"><SelectValue placeholder="Selecciona remitente" /></SelectTrigger>
                  <SelectContent>
                    {SENDER_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger className="w-96"><SelectValue placeholder="Selecciona plantilla" /></SelectTrigger>
                <SelectContent>
                  {channelTemplates.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No hay plantillas activas para este canal.</div>
                  )}
                  {channelTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {channel === "email" && (
                <Button variant="outline" onClick={handleCreateSuggestedTemplate}>
                  Crear plantilla sugerida
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Preview */}
      {selectedTemplate && previewSample && (
        <Card>
          <CardHeader>
            <CardTitle>4 · Previsualización</CardTitle>
            <CardDescription>
              {isWhatsapp ? (
                <>Se encolarán mensajes de WhatsApp para los destinatarios con teléfono.</>
              ) : (
                <>Se enviarán <strong>{stats.withEmail}</strong> emails. Se omitirán <strong>{stats.withoutEmail}</strong> sin email.</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">{isWhatsapp ? "Teléfono:" : "Para:"}</span> {previewSample.to}</div>
            {!isWhatsapp && (
              <div><span className="text-muted-foreground">Asunto:</span> <strong>{previewSample.subject}</strong></div>
            )}
            <Separator className="my-2" />
            <pre className="whitespace-pre-wrap font-sans bg-muted/40 p-3 rounded text-xs">{previewSample.body}</pre>
          </CardContent>
        </Card>
      )}

      {/* Step 5 — Queue */}
      {selectedTemplate && (
        <Card>
          <CardHeader>
            <CardTitle>5 · Crear cola de envío</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertTitle>{isWhatsapp ? "Envío mediante Wassenger" : "Envío mediante Resend"}</AlertTitle>
              <AlertDescription>
                {isWhatsapp ? (
                  <>Se creará la cola con cada mensaje renderizado en estado "pendiente". Pulsa "Enviar WhatsApps pendientes" en la cola para procesar el envío.</>
                ) : (
                  <>Se creará la cola con cada email renderizado en estado "pendiente". Remitente: <strong>{senderValue}</strong>. Pulsa "Enviar emails pendientes" en la cola para procesar el envío.</>
                )}
              </AlertDescription>
            </Alert>
            {!isWhatsapp && (
              <label className="flex items-start gap-2 text-sm border rounded p-3 bg-muted/20 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={includeCompanionsInTitular}
                  onChange={(e) => setIncludeCompanionsInTitular(e.target.checked)}
                />
                <span>
                  <strong>Incluir acompañantes (nombre + QR) en el email del titular</strong>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Añade al final del email del titular un bloque con el nombre y el QR de cada acompañante. Solo se añade si la plantilla no incluye ya las variables {"{{acompanantes_html}}"} o {"{{acompanantes}}"}.
                  </span>
                </span>
              </label>
            )}
            {!isWhatsapp && (
              <label className="flex items-start gap-2 text-sm border rounded p-3 bg-muted/20 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={sendPerCompanion}
                  onChange={(e) => setSendPerCompanion(e.target.checked)}
                />
                <span>
                  <strong>Enviar también un correo individual por cada acompañante</strong>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Se manda al email del titular un correo extra por cada acompañante con su nombre, asiento y QR/enlace individual. Requiere que el acompañante tenga su QR generado (modo "QR individual por acompañante" en la sesión).
                  </span>
                </span>
              </label>
            )}
            <div className="flex gap-2">
              <Button onClick={handleQueue} disabled={isWhatsapp ? stats.total === 0 : stats.withEmail === 0}>
                <Send className="h-4 w-4 mr-2" />Crear cola ({isWhatsapp ? stats.total : stats.withEmail} destinatarios)
              </Button>
              <Button variant="outline" asChild>
                <Link to="/comunicaciones/cola"><CheckCircle2 className="h-4 w-4 mr-2" />Ver cola</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
