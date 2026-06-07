import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CommChannel, CommStatus } from "./communication-constants";

export type TemplateRow = Database["public"]["Tables"]["communication_templates"]["Row"];
export type LogRow = Database["public"]["Tables"]["communication_logs"]["Row"];

export interface TemplateInput {
  id?: string;
  name: string;
  channel: CommChannel;
  subject?: string | null;
  body: string;
  variables?: string[];
  is_active?: boolean;
}

export function useTemplates() {
  return useQuery({
    queryKey: ["communication_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_templates")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as TemplateRow[];
    },
  });
}

export function useUpsertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TemplateInput) => {
      const payload = {
        name: input.name,
        channel: input.channel,
        subject: input.subject ?? null,
        body: input.body,
        variables: (input.variables ?? []) as unknown as Database["public"]["Tables"]["communication_templates"]["Insert"]["variables"],
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("communication_templates")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("communication_templates")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communication_templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("communication_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communication_templates"] }),
  });
}

export function useDuplicateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (source: TemplateRow) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("communication_templates")
        .insert({
          name: `Copia de ${source.name}`,
          channel: source.channel,
          subject: source.subject,
          body: source.body,
          variables: source.variables,
          is_active: source.is_active,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communication_templates"] }),
  });
}

export interface LogFilters {
  status?: CommStatus;
  channel?: CommChannel;
  eventId?: string;
  includeArchived?: boolean;
}

export function useCommunicationLogs(filters: LogFilters = {}) {
  return useQuery({
    queryKey: ["communication_logs", filters],
    queryFn: async () => {
      let q = supabase
        .from("communication_logs")
        .select("*, communication_templates(name), events(name), people(first_name,last_name,email,phone)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.channel) q = q.eq("channel", filters.channel);
      if (filters.eventId) q = q.eq("event_id", filters.eventId);
      if (!filters.includeArchived) q = q.is("archived_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return data as (LogRow & {
        communication_templates: { name: string } | null;
        events: { name: string } | null;
        people: { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
      })[];
    },
  });
}

export interface CreateLogInput {
  channel: CommChannel;
  status?: CommStatus;
  to_address?: string | null;
  subject?: string | null;
  body: string;
  template_id?: string | null;
  participant_id?: string | null;
  person_id?: string | null;
  event_id?: string | null;
  session_id?: string | null;
  metadata?: Record<string, unknown>;
  sent_at?: string | null;
}

export function useCreateLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateLogInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("communication_logs")
        .insert({
          channel: input.channel,
          status: input.status ?? "pendiente",
          to_address: input.to_address ?? null,
          subject: input.subject ?? null,
          body: input.body,
          template_id: input.template_id ?? null,
          participant_id: input.participant_id ?? null,
          person_id: input.person_id ?? null,
          event_id: input.event_id ?? null,
          session_id: input.session_id ?? null,
          metadata: (input.metadata ?? {}) as unknown as Database["public"]["Tables"]["communication_logs"]["Insert"]["metadata"],
          sent_at: input.sent_at ?? null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      // Audit
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        action: "communication.create",
        entity_type: "communication_log",
        entity_id: data.id,
        event_id: input.event_id ?? null,
        session_id: input.session_id ?? null,
        changes: { channel: input.channel, status: input.status ?? "pendiente" } as unknown as Database["public"]["Tables"]["audit_logs"]["Insert"]["changes"],
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communication_logs"] }),
  });
}

export function useUpdateLogStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, error_message }: { id: string; status: CommStatus; error_message?: string | null }) => {
      const payload: Database["public"]["Tables"]["communication_logs"]["Update"] = {
        status,
        error_message: error_message ?? null,
        sent_at: status === "enviado" ? new Date().toISOString() : null,
      };
      const { data, error } = await supabase
        .from("communication_logs")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communication_logs"] }),
  });
}