import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type VisibilityPermissions = {
  see_email?: boolean;
  see_phone?: boolean;
  see_dni?: boolean;
  see_companions?: boolean;
  see_checkin_status?: boolean;
  see_personal_notes?: boolean;
  export_data?: boolean;
  see_names?: boolean;
  see_incidents?: boolean;
  see_realtime_dashboard?: boolean;
  export_pdf?: boolean;
};

const DEFAULT_PERMS: VisibilityPermissions = {
  see_email: false,
  see_phone: false,
  see_dni: false,
  see_companions: true,
  see_checkin_status: true,
  see_personal_notes: false,
  export_data: false,
  see_names: true,
  see_incidents: false,
  see_realtime_dashboard: false,
  export_pdf: false,
};

export function useClientContext() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["client-portal", "context", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: cu, error } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      const row = cu?.[0];
      if (!row) return null;
      // Fetch client cleanly
      const { data: client } = await supabase
        .from("clients")
        .select("id, name, visibility_permissions")
        .eq("id", row.client_id)
        .single();
      const perms: VisibilityPermissions = {
        ...DEFAULT_PERMS,
        ...((client?.visibility_permissions as Record<string, boolean>) ?? {}),
      };
      return { clientId: row.client_id, clientName: client?.name ?? "—", perms };
    },
  });
}

export function useClientEvents(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-portal", "events", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: assigns, error } = await supabase
        .from("event_assignments")
        .select("event_id, events(id, name, status, event_type, starts_at, ends_at, city, location_name, cover_image_url)")
        .eq("client_id", clientId!)
        .eq("role", "cliente_productora");
      if (error) throw error;
      const unique = new Map<string, NonNullable<(typeof assigns)[number]["events"]>>();
      for (const a of assigns ?? []) if (a.events) unique.set(a.events.id, a.events);
      return Array.from(unique.values()).sort((a, b) =>
        (b.starts_at ?? "").localeCompare(a.starts_at ?? ""),
      );
    },
  });
}

export function useClientEventDetail(eventId: string | undefined) {
  return useQuery({
    queryKey: ["client-portal", "event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const [evt, sessions, parts] = await Promise.all([
        supabase.from("events").select("*").eq("id", eventId!).single(),
        supabase.from("event_sessions").select("*").eq("event_id", eventId!).order("starts_at"),
        supabase
          .from("event_participants")
          .select("id, session_id, status, companions_count")
          .eq("event_id", eventId!),
      ]);
      if (evt.error) throw evt.error;
      const statsBySession = new Map<string, {
        solicitudes: number; aprobados: number; confirmados: number; checkins: number; personasConf: number;
      }>();
      for (const p of parts.data ?? []) {
        const s = statsBySession.get(p.session_id) ?? {
          solicitudes: 0, aprobados: 0, confirmados: 0, checkins: 0, personasConf: 0,
        };
        s.solicitudes += 1;
        if (["aprobado","invitacion_enviada","pendiente_confirmacion","confirmado","qr_generado","acceso_validado"].includes(p.status)) s.aprobados += 1;
        if (["confirmado","qr_generado","acceso_validado"].includes(p.status)) {
          s.confirmados += 1;
          s.personasConf += 1 + (p.companions_count ?? 0);
        }
        if (p.status === "acceso_validado") s.checkins += 1;
        statsBySession.set(p.session_id, s);
      }
      const totals = {
        sesiones: sessions.data?.length ?? 0,
        capacidad: (sessions.data ?? []).reduce((a, s) => a + (s.capacity ?? 0), 0),
        solicitudes: (parts.data ?? []).length,
        confirmados: Array.from(statsBySession.values()).reduce((a, s) => a + s.confirmados, 0),
        checkins: Array.from(statsBySession.values()).reduce((a, s) => a + s.checkins, 0),
      };
      return { event: evt.data, sessions: sessions.data ?? [], statsBySession, totals };
    },
  });
}

export function useClientIncidents(eventId?: string) {
  return useQuery({
    queryKey: ["client-portal", "incidents", eventId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("incidents")
        .select("id, title, description, severity, status, incident_type, created_at, event_id, session_id, events(name), event_sessions(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (eventId) q = q.eq("event_id", eventId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}