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
    ["Asistentes reales", data.totals.checkins],
    ["  · Entradas con QR", data.totals.checkinsQr],
    ["  · Entradas manuales", data.totals.checkinsManual],
    ["  · Entradas vía incidencia", data.totals.checkinsViaIncidencia],
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
    ["Sesión", "Inicio", "Aforo", "Solicitudes", "Aprobados", "Confirmados", "Asistentes", "Entradas QR", "Entradas manuales", "Entradas vía incidencia", "No presentados", "Incidencias", "Ocupación %"],
    ...data.sessions.map((s) => [
      s.name,
      s.starts_at ? new Date(s.starts_at).toLocaleString("es-ES") : "",
      s.capacity,
      s.stats.solicitudes,
      s.stats.aprobados,
      s.stats.confirmados,
      s.stats.checkins,
      s.stats.checkinsQr,
      s.stats.checkinsManual,
      s.stats.checkinsViaIncidencia,
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

  // Sheet: Asistentes con acompañantes (jerárquico)
  const detalleHeader = [
    "Grupo", "Rol", "Solicitante (titular)",
    "Nombre", "Apellidos", "Nombre completo",
    "DNI", "Email", "Teléfono",
    "Sesión", "Estado", "Zona", "Fila", "Asiento", "Check-in",
    "Necesidades especiales / accesibilidad",
  ];
  const detalleAoa: (string | number)[][] = [detalleHeader];
  try {
    const eventId = data.event.id;
    type PartRow = {
      id: string; status: string; session_id: string; submission_id: string | null;
      seat_zone: string | null; seat_row: string | null; seat_number: string | null;
      people: { first_name?: string; last_name?: string; dni?: string; email?: string; phone?: string } | null;
      event_sessions: { name?: string } | null;
    };
    // Pagina event_participants (limit por defecto 1000)
    const participants: PartRow[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase
        .from("event_participants")
        .select("id, status, session_id, submission_id, seat_zone, seat_row, seat_number, people(first_name, last_name, dni, email, phone), event_sessions(name)")
        .eq("event_id", eventId)
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = (page ?? []) as PartRow[];
      participants.push(...rows);
      if (rows.length < pageSize) break;
    }

    type CompRow = {
      participant_id: string; first_name: string | null; last_name: string | null;
      dni: string | null; email: string | null; phone: string | null;
      seat_zone: string | null; seat_row: string | null; seat_number: string | null;
    };
    const partIds = participants.map((p) => p.id);
    const companions: CompRow[] = [];
    const chunkSize = 300;
    for (let i = 0; i < partIds.length; i += chunkSize) {
      const chunk = partIds.slice(i, i + chunkSize);
      // Inner pagination por si un chunk tuviera >1000 acompañantes
      for (let from = 0; ; from += pageSize) {
        const { data: page, error } = await supabase
          .from("companions")
          .select("participant_id, first_name, last_name, dni, email, phone, seat_zone, seat_row, seat_number")
          .in("participant_id", chunk)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (page ?? []) as CompRow[];
        companions.push(...rows);
        if (rows.length < pageSize) break;
      }
    }
    const compsByPart = new Map<string, CompRow[]>();
    for (const c of companions) {
      const arr = compsByPart.get(c.participant_id) ?? [];
      arr.push(c);
      compsByPart.set(c.participant_id, arr);
    }
    // Fetch special_needs from form_submissions for the participants that have one
    const submissionIds = Array.from(new Set(participants.map((p) => p.submission_id).filter((x): x is string => !!x)));
    const specialBySubmission = new Map<string, string>();
    for (let i = 0; i < submissionIds.length; i += chunkSize) {
      const chunk = submissionIds.slice(i, i + chunkSize);
      const { data: subs, error } = await supabase
        .from("form_submissions")
        .select("id, payload")
        .in("id", chunk);
      if (error) throw error;
      for (const s of (subs ?? []) as Array<{ id: string; payload: Record<string, unknown> | null }>) {
        const raw = s.payload?.["special_needs"];
        const val = typeof raw === "string" ? raw.trim() : "";
        if (val) specialBySubmission.set(s.id, val);
      }
    }
    const hideNames = opts.perms && !opts.perms.see_names;
    const hideDni = opts.perms && !opts.perms.see_dni;
    const hideEmail = opts.perms && !opts.perms.see_email;
    const hidePhone = opts.perms && !opts.perms.see_phone;
    const blank = (v: string | null | undefined, hide?: boolean) => hide ? "" : (v ?? "");
    const fullName = (fn?: string | null, ln?: string | null) => `${fn ?? ""} ${ln ?? ""}`.trim();
    // Ordenar: sesión → apellidos titular → nombre titular
    participants.sort((a, b) => {
      const an = `${a.event_sessions?.name ?? ""}|${a.people?.last_name ?? ""}|${a.people?.first_name ?? ""}`;
      const bn = `${b.event_sessions?.name ?? ""}|${b.people?.last_name ?? ""}|${b.people?.first_name ?? ""}`;
      return an.localeCompare(bn);
    });
    let groupIdx = 0;
    for (const p of participants) {
      groupIdx += 1;
      const titularFull = fullName(p.people?.first_name, p.people?.last_name);
      const titularDisplay = hideNames ? "" : titularFull;
      const specialNeeds = p.submission_id ? (specialBySubmission.get(p.submission_id) ?? "") : "";
      detalleAoa.push([
        groupIdx,
        "Solicitante",
        titularDisplay,
        blank(p.people?.first_name, hideNames),
        blank(p.people?.last_name, hideNames),
        titularDisplay,
        blank(p.people?.dni, hideDni),
        blank(p.people?.email, hideEmail),
        blank(p.people?.phone, hidePhone),
        p.event_sessions?.name ?? "",
        statusLabel(p.status as never),
        p.seat_zone ?? "",
        p.seat_row ?? "",
        p.seat_number ?? "",
        "",
        specialNeeds,
      ]);
      const comps = (compsByPart.get(p.id) ?? []).slice().sort((a, b) =>
        `${a.last_name ?? ""}|${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""}|${b.first_name ?? ""}`),
      );
      for (const c of comps) {
        detalleAoa.push([
          groupIdx,
          "Acompañante",
          titularDisplay,
          blank(c.first_name, hideNames),
          blank(c.last_name, hideNames),
          hideNames ? "" : fullName(c.first_name, c.last_name),
          blank(c.dni, hideDni),
          blank(c.email, hideEmail),
          blank(c.phone, hidePhone),
          p.event_sessions?.name ?? "",
          "",
          c.seat_zone ?? p.seat_zone ?? "",
          c.seat_row ?? "",
          c.seat_number ?? "",
          "",
          specialNeeds,
        ]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(detalleAoa);
    ws["!cols"] = [
      { wch: 6 }, { wch: 13 }, { wch: 28 },
      { wch: 18 }, { wch: 22 }, { wch: 30 },
      { wch: 12 }, { wch: 28 }, { wch: 14 },
      { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
      { wch: 50 },
    ];
    ws["!freeze"] = { ySplit: 1 } as unknown as never;
    XLSX.utils.book_append_sheet(wb, ws, "Detalle");
  } catch (e) {
    console.warn("No se pudo generar hoja Detalle", e);
  }

  // Sheet 4: Incidencias (manuales y de entrada con nombre/apellidos)
  const incAoa = [
    ["Fecha", "Sesión", "Categoría", "Tipo", "Título", "Descripción", "Participante", "Nombre (walk-in)", "Apellidos (walk-in)", "DNI (walk-in)", "Acompañantes"],
    ...data.incidentRows.map((i) => [
      i.created_at ? new Date(i.created_at).toLocaleString("es-ES") : "",
      i.session_name,
      i.category,
      i.type,
      i.title,
      i.description,
      i.participant_name,
      i.walk_in_first_name,
      i.walk_in_last_name,
      i.walk_in_dni,
      i.walk_in_companions,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incAoa), "Incidencias");

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
      ["Asistentes reales", String(data.totals.checkins)],
      ["  · Entradas con QR", String(data.totals.checkinsQr)],
      ["  · Entradas manuales", String(data.totals.checkinsManual)],
      ["  · Entradas vía incidencia", String(data.totals.checkinsViaIncidencia)],
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