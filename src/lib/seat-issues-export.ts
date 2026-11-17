import * as XLSX from "xlsx";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import type { VisibilityPermissions } from "./use-client-portal";

type SeatIssue = {
  tipo: string;
  participant_id: string;
  persona: string;
  telefono: string | null;
  correo: string | null;
  zona?: string | null;
  fila?: string | null;
  butaca?: string | null;
  problema: string;
  accion: string;
  propuesta_zona?: string | null;
  propuesta_fila?: string | null;
  propuesta_butaca?: string | null;
  propuesta_area?: string | null;
  propuesta_nota?: string | null;
};

type SeatIssuesResult = {
  generado: string;
  butacas_libres: number;
  incidencias: SeatIssue[];
};

export async function exportSeatIssuesExcel(opts: {
  sessionId: string;
  sessionName: string;
  eventName: string;
  perms?: VisibilityPermissions;
}): Promise<number> {
  const { data, error } = await supabase.rpc(
    "session_seat_issues" as never,
    { _session: opts.sessionId } as never,
  );
  if (error) throw error;
  if (!data) throw new Error("No se han recibido las incidencias de butacas");
  const result = data as unknown as SeatIssuesResult;
  const issues = [...result.incidencias].sort(
    (a, b) => a.tipo.localeCompare(b.tipo, "es") || a.persona.localeCompare(b.persona, "es"),
  );
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.tipo, (counts.get(issue.tipo) ?? 0) + 1);

  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ["Evento", opts.eventName],
    ["Sesión", opts.sessionName],
    ["Fecha de generación", new Date(result.generado).toLocaleString("es-ES")],
    ["Total incidencias", issues.length],
    ...Array.from(counts, ([tipo, count]) => [tipo, count]),
    ["Butacas libres en el plano", result.butacas_libres],
    [],
    ["Nota", "Propuesta calculada sobre el plano de butacas asignables del teatro. No se ha cambiado nada: revisar y aplicar."],
  ]);
  summary["!cols"] = [{ wch: 38 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(wb, summary, "Resumen");

  const sheet = XLSX.utils.aoa_to_sheet([
    ["Tipo", "Persona", "Teléfono", "Correo", "Zona actual", "Fila actual", "Butaca actual", "Problema", "Acción propuesta", "Zona propuesta", "Fila propuesta", "Butaca propuesta", "Área propuesta", "Nota"],
    ...issues.map((issue) => [
      issue.tipo,
      opts.perms && !opts.perms.see_names ? "" : issue.persona,
      opts.perms && !opts.perms.see_phone ? "" : issue.telefono ?? "",
      opts.perms && !opts.perms.see_email ? "" : issue.correo ?? "",
      issue.zona ?? "", issue.fila ?? "", issue.butaca ?? "",
      issue.problema, issue.accion,
      issue.propuesta_zona ?? "", issue.propuesta_fila ?? "", issue.propuesta_butaca ?? "",
      issue.propuesta_area ?? "", issue.propuesta_nota ?? "",
    ]),
  ]);
  sheet["!cols"] = [28, 34, 18, 36, 24, 12, 14, 60, 60, 24, 14, 16, 24, 60].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, sheet, "Incidencias");

  // La versión comunitaria de XLSX no escribe paneles inmovilizados: añadimos la vista al archivo generado.
  const zip = await JSZip.loadAsync(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
  const sheetPath = "xl/worksheets/sheet2.xml";
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error("No se ha generado la hoja de incidencias");
  const xml = await sheetFile.async("string");
  zip.file(sheetPath, xml.replace(
    /<sheetViews>[\s\S]*?<\/sheetViews>/,
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>',
  ));
  const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const slug = opts.sessionName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sesion";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `incidencias-butacas-${slug}-${Date.now()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const { data: userData } = await supabase.auth.getUser();
  const { error: auditError } = await supabase.from("audit_logs").insert({
    action: "report.export.seat_issues.xlsx",
    entity_type: "session",
    entity_id: opts.sessionId,
    session_id: opts.sessionId,
    actor_id: userData.user?.id ?? null,
    actor_email: userData.user?.email ?? null,
    changes: { format: "xlsx", row_count: issues.length },
  });
  if (auditError) console.warn("No se pudo registrar la exportación", auditError);
  return issues.length;
}