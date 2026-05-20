import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ImportBatchRow = Database["public"]["Tables"]["import_batches"]["Row"];

export function useImportBatches() {
  return useQuery({
    queryKey: ["import_batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*, events(id, name), event_sessions(id, name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useImportBatch(batchId: string | undefined) {
  return useQuery({
    queryKey: ["import_batch", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*, events(id, name), event_sessions(id, name), import_mappings(*)")
        .eq("id", batchId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}