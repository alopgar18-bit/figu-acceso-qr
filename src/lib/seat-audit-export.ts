import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { APPROVED_LIKE, statusLabel, type ParticipantStatus } from "@/lib/participant-constants";
import { normalizarTelefonoES } from "@/lib/phone";

export type SeatAuditRow = {
  participantId: string;
  nombre: string;
  email: string;
  telefono: string;
  estado: ParticipantStatus;
  zona: string;
  fila: string;
  asiento: string;
  problema: "sin_butaca" | "telefono_no_valido" | "sin_email" | null;
};

const PROBLEM_LABELS: Record<NonNullable<SeatAuditRow["problema"]>, string> = {
  sin_butaca: "Sin butaca asignada",
  telefono_no_valido: "Teléfono no válido",
  sin_email: "Sin email",
};

type Row = {
  id: string;
  status: ParticipantStatus;
  seat_zone: string | null;
  seat_row: string | null;
  seat_number: string | null;
  people: { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
};

/** Revisa los aceptados de una sesión: butaca asignada, email y teléfono válidos. */
export async function auditSessionSeats(sessionId: string): Promise<SeatAuditRow[]> {
  const out: SeatAuditRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const { data, error } = await supabase
      .from("event_participants")
      .select("id, status, seat_zone, seat_row, seat_number, people(first_name,last_name,email,phone)")
      .eq("session_id", sessionId)
      .in("status", APPROVED_LIKE)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Row[];
    for (const r of rows) {
      const zona = (r.seat_zone ?? "").trim();
      const fila = (r.seat_row ?? "").trim();
      const asiento = (r.seat_number ?? "").trim();
      const email = (r.people?.email ?? "").trim();
      const telefono = (r.people?.phone ?? "").trim();
      let problema: SeatAuditRow["problema"] = null;
      if (!zona || !fila || !asiento) problema = "sin_butaca";
      else if (telefono && !normalizarTelefonoES(telefono)) problema = "telefono_no_valido";
      else if (!email && !telefono) problema = "sin_email";
      out.push({
        participantId: r.id,
        nombre: `${r.people?.first_name ?? ""} ${r.people?.last_name ?? ""}`.trim(),
        email,
        telefono,
        estado: r.status,
        zona,
        fila,
        asiento,
        problema,
      });
    }
    if (rows.length < pageSize) break;
  }
  return out;
}

export function exportSeatAuditExcel(rows: SeatAuditRow[], sessionName?: string): number {
  const problemas = rows.filter((r) => r.problema);
  const sheetRows = (problemas.length > 0 ? problemas : rows).map((r) => ({
    Nombre: r.nombre,
    Estado: statusLabel(r.estado),
    Zona: r.zona,
    Fila: r.fila,
    Butaca: r.asiento,
    Email: r.email,
    Teléfono: r.telefono,
    Aviso: r.problema ? PROBLEM_LABELS[r.problema] : "Correcto",
  }));
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws["!cols"] = [{ wch: 28 }, { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Revisión de butacas");
  const name = (sessionName ?? "sesion").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(wb, `revision-butacas-${name}-${Date.now()}.xlsx`);
  return sheetRows.length;
}
