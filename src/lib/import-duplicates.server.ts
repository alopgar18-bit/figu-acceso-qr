import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { DuplicateReportEntry } from "./import-duplicates";

/** Lecturas paginadas y estables, también para sesiones de miles de personas. */
export async function readImportRoster(supabase: SupabaseClient<Database>, sessionId: string): Promise<DuplicateReportEntry[]> {
  const result: DuplicateReportEntry[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("event_participants")
      .select("id, status, seat_zone, seat_row, seat_number, people:person_id(first_name, last_name, dni, email, phone)")
      .eq("session_id", sessionId).order("id").range(from, from + 999);
    if (error) throw new Error("No se pudo leer la sesión para el informe de duplicados.");
    for (const row of data ?? []) {
      const person = row.people;
      if (!person) continue;
      result.push({ ...person, seat_zone: row.seat_zone, seat_row: row.seat_row, seat_number: row.seat_number,
        participant_id: row.id, row_number: null, origin: "sesión", outcome: row.status, note: null });
    }
    if (!data || data.length < 1000) return result;
  }
}

export async function readImportAudit(supabase: SupabaseClient<Database>, batchId: string) {
  const rows: Database["public"]["Tables"]["import_row_results"]["Row"][] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("import_row_results").select("*")
      .eq("batch_id", batchId).order("id").range(from, from + 999);
    if (error) throw new Error("No se pudieron leer las filas para el informe de duplicados.");
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}