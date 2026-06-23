import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ParticipantStatus } from "./participant-constants";
import { APPROVED_LIKE } from "./participant-constants";
import { INCIDENT_TYPE_LABELS, INCIDENT_CATEGORY_LABELS, type IncidentType, type IncidentCategory } from "./incident-constants";

export type ReportScope = { eventId: string; sessionId?: string };

// "Confirmado" en el informe = tiene plaza asegurada (aprobado y aceptado).
// Incluye los estados intermedios del flujo de envío de QR porque en la práctica
// muchos asistentes nunca cambian de "aceptado_pendiente_envio" antes de la sesión.
const CONFIRMED_LIKE: ParticipantStatus[] = [
  "aceptado_pendiente_envio",
  "invitacion_enviada",
  "pendiente_confirmacion",
  "confirmado",
  "qr_generado",
  "acceso_validado",
];
const CANCELLED_LIKE: ParticipantStatus[] = ["cancelado_asistente", "cancelado_figurarte"];

// Supabase devuelve como máximo 1000 filas por petición. Paginamos para no
// truncar eventos grandes (participantes / check-ins / incidencias / comunicaciones).
const PAGE_SIZE = 1000;
async function fetchAllPaged<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // hard cap defensivo para evitar bucles infinitos
  for (let i = 0; i < 200; i++) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

export interface ReportData {
  event: { id: string; name: string; status: string; starts_at: string | null; ends_at: string | null; location_name: string | null; city: string | null };
  sessions: Array<{
    id: string;
    name: string;
    starts_at: string;
    capacity: number;
    stats: SessionStats;
  }>;
  totals: SessionStats & {
    capacidad: number;
    ocupacion: number;
    communicationsSent: number;
    communicationsErrors: number;
    incidents: number;
    lastCheckins: Array<{ at: string; name: string }>;
    activeValidators: number;
    duplicateAttempts: number;
  };
  participants: ParticipantExportRow[];
  incidentRows: IncidentExportRow[];
}

export interface SessionStats {
  solicitudes: number;
  pendientes: number;
  aprobados: number;
  rechazados: number;
  listaEspera: number;
  confirmados: number;
  cancelados: number;
  checkins: number;
  noPresentados: number;
  incidencias: number;
  personasConfirmadas: number;
  checkinsQr: number;
  checkinsManual: number;
  checkinsViaIncidencia: number;
  // Conteos en PERSONAS (titular + acompañantes) — usados en los KPI del
  // informe para que cuadre con el total real de invitados.
  personasSolicitudes: number;
  personasAprobados: number;
  personasRechazados: number;
  personasListaEspera: number;
  personasCancelados: number;
  personasNoPresentados: number;
}

export interface ParticipantExportRow {
  event_name: string;
  session_name: string;
  first_name: string;
  last_name: string;
  dni: string;
  email: string;
  phone: string;
  status: string;
  attendee_type: string;
  companions: number;
  confirmed: string;
  confirmed_at: string;
  qr_generated: string;
  checkin: string;
  checkin_at: string;
  validator: string;
  incidents: number;
  consent_privacy: string;
  consent_image: string;
  consent_future: string;
}

export interface IncidentExportRow {
  created_at: string;
  session_name: string;
  category: string;
  type: string;
  title: string;
  description: string;
  participant_name: string;
  walk_in_first_name: string;
  walk_in_last_name: string;
  walk_in_dni: string;
  walk_in_companions: number;
}

function emptyStats(): SessionStats {
  return {
    solicitudes: 0, pendientes: 0, aprobados: 0, rechazados: 0,
    listaEspera: 0, confirmados: 0, cancelados: 0, checkins: 0,
    noPresentados: 0, incidencias: 0, personasConfirmadas: 0,
    checkinsQr: 0, checkinsManual: 0, checkinsViaIncidencia: 0,
    personasSolicitudes: 0, personasAprobados: 0, personasRechazados: 0,
    personasListaEspera: 0, personasCancelados: 0, personasNoPresentados: 0,
  };
}

