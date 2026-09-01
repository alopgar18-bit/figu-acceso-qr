import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export type ReleasedSeatRow = {
  released_at: string;
  seat_zone: string | null;
  seat_row: string | null;
  seat_number: string | null;
  holder_name: string | null;
  is_companion: boolean;
  released_reason: string | null;
  participant_id: string | null;
  session_id: string | null;
};

const REASON_LABELS: Record<string, string> = {
  cancelado_asistente: "Cancelado por el asistente",
  cancelado_figurarte: "Cancelado por FIGURARTE",
  rechazado: "Rechazado",
};

/** Butacas liberadas por cancelación/rechazo, listas para reasignar. */
export async function fetchReleasedSeats(opts: { eventId: string; sessionId?: string }): Promise<ReleasedSeatRow[]> {
  let query = supabase
    .from("released_seats")
    .select("released_at, seat_zone, seat_row, seat_number, holder_name, is_companion, released_reason, participant_id, session_id")
    .eq("event_id", opts.eventId)
    .order("released_at", { ascending: false })
    .limit(5000);
  if (opts.sessionId) query = query.eq("session_id", opts.sessionId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ReleasedSeatRow[];
}

export async function exportReleasedSeatsExcel(opts: {
  eventId: string;
  sessionId?: string;
  eventName?: string;
}): Promise<number> {
  const rows = await fetchReleasedSeats(opts);
  if (rows.length === 0) return 0;

  // Una butaca puede haberse liberado varias veces: nos quedamos con la más reciente.
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    const key = `${r.session_id ?? ""}|${r.seat_zone ?? ""}|${r.seat_row ?? ""}|${r.seat_number ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sheetRows = unique.map((r) => ({
    Zona: r.seat_zone ?? "",
    Fila: r.seat_row ?? "",
    Butaca: r.seat_number ?? "",
    "Butaca completa": [r.seat_zone, r.seat_row, r.seat_number].filter(Boolean).join("-"),
    "Liberada por": r.holder_name ?? "",
    Tipo: r.is_companion ? "Acompañante" : "Titular",
    Motivo: REASON_LABELS[r.released_reason ?? ""] ?? (r.released_reason ?? ""),
    "Fecha de liberación": new Date(r.released_at).toLocaleString("es-ES"),
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = [{ wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Butacas liberadas");
  const name = (opts.eventName ?? "evento").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(wb, `butacas-liberadas-${name}-${Date.now()}.xlsx`);
  return sheetRows.length;
}
