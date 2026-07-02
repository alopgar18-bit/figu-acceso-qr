import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { APPROVED_LIKE } from "./participant-constants";

export function useAssignedSessions() {
  return useQuery({
    queryKey: ["access", "assigned-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("*, events(id, name, status, location_name)")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSessionDashboard(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["access", "dashboard", sessionId],
    enabled: !!sessionId,
    refetchInterval: 5000,
    queryFn: async () => {
      const [session, parts, checkins, incidents, last] = await Promise.all([
        supabase.from("event_sessions").select("id, name, capacity, starts_at, event_id, allow_companions").eq("id", sessionId!).single(),
        supabase.from("event_participants").select("id, status, companions_count").eq("session_id", sessionId!),
        supabase.from("checkins").select("id, participant_id, companions_validated, result, checked_in_at").eq("session_id", sessionId!),
        supabase.from("incidents").select("id, title, severity, status, created_at, category, walk_in_companions, participant_id").eq("session_id", sessionId!).order("created_at", { ascending: false }),
        supabase
          .from("checkins")
          .select("id, checked_in_at, result, participant_id, event_participants(people(first_name, last_name))")
          .eq("session_id", sessionId!)
          .order("checked_in_at", { ascending: false })
          .limit(10),
      ]);

      if (session.error) throw session.error;
      if (parts.error) throw parts.error;
      if (checkins.error) throw checkins.error;

      // "Confirmados" = participantes con plaza asegurada (mismo criterio que el informe).
      // Incluye aceptado_pendiente_envio, invitacion_enviada, pendiente_confirmacion, etc.
      const confirmadosParts = (parts.data ?? []).filter((p) =>
        (APPROVED_LIKE as readonly string[]).includes(p.status),
      );
      // Personas con plaza = titulares + acompañantes (lo que cuenta contra el aforo).
      const personasConPlaza = confirmadosParts.reduce(
        (sum, p) => sum + 1 + (p.companions_count ?? 0),
        0,
      );
      // "Pendientes" = solicitudes aún sin decisión (no aprobadas ni rechazadas).
      const pendientes = (parts.data ?? []).filter((p) =>
        ["solicitud_recibida", "pendiente_revision", "lista_espera"].includes(p.status),
      );
      const okCheckins = (checkins.data ?? []).filter((c) => c.result === "ok");
      const totalPersonsCheckedIn = okCheckins.reduce(
        (sum, c) => sum + 1 + (c.companions_validated ?? 0),
        0,
      );

      const allIncidents = incidents.data ?? [];
      // Entradas registradas vía incidencia (walk-in o resolución manual sin escaneo previo).
      // Se cuentan solo las incidencias de categoría "entrada" que NO están ya vinculadas a un check-in existente.
      const checkedInParticipantIds = new Set(
        okCheckins.map((c) => (c as { participant_id?: string | null }).participant_id).filter(Boolean) as string[],
      );
      const incidentEntries = allIncidents.filter(
        (i) => i.category === "entrada" && !(i.participant_id && checkedInParticipantIds.has(i.participant_id)),
      );
      const incidentPersons = incidentEntries.reduce(
        (sum, i) => sum + 1 + (i.walk_in_companions ?? 0),
        0,
      );
      const totalDentro = totalPersonsCheckedIn + incidentPersons;

      return {
        session: session.data,
        capacity: session.data?.capacity ?? 0,
        confirmados: personasConPlaza,
        pendientes: pendientes.length,
        checkins: okCheckins.length,
        totalPersonsCheckedIn: totalDentro,
        checkinsPersons: totalPersonsCheckedIn,
        incidentEntries: incidentEntries.length,
        incidentPersons,
        incidents: allIncidents.slice(0, 10),
        incidentsAll: allIncidents,
        lastCheckins: last.data ?? [],
        occupancyPct: session.data?.capacity ? Math.round((totalDentro / session.data.capacity) * 100) : 0,
      };
    },
  });
}

export function useSessionIncidents(sessionId?: string) {
  return useQuery({
    queryKey: ["access", "incidents", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("*, event_participants(id, people(first_name, last_name))")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAllIncidents() {
  return useQuery({
    queryKey: ["incidents", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("*, events(id, name), event_sessions(id, name, starts_at), event_participants(id, people(id, first_name, last_name, dni))")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}