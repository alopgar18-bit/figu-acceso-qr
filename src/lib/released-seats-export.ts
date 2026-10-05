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

  // Ocupación actual: quién tiene hoy cada butaca (titulares y acompañantes activos).
  const CANCELLED = new Set(["cancelado_asistente", "cancelado_figurarte", "rechazado"]);
  const seatKey = (s: string | null, z: string | null, f: string | null, n: string | null) =>
    `${s ?? ""}|${(z ?? "").trim().toLowerCase()}|${(f ?? "").trim().toLowerCase()}|${(n ?? "").trim().toLowerCase()}`;
  const occupied = new Map<string, string>();
  const sessionIds = [...new Set(unique.map((r) => r.session_id).filter(Boolean))] as string[];
  for (const sid of sessionIds) {
    const parts: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("event_participants")
        .select("id, status, seat_zone, seat_row, seat_number, people(first_name, last_name)")
        .eq("session_id", sid)
        .not("seat_number", "is", null)
        .range(from, from + 999);
      if (error) throw error;
      parts.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const active = parts.filter((p) => !CANCELLED.has(p.status));
    const sessionByPart = new Map(active.map((p) => [p.id, sid]));
    for (const p of active) {
      const name = [p.people?.first_name, p.people?.last_name].filter(Boolean).join(" ");
      occupied.set(seatKey(sid, p.seat_zone, p.seat_row, p.seat_number), name);
    }
    const ids = active.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from("companions")
        .select("participant_id, first_name, last_name, seat_zone, seat_row, seat_number")
        .in("participant_id", ids.slice(i, i + 200))
        .not("seat_number", "is", null);
      if (error) throw error;
      for (const c of data ?? []) {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ") + " (acompañante)";
        occupied.set(seatKey(sessionByPart.get(c.participant_id) ?? sid, c.seat_zone, c.seat_row, c.seat_number), name);
      }
    }
  }

  const sheetRows = unique.map((r) => {
    const now = occupied.get(seatKey(r.session_id, r.seat_zone, r.seat_row, r.seat_number));
    return {
      Estado: now !== undefined ? "Reasignada" : "Disponible",
      "Ocupada ahora por": now ?? "",
      Zona: r.seat_zone ?? "",
      Fila: r.seat_row ?? "",
      Butaca: r.seat_number ?? "",
      "Butaca completa": [r.seat_zone, r.seat_row, r.seat_number].filter(Boolean).join("-"),
      "Liberada por": r.holder_name ?? "",
      Tipo: r.is_companion ? "Acompañante" : "Titular",
      Motivo: REASON_LABELS[r.released_reason ?? ""] ?? (r.released_reason ?? ""),
      "Fecha de liberación": new Date(r.released_at).toLocaleString("es-ES"),
    };
  });
  sheetRows.sort((a, b) => (a.Estado === b.Estado ? 0 : a.Estado === "Disponible" ? -1 : 1));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 24 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Butacas liberadas");
  const name = (opts.eventName ?? "evento").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(wb, `butacas-liberadas-${name}-${Date.now()}.xlsx`);
  return sheetRows.length;
}
