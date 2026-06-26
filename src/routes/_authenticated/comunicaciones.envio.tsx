import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Send, QrCode, AlertCircle, CheckCircle2, Mail, Search as SearchIcon, Filter, X, FlaskConical } from "lucide-react";
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
import { renderTemplate, type RenderContext, SENDER_OPTIONS, DEFAULT_SENDER, COMM_CHANNEL_OPTIONS, type CommChannel, buildEntryUrl } from "@/lib/communication-constants";
import { useEvents, useEventSessions } from "@/lib/use-events";
import { PARTICIPANT_STATUS_OPTIONS, ATTENDEE_TYPE_OPTIONS, statusLabel } from "@/lib/participant-constants";
import { WatiTestSendDialog } from "@/components/wati-test-send-dialog";
import { useAuth } from "@/hooks/use-auth";

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
  confirmation_token?: string | null;
  seat_zone?: string | null;
  seat_row?: string | null;
  seat_number?: string | null;
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
  const { isAdmin } = useAuth();
  const [watiTestOpen, setWatiTestOpen] = useState(false);
  const [eventId, setEventId] = useState<string | undefined>(search.event_id);
  const [sessionId, setSessionId] = useState<string | undefined>(search.session_id);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [senderValue, setSenderValue] = useState<string>(DEFAULT_SENDER.value);
  const [channel, setChannel] = useState<CommChannel>("email");
  const [sendPerCompanion, setSendPerCompanion] = useState<boolean>(true);
  const [includeCompanionsInTitular, setIncludeCompanionsInTitular] = useState<boolean>(true);
  const [allowWithoutTicket, setAllowWithoutTicket] = useState<boolean>(false);
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
    enabled: (!!eventId && !!sessionId) || (!!selectedIds && selectedIds.length > 0) || !!batchId,
    queryFn: async () => {
      // Paginate to handle sessions / batches > 1000 rows (PostgREST default cap).
      const pageSize = 1000;
      const all: PartRow[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = supabase
          .from("event_participants")
          .select("id, status, person_id, event_id, session_id, attendee_type, created_at, confirmation_token, seat_zone, seat_row, seat_number, import_batch_id, people(first_name,last_name,email,phone,source,dni,city,province,gender,birth_date,is_blocked)")
          .range(from, from + pageSize - 1);
        if (selectedIds && selectedIds.length > 0) {
          q = q.in("id", selectedIds);
        } else if (batchId) {
          // Filter directly by the import batch — robust against people.source tag mismatches.
          q = q.eq("import_batch_id", batchId);
        } else {
          q = q.eq("event_id", eventId!).eq("session_id", sessionId!);
        }
        const { data, error } = await q;
        if (error) throw error;
        const chunk = (data ?? []) as unknown as PartRow[];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
        if (from > 50000) break; // safety cap
      }
      const rows = all;
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

  // Sample participant used for the preview; fetch its event + session directly
  // so the preview always has real data, regardless of dropdown state.
  const previewSampleRow = useMemo(() => {
    if (participants.length === 0) return null;
    const wa = participants.find((p) => p.people?.phone);
    const em = participants.find((p) => p.people?.email);
    return (channel === "whatsapp_business" || channel === "whatsapp_asistido")
      ? (wa ?? participants[0])
      : (em ?? participants[0]);
  }, [participants, channel]);

  const previewEventSession = useQuery({
    queryKey: [
      "preview_evt_ses",
      previewSampleRow?.event_id ?? null,
      previewSampleRow?.session_id ?? null,
    ],
    enabled: !!previewSampleRow?.event_id && !!previewSampleRow?.session_id,
    queryFn: async () => {
      const [evRes, sesRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, name, location_name, location_address")
          .eq("id", previewSampleRow!.event_id!)
          .maybeSingle(),
        supabase
          .from("event_sessions")
          .select("id, name, starts_at, ends_at, doors_open_at, location_name, location_address")
          .eq("id", previewSampleRow!.session_id!)
          .maybeSingle(),
      ]);
      return { ev: evRes.data, ses: sesRes.data };
    },
  });

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

  // Aplicar filtros en cliente sobre los participantes cargados.
  const filteredParticipants = useMemo(() => {
    const today = Date.now();
    const minAge = flt.minAge ? Number(flt.minAge) : null;
    const maxAge = flt.maxAge ? Number(flt.maxAge) : null;
    const from = flt.fromDate ? new Date(flt.fromDate).getTime() : null;
    const to = flt.toDate ? new Date(flt.toDate + "T23:59:59").getTime() : null;
    const s = flt.search.trim().toLowerCase();
    return participants.filter((p) => {
      const person = p.people;
      if (flt.status !== "all" && p.status !== flt.status) return false;
      if (flt.type !== "all" && (p.attendee_type ?? "") !== flt.type) return false;
      if (flt.gender !== "all" && (person?.gender ?? "") !== flt.gender) return false;
      if (flt.city && (person?.city ?? "").toLowerCase() !== flt.city.toLowerCase()) return false;
      if (flt.province && (person?.province ?? "").toLowerCase() !== flt.province.toLowerCase()) return false;
      if (flt.email === "yes" && !person?.email) return false;
      if (flt.email === "no" && person?.email) return false;
      if (flt.phone === "yes" && !person?.phone) return false;
      if (flt.phone === "no" && person?.phone) return false;
      if (flt.qr === "yes" && !ticketSet.has(p.id)) return false;
      if (flt.qr === "no" && ticketSet.has(p.id)) return false;
      if (flt.blocked && !person?.is_blocked) return false;
      if (minAge != null || maxAge != null) {
        if (!person?.birth_date) return false;
        const age = Math.floor((today - new Date(person.birth_date).getTime()) / (365.25 * 86400000));
        if (minAge != null && age < minAge) return false;
        if (maxAge != null && age > maxAge) return false;
      }
      if (from != null && p.created_at && new Date(p.created_at).getTime() < from) return false;
      if (to != null && p.created_at && new Date(p.created_at).getTime() > to) return false;
      if (s) {
        const hay = [person?.first_name, person?.last_name, person?.email, person?.phone, person?.dni]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());
        if (!hay.some((v) => v.includes(s))) return false;
      }
      return true;
    });
  }, [participants, flt, ticketSet]);

  // IDs excluidos manualmente desde la tabla.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const toggleExcluded = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allFilteredExcluded =
    filteredParticipants.length > 0 && filteredParticipants.every((p) => excluded.has(p.id));
  const toggleAllFiltered = () => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (allFilteredExcluded) {
        for (const p of filteredParticipants) next.delete(p.id);
      } else {
        for (const p of filteredParticipants) next.add(p.id);
      }
      return next;
    });
  };

  // Lista efectiva = filtrados − excluidos. Esto es lo que usan generar QR / cola.
  const effectiveParticipants = useMemo(
    () => filteredParticipants.filter((p) => !excluded.has(p.id)),
    [filteredParticipants, excluded],
  );
  const effectiveIds = effectiveParticipants.map((p) => p.id);

  const stats = useMemo(() => {
    let withEmail = 0;
    let withoutEmail = 0;
    let withTicket = 0;
    let withoutTicket = 0;
    for (const p of effectiveParticipants) {
      if (p.people?.email) withEmail++;
      else withoutEmail++;
      if (ticketSet.has(p.id)) withTicket++;
      else withoutTicket++;
    }
    const effIdSet = new Set(effectiveParticipants.map((p) => p.id));
    const alreadyQueued = (sentQ.data ?? []).filter(
      (r) => r.participant_id != null && effIdSet.has(r.participant_id) && (r.status === "pendiente" || r.status === "programado"),
    ).length;
    const alreadySent = (sentQ.data ?? []).filter(
      (r) => r.participant_id != null && effIdSet.has(r.participant_id) && r.status === "enviado",
    ).length;
    return {
      total: effectiveParticipants.length,
      withEmail,
      withoutEmail,
      withTicket,
      withoutTicket,
      alreadyQueued,
      alreadySent,
    };
  }, [effectiveParticipants, ticketSet, sentQ.data]);

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
      // En modo qr_propio también queremos generar tickets de acompañantes,
      // así que enviamos TODOS los participantes efectivos (filtrados y no excluidos);
      // la función ignora los que ya tienen ticket.
      const targetIds = effectiveIds;
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
Hora de inicio: {{hora_inicio}}
Hora fin aprox.: {{hora_fin}}
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
      const CHUNK = 2000;
      const ids = effectiveIds ?? [];
      const chunks: string[][] = [];
      if (ids.length === 0) chunks.push([]);
      else for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
      let queued = 0, queuedComp = 0, noEmail = 0, noTicket = 0, already = 0;
      for (const part of chunks) {
        const res = await queueFn({
          data: {
            event_id: eventId,
            session_id: sessionId,
            batch_id: batchId,
            template_id: templateId,
            participant_ids: part.length > 0 ? part : undefined,
            only_with_email: !isWhatsapp,
            only_with_ticket: true,
            skip_already_queued: true,
            send_per_companion: sendPerCompanion,
            include_companions_in_titular: includeCompanionsInTitular,
            from: isWhatsapp ? undefined : senderValue,
          },
        });
        queued += res.queued ?? 0;
        queuedComp += res.queued_companions ?? 0;
        noEmail += res.skipped_no_email ?? 0;
        noTicket += res.skipped_no_ticket ?? 0;
        already += res.skipped_already ?? 0;
      }
      const compMsg = queuedComp ? ` + ${queuedComp} acompañante(s)` : "";
      toast.success(
        `Cola creada: ${queued} titular(es)${compMsg}. ${noEmail} sin email · ${noTicket} sin QR · ${already} ya en cola.`,
      );
      sentQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Preview render with first valid recipient
  const previewSample = useMemo(() => {
    if (!selectedTemplate) return null;
    const sample =
      previewSampleRow ??
      (isWhatsapp
        ? (effectiveParticipants.find((p) => p.people?.phone) ?? effectiveParticipants[0])
        : (effectiveParticipants.find((p) => p.people?.email) ?? effectiveParticipants[0]));
    if (!sample) return null;
    const ev =
      (previewEventSession.data?.ev as
        | { name?: string; location_name?: string | null; location_address?: string | null }
        | undefined) ??
      (events.find((e) => e.id === (sample.event_id ?? eventId)) as
        | { name?: string; location_name?: string | null; location_address?: string | null }
        | undefined);
    const ses =
      (previewEventSession.data?.ses as
        | {
            name?: string;
            starts_at?: string | null;
            ends_at?: string | null;
            doors_open_at?: string | null;
            location_name?: string | null;
            location_address?: string | null;
          }
        | undefined) ??
      (sessions.find((s) => s.id === (sample.session_id ?? sessionId)) as
        | {
            name?: string;
            starts_at?: string | null;
            ends_at?: string | null;
            doors_open_at?: string | null;
            location_name?: string | null;
            location_address?: string | null;
          }
        | undefined);
    const TZ = "Europe/Madrid";
    const fmtDate = (iso?: string | null) =>
      iso ? new Date(iso).toLocaleDateString("es-ES", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
    const fmtTime = (iso?: string | null) =>
      iso ? new Date(iso).toLocaleTimeString("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }) : "";
    const horaInicio = fmtTime(ses?.starts_at);
    const horaAcceso = ses?.doors_open_at ? fmtTime(ses.doors_open_at) : horaInicio;
    const horaFin = fmtTime(ses?.ends_at);
    const locName = (ses?.location_name ?? ev?.location_name ?? "").toString().trim();
    const locAddr = (ses?.location_address ?? ev?.location_address ?? "").toString().trim();
    const lugar = [locName, locAddr].filter(Boolean).join(", ");
    const enlace = buildEntryUrl(sample.confirmation_token ?? null) || "https://…/c/<token>/entrada";
    const ctx = {
      nombre: sample.people?.first_name ?? "",
      apellidos: sample.people?.last_name ?? "",
      evento: ev?.name ?? "(nombre del evento)",
      programa: ev?.name ?? "(programa)",
      sesion: ses?.name ?? "(nombre de la sesión)",
      fecha: fmtDate(ses?.starts_at) || "(fecha)",
      hora_acceso: horaAcceso || "(hora)",
      hora_inicio: horaInicio || "(hora inicio)",
      hora_fin: horaFin || "(hora fin)",
      ubicacion: lugar || "(ubicación)",
      lugar: lugar || "(lugar)",
      zona: sample.seat_zone ?? "",
      fila: sample.seat_row ?? "",
      asiento: sample.seat_number ?? "",
      enlace_entrada: enlace,
      enlace_confirmacion: enlace,
    } as unknown as RenderContext;
    return {
      to: isWhatsapp
        ? (sample.people?.phone ?? "(sin teléfono)")
        : (sample.people?.email ?? "(sin email)"),
      subject: selectedTemplate.subject ? renderTemplate(selectedTemplate.subject, ctx) : "(sin asunto)",
      body: renderTemplate(selectedTemplate.body, ctx),
    };
  }, [
    selectedTemplate,
    effectiveParticipants,
    isWhatsapp,
    events,
    sessions,
    eventId,
    sessionId,
    previewSampleRow,
    previewEventSession.data,
  ]);

  return (
    <>
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
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setWatiTestOpen(true)}>
                <FlaskConical className="h-4 w-4 mr-2" />Prueba Wati (1 número)
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/comunicaciones"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Link>
            </Button>
          </div>
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
          {participants.length === 0 && (!eventId || !sessionId) ? (
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat label="Total" value={stats.total} />
                <Stat label="Con email" value={stats.withEmail} tone="ok" />
                <Stat label="Sin email" value={stats.withoutEmail} tone="warn" />
                <Stat label="Con QR" value={stats.withTicket} tone="ok" />
                <Stat label="Sin QR" value={stats.withoutTicket} tone="warn" />
                <Stat label="Ya en cola" value={stats.alreadyQueued} />
                <Stat label="Ya enviados" value={stats.alreadySent} tone="ok" />
              </div>

              {/* Filtros */}
              <div className="rounded border p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Filter className="h-3 w-3" /> Filtros
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    <X className="h-3 w-3 mr-1" />Limpiar filtros
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <Label className="text-xs uppercase tracking-wider">Buscar</Label>
                    <div className="relative">
                      <SearchIcon className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={flt.search}
                        onChange={(e) => setFlt((f) => ({ ...f, search: e.target.value }))}
                        placeholder="Nombre, email, DNI, teléfono…"
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Estado</Label>
                    <Select value={flt.status} onValueChange={(v) => setFlt((f) => ({ ...f, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {PARTICIPANT_STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Tipo</Label>
                    <Select value={flt.type} onValueChange={(v) => setFlt((f) => ({ ...f, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {ATTENDEE_TYPE_OPTIONS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-6">
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Email</Label>
                    <Select value={flt.email} onValueChange={(v) => setFlt((f) => ({ ...f, email: v as "all" | "yes" | "no" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="yes">Con email</SelectItem>
                        <SelectItem value="no">Sin email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Teléfono</Label>
                    <Select value={flt.phone} onValueChange={(v) => setFlt((f) => ({ ...f, phone: v as "all" | "yes" | "no" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="yes">Con teléfono</SelectItem>
                        <SelectItem value="no">Sin teléfono</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">QR</Label>
                    <Select value={flt.qr} onValueChange={(v) => setFlt((f) => ({ ...f, qr: v as "all" | "yes" | "no" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="yes">Con QR</SelectItem>
                        <SelectItem value="no">Sin QR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Género</Label>
                    <Select value={flt.gender} onValueChange={(v) => setFlt((f) => ({ ...f, gender: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="F">Femenino</SelectItem>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="X">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Edad min</Label>
                    <Input type="number" value={flt.minAge} onChange={(e) => setFlt((f) => ({ ...f, minAge: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Edad max</Label>
                    <Input type="number" value={flt.maxAge} onChange={(e) => setFlt((f) => ({ ...f, maxAge: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Ciudad</Label>
                    <Input value={flt.city} onChange={(e) => setFlt((f) => ({ ...f, city: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Provincia</Label>
                    <Input value={flt.province} onChange={(e) => setFlt((f) => ({ ...f, province: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Desde</Label>
                    <Input type="date" value={flt.fromDate} onChange={(e) => setFlt((f) => ({ ...f, fromDate: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider">Hasta</Label>
                    <Input type="date" value={flt.toDate} onChange={(e) => setFlt((f) => ({ ...f, toDate: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={flt.blocked} onCheckedChange={(c) => setFlt((f) => ({ ...f, blocked: !!c }))} />
                    <span>Solo bloqueados</span>
                  </label>
                  <div className="ml-auto text-xs text-muted-foreground">
                    {filteredParticipants.length} de {participants.length} cargados · {excluded.size > 0 ? `${excluded.size} excluidos · ` : ""}
                    <strong>{effectiveParticipants.length}</strong> destinatarios efectivos
                  </div>
                </div>
              </div>

              {/* Tabla de destinatarios */}
              <div className="rounded border overflow-hidden">
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={!allFilteredExcluded && filteredParticipants.length > 0}
                            onCheckedChange={toggleAllFiltered}
                          />
                        </TableHead>
                        <TableHead>Persona</TableHead>
                        <TableHead>Contacto</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>QR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredParticipants.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                            Ningún participante con estos filtros.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredParticipants.slice(0, 500).map((p) => {
                          const checked = !excluded.has(p.id);
                          return (
                            <TableRow key={p.id} data-state={checked ? undefined : "selected"}>
                              <TableCell>
                                <Checkbox checked={checked} onCheckedChange={() => toggleExcluded(p.id)} />
                              </TableCell>
                              <TableCell className="text-sm">
                                <div className="font-medium">
                                  {p.people ? `${p.people.first_name} ${p.people.last_name ?? ""}`.trim() : "—"}
                                </div>
                                <div className="text-xs text-muted-foreground">{p.people?.dni ?? ""}</div>
                              </TableCell>
                              <TableCell className="text-xs">
                                <div>{p.people?.email ?? <span className="text-muted-foreground">sin email</span>}</div>
                                <div className="text-muted-foreground">{p.people?.phone ?? ""}</div>
                              </TableCell>
                              <TableCell className="text-xs">{statusLabel(p.status as never)}</TableCell>
                              <TableCell>
                                {ticketSet.has(p.id) ? (
                                  <Badge variant="secondary" className="text-[10px]">Con QR</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px]">Sin QR</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredParticipants.length > 500 && (
                  <div className="text-xs text-muted-foreground px-3 py-2 border-t bg-muted/40">
                    Mostrando los primeros 500 de {filteredParticipants.length}. Los filtros y acciones se aplican a todos.
                  </div>
                )}
              </div>
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
            <label className="flex items-start gap-2 text-sm border rounded p-3 bg-muted/20 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={includeCompanionsInTitular}
                  onChange={(e) => setIncludeCompanionsInTitular(e.target.checked)}
                />
                <span>
                  <strong>
                    Incluir acompañantes (nombre + QR/enlace) en el {isWhatsapp ? "WhatsApp" : "email"} del titular
                  </strong>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Añade al final del mensaje del titular un bloque con el nombre y el enlace/QR de cada acompañante. Solo se añade si la plantilla no incluye ya las variables {"{{acompanantes_html}}"} o {"{{acompanantes}}"}.
                  </span>
                </span>
            </label>
            <label className="flex items-start gap-2 text-sm border rounded p-3 bg-muted/20 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={sendPerCompanion}
                  onChange={(e) => setSendPerCompanion(e.target.checked)}
                />
                <span>
                  <strong>
                    Enviar también un {isWhatsapp ? "WhatsApp" : "correo"} individual por cada acompañante
                  </strong>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    {isWhatsapp
                      ? "Se envía un WhatsApp adicional por cada acompañante con su nombre, asiento y enlace/QR individual. Si el acompañante no tiene teléfono propio, se usa el del titular como fallback. Requiere que el acompañante tenga su QR generado (modo 'QR individual por acompañante' en la sesión)."
                      : "Se manda al email del titular un correo extra por cada acompañante con su nombre, asiento y QR/enlace individual. Si el acompañante no tiene email propio, se usa el del titular. Requiere que el acompañante tenga su QR generado (modo 'QR individual por acompañante' en la sesión)."}
                  </span>
                </span>
            </label>
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
    <WatiTestSendDialog open={watiTestOpen} onOpenChange={setWatiTestOpen} eventId={eventId} sessionId={sessionId} />
    </>
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
