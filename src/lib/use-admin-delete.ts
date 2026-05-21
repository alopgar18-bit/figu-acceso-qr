import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function ensureOk<T>(payload: { data: T | null; error: { message: string } | null }): T {
  if (payload.error) throw new Error(payload.error.message);
  return payload.data as T;
}

export function useDeleteParticipants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (participantIds: string[]) => {
      const res = await supabase.rpc("admin_delete_participants", {
        _participant_ids: participantIds,
      });
      return ensureOk(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["communication_logs"] });
    },
  });
}

export function useDeleteImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { batchId: string; deleteParticipants: boolean }) => {
      const res = await supabase.rpc("admin_delete_import_batch", {
        _batch_id: input.batchId,
        _delete_participants: input.deleteParticipants,
      });
      return ensureOk(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["import_batches"] });
      qc.invalidateQueries({ queryKey: ["participants"] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["communication_logs"] });
    },
  });
}

export function useDeleteTickets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticketIds: string[]) => {
      const res = await supabase.rpc("admin_delete_tickets", { _ticket_ids: ticketIds });
      return ensureOk(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["participants"] });
    },
  });
}

export function useArchiveCommunicationLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (logIds: string[]) => {
      const res = await supabase.rpc("admin_archive_communication_logs", { _log_ids: logIds });
      return ensureOk(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communication_logs"] }),
  });
}

export function useDeleteCommunicationLogs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (logIds: string[]) => {
      const res = await supabase.rpc("admin_delete_communication_logs", { _log_ids: logIds });
      return ensureOk(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communication_logs"] }),
  });
}