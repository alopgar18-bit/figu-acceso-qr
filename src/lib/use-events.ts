import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type EventRow = Database["public"]["Tables"]["events"]["Row"];
export type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
export type EventUpdate = Database["public"]["Tables"]["events"]["Update"];
export type SessionRow = Database["public"]["Tables"]["event_sessions"]["Row"];
export type SessionInsert = Database["public"]["Tables"]["event_sessions"]["Insert"];
export type SessionUpdate = Database["public"]["Tables"]["event_sessions"]["Update"];

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ["event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const isUuid = !!eventId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId);
      const { data, error } = await supabase
        .from("events")
        .select("*, clients(id, name)")
        .eq(isUuid ? "id" : "slug", eventId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useClientsList() {
  return useQuery({
    queryKey: ["clients", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEventSessions(eventId: string | undefined) {
  return useQuery({
    queryKey: ["sessions", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("*")
        .eq("event_id", eventId!)
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("*")
        .eq("id", sessionId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useSessionStats(eventId: string | undefined) {
  return useQuery({
    queryKey: ["session-stats", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_participants")
        .select("session_id, status")
        .eq("event_id", eventId!);
      if (error) throw error;
      const map = new Map<string, { solicitudes: number; aprobados: number; confirmados: number; checkins: number }>();
      for (const p of data ?? []) {
        const k = p.session_id;
        const s = map.get(k) ?? { solicitudes: 0, aprobados: 0, confirmados: 0, checkins: 0 };
        s.solicitudes += 1;
        if (["aprobado", "invitacion_enviada", "pendiente_confirmacion", "confirmado", "qr_generado", "acceso_validado"].includes(p.status)) s.aprobados += 1;
        if (["confirmado", "qr_generado", "acceso_validado"].includes(p.status)) s.confirmados += 1;
        if (p.status === "acceso_validado") s.checkins += 1;
        map.set(k, s);
      }
      return map;
    },
  });
}

export function useUpsertEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: EventInsert | EventUpdate }) => {
      if (id) {
        const { data, error } = await supabase.from("events").update(values).eq("id", id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("events").insert(values as EventInsert).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event", data.id] });
    },
  });
}

export function useUpsertSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: SessionInsert | SessionUpdate }) => {
      if (id) {
        const { data, error } = await supabase.from("event_sessions").update(values).eq("id", id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from("event_sessions").insert(values as SessionInsert).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sessions", data.event_id] });
      qc.invalidateQueries({ queryKey: ["session", data.id] });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}