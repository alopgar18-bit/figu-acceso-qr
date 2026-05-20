import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
        supabase.from("checkins").select("id, companions_validated, result, checked_in_at").eq("session_id", sessionId!),
        supabase.from("incidents").select("id, title, severity, status, created_at").eq("session_id", sessionId!).order("created_at", { ascending: false }).limit(10),
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

      const confirmados = (parts.data ?? []).filter((p) =>
        ["confirmado", "qr_generado", "acceso_validado"].includes(p.status),
      );
      const pendientes = (parts.data ?? []).filter((p) =>
        ["aprobado", "invitacion_enviada", "pendiente_confirmacion"].includes(p.status),
      );
      const okCheckins = (checkins.data ?? []).filter((c) => c.result === "ok");
      const totalPersonsCheckedIn = okCheckins.reduce(
        (sum, c) => sum + 1 + (c.companions_validated ?? 0),
        0,
      );

      return {
        session: session.data,
        capacity: session.data?.capacity ?? 0,
        confirmados: confirmados.length,
        pendientes: pendientes.length,
        checkins: okCheckins.length,
        totalPersonsCheckedIn,
        incidents: incidents.data ?? [],
        lastCheckins: last.data ?? [],
        occupancyPct: session.data?.capacity ? Math.round((totalPersonsCheckedIn / session.data.capacity) * 100) : 0,
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
        .select("*, events(name), event_sessions(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}