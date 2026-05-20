import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePublicEvent(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-event", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data: event, error } = await supabase
        .from("events")
        .select("*")
        .eq("slug", slug!)
        .eq("status", "publicado")
        .maybeSingle();
      if (error) throw error;
      if (!event) return null;
      const { data: sessions } = await supabase
        .from("event_sessions")
        .select("*")
        .eq("event_id", event.id)
        .order("starts_at", { ascending: true });
      return { event, sessions: sessions ?? [] };
    },
  });
}

export function useActiveLegalText(kind: "privacidad" | "imagen" | "futuros_procesos") {
  return useQuery({
    queryKey: ["legal-text", kind],
    queryFn: async () => {
      const { data } = await supabase
        .from("legal_texts")
        .select("*")
        .eq("kind", kind)
        .eq("is_active", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
}