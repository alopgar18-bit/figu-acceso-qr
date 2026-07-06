import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

export type JobKind =
  | "send_whatsapp"
  | "send_email"
  | "import_batch"
  | "export_report"
  | "bulk_assign";

export type JobStatus = "queued" | "running" | "done" | "failed" | "paused" | "cancelled";

export interface JobRow {
  id: string;
  kind: string;
  payload: Json;
  status: string;
  progress: Json;
  result: Json | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  attempts: number;
  max_attempts: number;
}

const createSchema = z.object({
  kind: z.enum([
    "send_whatsapp",
    "send_email",
    "import_batch",
    "export_report",
    "bulk_assign",
  ]),
  payload: z.any().default({}),
});

/** Encola un job de fondo con el usuario actual como autor. */
export const enqueueBackgroundJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("background_jobs")
      .insert({ kind: data.kind, payload: data.payload as Json, created_by: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as JobRow;
  });

/** Devuelve un job por id (RLS: propio o admin). */
export const getBackgroundJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("background_jobs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as unknown as JobRow) ?? null;
  });

/** Cancela un job propio o cualquiera si eres admin. */
export const cancelBackgroundJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("background_jobs")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .in("status", ["queued", "paused"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });