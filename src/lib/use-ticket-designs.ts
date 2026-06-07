import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { TicketDesign } from "./ticket-design";

export type TicketDesignRow = Database["public"]["Tables"]["ticket_designs"]["Row"];

export interface TicketDesignInput {
  id?: string;
  name: string;
  design: TicketDesign;
  is_global_default?: boolean;
  scope_event_id?: string | null;
  scope_session_id?: string | null;
}

export function useTicketDesigns() {
  return useQuery({
    queryKey: ["ticket_designs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_designs")
        .select("*")
        .order("is_global_default", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TicketDesignRow[];
    },
  });
}

export function useUpsertTicketDesign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TicketDesignInput) => {
      const payload = {
        name: input.name,
        design: input.design as unknown as Database["public"]["Tables"]["ticket_designs"]["Insert"]["design"],
        is_global_default: input.is_global_default ?? false,
        scope_event_id: input.scope_event_id ?? null,
        scope_session_id: input.scope_session_id ?? null,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("ticket_designs")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("ticket_designs")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket_designs"] }),
  });
}

export function useDuplicateTicketDesign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: TicketDesignRow) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("ticket_designs")
        .insert({
          name: `Copia de ${source.name}`,
          design: source.design,
          is_global_default: false,
          scope_event_id: null,
          scope_session_id: null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket_designs"] }),
  });
}

export function useDeleteTicketDesign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_designs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket_designs"] }),
  });
}