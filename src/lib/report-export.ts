import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ReportData, ParticipantExportRow } from "./use-reports";
import { statusLabel, attendeeLabel } from "./participant-constants";
import type { VisibilityPermissions } from "./use-client-portal";

const COLUMN_HEADERS: Array<{ key: keyof ParticipantExportRow; label: string; piiKind?: "names" | "dni" | "email" | "phone" }> = [
  { key: "event_name", label: "Evento" },
  { key: "session_name", label: "Sesión" },
  { key: "first_name", label: "Nombre", piiKind: "names" },
  { key: "last_name", label: "Apellidos", piiKind: "names" },
  { key: "dni", label: "DNI", piiKind: "dni" },
  { key: "email", label: "Email", piiKind: "email" },
  { key: "phone", label: "Teléfono", piiKind: "phone" },
  { key: "status", label: "Estado" },
  { key: "attendee_type", label: "Tipo asistente" },
  { key: "companions", label: "Acompañantes" },
  { key: "confirmed", label: "Confirmado" },
  { key: "confirmed_at", label: "Fecha confirmación" },
  { key: "qr_generated", label: "QR generado" },
  { key: "checkin", label: "Check-in" },
  { key: "checkin_at", label: "Hora check-in" },
  { key: "validator", label: "Validador" },
  { key: "incidents", label: "Incidencias" },
  { key: "consent_privacy", label: "Consent. privacidad" },
  { key: "consent_image", label: "Consent. imagen" },
  { key: "consent_future", label: "Consent. futuros procesos" },
];

function applyVisibility(rows: ParticipantExportRow[], perms?: VisibilityPermissions) {
  if (!perms) return rows;
  return rows.map((r) => {
    const out = { ...r };
    if (!perms.see_names) { out.first_name = ""; out.last_name = ""; }
    if (!perms.see_dni) out.dni = "";
    if (!perms.see_email) out.email = "";
    if (!perms.see_phone) out.phone = "";
    return out;
  });
}

async function logExport(action: string, eventId: string, sessionId: string | undefined, format: "xlsx" | "pdf", rowCount: number) {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({
    action,
    entity_type: "event",
    entity_id: eventId,
    event_id: eventId,
    session_id: sessionId ?? null,
    actor_id: userData.user?.id ?? null,
    actor_email: userData.user?.email ?? null,
    changes: { format, row_count: rowCount } as Json,
  });
}

export async function exportReportExcel(data: ReportData, opts: { sessionId?: string; perms?: VisibilityPermissions } = {}) {
  const rows = applyVisibility(data.participants, opts.perms);
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen
  const summary = [
    ["Evento", data.event.name],
    ["Fecha de generación", new Date().toLocaleString("es-ES")],
    [],
    ["Solicitudes", data.totals.solicitudes],
    ["Pendientes", data.totals.pendientes],
    ["Aprobados", data.totals.aprobados],
    ["Rechazados", data.totals.rechazados],
    ["Lista de espera", data.totals.listaEspera],
    ["Confirmados", data.totals.confirmados],
    ["Cancelados", data.totals.cancelados],
    ["Check-ins", data.totals.checkins],
    ["No presentados", data.totals.noPresentados],
    ["Aforo total", data.totals.capacidad],
    ["Ocupación %", data.totals.ocupacion],
    ["Comunicaciones enviadas", data.totals.communicationsSent],
    ["Errores comunicación", data.totals.communicationsErrors],
    ["Incidencias", data.totals.incidents],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen");

  // Sheet 2: Por sesión
  const sessionAoa = [
    ["Sesión", "Inicio", "Aforo", "Solicitudes", "Aprobados", "Confirmados", "Check-ins", "No presentados", "Incidencias", "Ocupación %"],
    ...data.sessions.map((s) => [
      s.name,
      s.starts_at ? new Date(s.starts_at).toLocaleString("es-ES") : "",
      s.capacity,
      s.stats.solicitudes,
      s.stats.aprobados,
      s.stats.confirmados,
      s.stats.checkins,
      s.stats.noPresentados,
      s.stats.incidencias,
      s.capacity ? Math.round((s.stats.personasConfirmadas / s.capacity) * 100) : 0,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sessionAoa), "Sesiones");

  // Sheet 3: Asistentes
  const partAoa = [
    COLUMN_HEADERS.map((c) => c.label),
    ...rows.map((r) =>
      COLUMN_HEADERS.map((c) => {
        const v = r[c.key];
        if (c.key === "status") return statusLabel(v as never);
        if (c.key === "attendee_type") return attendeeLabel(v as never);
        return v;
      }),
    ),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(partAoa), "Asistentes");

  const filename = `informe-${slug(data.event.name)}-${Date.now()}.xlsx`;
  XLSX.writeFile(wb, filename);

  await logExport("report.export.xlsx", data.event.id, opts.sessionId, "xlsx", rows.length);
}

export async function exportReportPDF(data: ReportData, opts: { sessionId?: string; perms?: VisibilityPermissions } = {}) {
  const rows = applyVisibility(data.participants, opts.perms);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const now = new Date().toLocaleString("es-ES");

  // Branding header
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageWidth, 48, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FIGURARTE ACCESS", 32, 30);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Informe de evento", pageWidth - 32, 30, { align: "right" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(data.event.name, 32, 80);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  const subtitle = [data.event.location_name, data.event.city].filter(Boolean).join(" · ");
  if (subtitle) doc.text(subtitle, 32, 96);
  doc.text(`Generado: ${now}`, 32, 110);

  // Executive summary
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumen ejecutivo", 32, 140);
  autoTable(doc, {
    startY: 148,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    head: [["Métrica", "Valor"]],
    headStyles: { fillColor: [0, 0, 0] },
    body: [
      ["Solicitudes", String(data.totals.solicitudes)],
      ["Aprobados", String(data.totals.aprobados)],
      ["Confirmados", String(data.totals.confirmados)],
      ["Check-ins (asistentes)", String(data.totals.checkins)],
      ["No presentados", String(data.totals.noPresentados)],
      ["Cancelados", String(data.totals.cancelados)],
      ["Lista de espera", String(data.totals.listaEspera)],
      ["Aforo total", String(data.totals.capacidad)],
      ["Ocupación", `${data.totals.ocupacion}%`],
      ["Incidencias", String(data.totals.incidents)],
      ["Comunicaciones enviadas", String(data.totals.communicationsSent)],
    ],
  });

  // Sessions table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const afterSummaryY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  doc.text("Resumen por sesión", 32, afterSummaryY);
  autoTable(doc, {
    startY: afterSummaryY + 6,
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [0, 0, 0] },
    head: [["Sesión", "Inicio", "Aforo", "Conf.", "Check-in", "No-show", "Inc."]],
    body: data.sessions.map((s) => [
      s.name,
      s.starts_at ? new Date(s.starts_at).toLocaleString("es-ES") : "—",
      s.capacity,
      s.stats.confirmados,
      s.stats.checkins,
      s.stats.noPresentados,
      s.stats.incidencias,
    ]),
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`FIGURARTE Access · ${now} · Página ${i}/${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 16, { align: "center" });
  }

  const filename = `informe-${slug(data.event.name)}-${Date.now()}.pdf`;
  doc.save(filename);

  await logExport("report.export.pdf", data.event.id, opts.sessionId, "pdf", rows.length);
}

function slug(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}