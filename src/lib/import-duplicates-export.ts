import { utils, writeFile } from "xlsx";
import type { ImportDuplicateReport } from "./import-duplicates";

export function exportImportDuplicateReport(report: ImportDuplicateReport, filename: string) {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.json_to_sheet([
    { Concepto: "Grupos de posibles duplicados", Total: report.groups },
    { Concepto: "Filas del archivo para revisar", Total: report.possibleDuplicateRows },
    { Concepto: "DNI compartidos conservados en el informe", Total: report.dniWarnings.length },
  ]), "Resumen");
  const toRow = (r: ImportDuplicateReport["dniWarnings"][number]) => ({
    Fila: r.row_number ?? "", Origen: r.origin === "archivo" ? "Archivo importado" : "Ya en la sesión",
    Nombre: r.first_name, Apellidos: r.last_name ?? "", DNI: r.dni ?? "", Email: r.email ?? "",
    Teléfono: r.phone ?? "", Zona: r.seat_zone ?? "", Fila_butaca: r.seat_row ?? "", Butaca: r.seat_number ?? "",
    Resultado: r.outcome ?? "Pendiente de importación", Observaciones: r.note ?? "", Participante: r.participant_id ?? "",
  });
  utils.book_append_sheet(wb, utils.json_to_sheet(report.entries.map((r) => ({ Grupo: r.group, ...toRow(r) }))), "Posibles duplicados");
  utils.book_append_sheet(wb, utils.json_to_sheet(report.dniWarnings.map(toRow)), "DNI compartidos");
  writeFile(wb, `posibles-duplicados-${filename.replace(/\.[^.]+$/, "")}.xlsx`);
}