export function useEventReport(scope: ReportScope | null) {
  return useQuery({
    queryKey: ["report", scope?.eventId, scope?.sessionId ?? "all"],
    enabled: !!scope?.eventId,
    refetchInterval: 10_000,
    queryFn: async (): Promise<ReportData> => {
      const { eventId, sessionId } = scope!;
      type PartRow = {
        id: string;
        status: ParticipantStatus;
        attendee_type: string;
        companions_count: number | null;
        confirmed_at: string | null;
        session_id: string;
        person_id: string | null;
        people: { first_name?: string; last_name?: string; dni?: string; email?: string; phone?: string } | null;
        event_sessions: { name?: string } | null;
      };
      type CheckinRow = {
        id: string;
        participant_id: string;
        validator_id: string | null;
        checked_in_at: string;
        session_id: string;
        device_info: string | null;
        result: string | null;
      };
      type CommRow = { id: string; status: string; session_id: string | null };
      type IncidentRow = {
        id: string;
        participant_id: string | null;
        session_id: string | null;
        incident_type: string | null;
        category: "entrada" | "otra" | null;
        walk_in_companions: number | null;
        walk_in_first_name: string | null;
        walk_in_last_name: string | null;
        walk_in_dni: string | null;
        title: string | null;
        description: string | null;
        created_at: string;
      };
      type ConsentRow = { participant_id: string | null; consent_kind: string; accepted: boolean };

      const [evt, sessions, participants, checkins, comms, incidents, consents] = await Promise.all([
        supabase.from("events").select("id, name, status, starts_at, ends_at, location_name, city").eq("id", eventId).single(),
        supabase.from("event_sessions").select("id, name, starts_at, capacity").eq("event_id", eventId).order("starts_at"),
        fetchAllPaged<PartRow>((from, to) =>
          supabase.from("event_participants")
            .select("id, status, attendee_type, companions_count, confirmed_at, session_id, person_id, people(first_name, last_name, dni, email, phone), event_sessions(name)")
            .eq("event_id", eventId)
            .range(from, to) as unknown as PromiseLike<{ data: PartRow[] | null; error: { message: string } | null }>,
        ),
        fetchAllPaged<CheckinRow>((from, to) =>
          supabase.from("checkins")
            .select("id, participant_id, validator_id, checked_in_at, session_id, device_info, result")
            .eq("event_id", eventId)
            .order("checked_in_at", { ascending: false })
            .range(from, to) as unknown as PromiseLike<{ data: CheckinRow[] | null; error: { message: string } | null }>,
        ),
        fetchAllPaged<CommRow>((from, to) =>
          supabase
            .from("communication_logs")
            .select("id, status, session_id")
            .eq("event_id", eventId)
            .or("metadata->>wati_test.is.null,metadata->>wati_test.neq.true")
            .range(from, to) as unknown as PromiseLike<{ data: CommRow[] | null; error: { message: string } | null }>,
        ),
        fetchAllPaged<IncidentRow>((from, to) =>
          supabase.from("incidents").select("id, participant_id, session_id, incident_type, category, walk_in_companions, walk_in_first_name, walk_in_last_name, walk_in_dni, title, description, created_at").eq("event_id", eventId).order("created_at", { ascending: false }).range(from, to) as unknown as PromiseLike<{ data: IncidentRow[] | null; error: { message: string } | null }>,
        ),
        fetchAllPaged<ConsentRow>((from, to) =>
          supabase.from("consent_records").select("participant_id, consent_kind, accepted").range(from, to) as unknown as PromiseLike<{ data: ConsentRow[] | null; error: { message: string } | null }>,
        ),
      ]);

      if (evt.error) throw evt.error;

      const allSessions = (sessions.data ?? []).filter((s) => !sessionId || s.id === sessionId);
      const sessionIds = new Set(allSessions.map((s) => s.id));
      const parts = participants.filter((p) => !sessionId || sessionIds.has(p.session_id));
      const allCheckins = checkins
        .filter((c) => (c.result ?? "ok") === "ok")
        .filter((c) => !sessionId || sessionIds.has(c.session_id));
      const allComms = comms.filter((c) => !sessionId || !c.session_id || sessionIds.has(c.session_id));
      const allIncidents = incidents.filter((i) => !sessionId || !i.session_id || sessionIds.has(i.session_id));

      const checkinByParticipant = new Map<string, typeof allCheckins[number]>();
      for (const c of allCheckins) {
        if (!checkinByParticipant.has(c.participant_id)) checkinByParticipant.set(c.participant_id, c);
      }

      const incidentsByParticipant = new Map<string, number>();
      let duplicateAttempts = 0;
      for (const i of allIncidents) {
        if (i.participant_id) incidentsByParticipant.set(i.participant_id, (incidentsByParticipant.get(i.participant_id) ?? 0) + 1);
        if (i.incident_type === "qr_ya_usado") duplicateAttempts += 1;
      }

      const consentsByPerson = new Map<string, { privacy?: boolean; image?: boolean; future?: boolean }>();
      for (const c of consents) {
        if (!c.participant_id) continue;
        const cur = consentsByPerson.get(c.participant_id) ?? {};
        if (c.consent_kind === "privacidad") cur.privacy = c.accepted;
        else if (c.consent_kind === "imagen") cur.image = c.accepted;
        else if (c.consent_kind === "futuros_procesos") cur.future = c.accepted;
        consentsByPerson.set(c.participant_id, cur);
      }

      const statsBySession = new Map<string, SessionStats>();
      for (const s of allSessions) statsBySession.set(s.id, emptyStats());

      for (const p of parts) {
        const s = statsBySession.get(p.session_id);
        if (!s) continue;
        const personas = 1 + (p.companions_count ?? 0);
        s.solicitudes += 1;
        s.personasSolicitudes += personas;
        if (["solicitud_recibida", "pendiente_revision"].includes(p.status)) s.pendientes += 1;
        if (APPROVED_LIKE.includes(p.status)) { s.aprobados += 1; s.personasAprobados += personas; }
        if (p.status === "rechazado") { s.rechazados += 1; s.personasRechazados += personas; }
        if (p.status === "lista_espera") { s.listaEspera += 1; s.personasListaEspera += personas; }
        if (CONFIRMED_LIKE.includes(p.status)) {
          s.confirmados += 1;
          s.personasConfirmadas += personas;
        }
        if (CANCELLED_LIKE.includes(p.status)) { s.cancelados += 1; s.personasCancelados += personas; }
        if (p.status === "no_presentado") { s.noPresentados += 1; s.personasNoPresentados += personas; }
        s.incidencias += incidentsByParticipant.get(p.id) ?? 0;
      }

      // Real attendance from checkins table (source of truth): split QR vs manual
      const checkinParticipantIds = new Set<string>();
      for (const c of allCheckins) {
        const s = statsBySession.get(c.session_id);
        if (!s) continue;
        const isManual = (c.device_info ?? "") === "manual_override";
        if (isManual) s.checkinsManual += 1;
        else s.checkinsQr += 1;
        if (c.participant_id) checkinParticipantIds.add(c.participant_id);
      }
      // Walk-ins admitted only via incident (no associated check-in row)
      for (const i of allIncidents) {
        if (!i.session_id) continue;
        const s = statsBySession.get(i.session_id);
        if (!s) continue;
        // Solo cuentan las incidencias de categoría "entrada" como accesos.
        if (i.category && i.category !== "entrada") continue;
        if (!i.participant_id || !checkinParticipantIds.has(i.participant_id)) {
          s.checkinsViaIncidencia += 1 + (i.walk_in_companions ?? 0);
        }
      }
      for (const s of statsBySession.values()) {
        s.checkins = s.checkinsQr + s.checkinsManual + s.checkinsViaIncidencia;
      }

      const totals: ReportData["totals"] = {
        ...emptyStats(),
        capacidad: 0,
        ocupacion: 0,
        communicationsSent: allComms.filter((c) => c.status === "enviado").length,
        communicationsErrors: allComms.filter((c) => c.status === "fallido").length,
        incidents: allIncidents.length,
        lastCheckins: allCheckins.slice(0, 10).map((c) => {
          const part = parts.find((p) => p.id === c.participant_id);
          const name = part?.people ? `${part.people.first_name ?? ""} ${part.people.last_name ?? ""}`.trim() : "—";
          return { at: c.checked_in_at, name };
        }),
        activeValidators: new Set(allCheckins.map((c) => c.validator_id).filter(Boolean)).size,
        duplicateAttempts,
      };
      for (const s of allSessions) {
        const st = statsBySession.get(s.id)!;
        totals.solicitudes += st.solicitudes;
        totals.pendientes += st.pendientes;
        totals.aprobados += st.aprobados;
        totals.rechazados += st.rechazados;
        totals.listaEspera += st.listaEspera;
        totals.confirmados += st.confirmados;
        totals.cancelados += st.cancelados;
        totals.checkins += st.checkins;
        totals.noPresentados += st.noPresentados;
        totals.incidencias += st.incidencias;
        totals.personasConfirmadas += st.personasConfirmadas;
        totals.checkinsQr += st.checkinsQr;
        totals.checkinsManual += st.checkinsManual;
        totals.checkinsViaIncidencia += st.checkinsViaIncidencia;
        totals.capacidad += s.capacity ?? 0;
      }
      totals.ocupacion = totals.capacidad ? Math.round((totals.personasConfirmadas / totals.capacidad) * 100) : 0;

      const validatorById = new Map<string, string>();
      const validatorIds = Array.from(new Set(allCheckins.map((c) => c.validator_id).filter((v): v is string => !!v)));
      if (validatorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", validatorIds);
        for (const p of profs ?? []) {
          validatorById.set(p.id, p.full_name ?? p.email ?? "—");
        }
      }

      const exportRows: ParticipantExportRow[] = parts.map((p) => {
        const ci = checkinByParticipant.get(p.id);
        const cons = consentsByPerson.get(p.id) ?? {};
        const person = p.people as { first_name?: string; last_name?: string; dni?: string; email?: string; phone?: string } | null;
        return {
          event_name: evt.data.name,
          session_name: (p.event_sessions as { name?: string } | null)?.name ?? "",
          first_name: person?.first_name ?? "",
          last_name: person?.last_name ?? "",
          dni: person?.dni ?? "",
          email: person?.email ?? "",
          phone: person?.phone ?? "",
          status: p.status,
          attendee_type: p.attendee_type,
          companions: p.companions_count ?? 0,
          confirmed: CONFIRMED_LIKE.includes(p.status) ? "Sí" : "No",
          confirmed_at: p.confirmed_at ?? "",
          qr_generated: ["qr_generado", "acceso_validado"].includes(p.status) ? "Sí" : "No",
          checkin: ci ? "Sí" : "No",
          checkin_at: ci?.checked_in_at ?? "",
          validator: ci?.validator_id ? validatorById.get(ci.validator_id) ?? "" : "",
          incidents: incidentsByParticipant.get(p.id) ?? 0,
          consent_privacy: cons.privacy === true ? "Sí" : cons.privacy === false ? "No" : "—",
          consent_image: cons.image === true ? "Sí" : cons.image === false ? "No" : "—",
          consent_future: cons.future === true ? "Sí" : cons.future === false ? "No" : "—",
        };
      });

      return {
        event: evt.data,
        sessions: allSessions.map((s) => ({ ...s, stats: statsBySession.get(s.id)! })),
        totals,
        participants: exportRows,
        incidentRows: allIncidents.map((i) => {
          const part = i.participant_id ? parts.find((p) => p.id === i.participant_id) : null;
          const person = part?.people as { first_name?: string; last_name?: string } | null;
          const partName = person ? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() : "";
          const sess = i.session_id ? allSessions.find((s) => s.id === i.session_id) : null;
          const cat = (i.category ?? "entrada") as IncidentCategory;
          const t = (i.incident_type ?? "manual") as IncidentType;
          return {
            created_at: i.created_at,
            session_name: sess?.name ?? "",
            category: INCIDENT_CATEGORY_LABELS[cat] ?? cat,
            type: INCIDENT_TYPE_LABELS[t] ?? (i.incident_type ?? ""),
            title: i.title ?? "",
            description: i.description ?? "",
            participant_name: partName,
            walk_in_first_name: i.walk_in_first_name ?? "",
            walk_in_last_name: i.walk_in_last_name ?? "",
            walk_in_dni: i.walk_in_dni ?? "",
            walk_in_companions: i.walk_in_companions ?? 0,
          };
        }),
      };
    },
  });
}