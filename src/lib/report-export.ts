import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { ReportData, ParticipantExportRow } from "./use-reports";
import { statusLabel, attendeeLabel, APPROVED_LIKE } from "./participant-constants";
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
  const { error } = await supabase.from("audit_logs").insert({
    action,
    entity_type: "event",
    entity_id: eventId,
    event_id: eventId,
    session_id: sessionId ?? null,
    actor_id: userData.user?.id ?? null,
    actor_email: userData.user?.email ?? null,
    changes: { format, row_count: rowCount } as Json,
  });
  if (error) console.warn("No se pudo registrar la exportación", error);
}

export async function exportReportExcel(data: ReportData, opts: { sessionId?: string; perms?: VisibilityPermissions } = {}) {
  const rows = applyVisibility(data.participants, opts.perms);
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen
  const summary = [
    ["Evento", data.event.name],
    ["Fecha de generación", new Date().toLocaleString("es-ES")],
    [],
    ["Solicitudes (titulares)", data.totals.solicitudes],
    ["Solicitudes (personas)", data.totals.personasSolicitudes],
    ["Pendientes (titulares)", data.totals.pendientes],
    ["Aprobados (titulares)", data.totals.aprobados],
    ["Aprobados (personas)", data.totals.personasAprobados],
    ["Rechazados (titulares)", data.totals.rechazados],
    ["Rechazados (personas)", data.totals.personasRechazados],
    ["Lista de espera (titulares)", data.totals.listaEspera],
    ["Lista de espera (personas)", data.totals.personasListaEspera],
    ["Confirmados (titulares)", data.totals.confirmados],
    ["Confirmados (personas)", data.totals.personasConfirmadas],
    ["Cancelados (titulares)", data.totals.cancelados],
    ["Cancelados (personas)", data.totals.personasCancelados],
    ["Asistentes reales", data.totals.checkins],
    ["  · Entradas con QR", data.totals.checkinsQr],
    ["  · Entradas manuales", data.totals.checkinsManual],
    ["  · Entradas vía incidencia", data.totals.checkinsViaIncidencia],
    ["No presentados (titulares)", data.totals.noPresentados],
    ["No presentados (personas)", data.totals.personasNoPresentados],
    ["Aforo total", data.totals.capacidad],
    ["Ocupación %", data.totals.ocupacion],
    ["Comunicaciones enviadas", data.totals.communicationsSent],
    ["Errores comunicación", data.totals.communicationsErrors],
    ["Incidencias", data.totals.incidents],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen");

  // Sheet 2: Por sesión
  const sessionAoa = [
    ["Sesión", "Inicio", "Aforo", "Solicitudes (personas)", "Aprobados (personas)", "Confirmados (personas)", "Asistentes", "Entradas QR", "Entradas manuales", "Entradas vía incidencia", "No presentados (personas)", "Incidencias", "Ocupación %"],
    ...data.sessions.map((s) => [
      s.name,
      s.starts_at ? new Date(s.starts_at).toLocaleString("es-ES") : "",
      s.capacity,
      s.stats.personasSolicitudes,
      s.stats.personasAprobados,
      s.stats.personasConfirmadas,
      s.stats.checkins,
      s.stats.checkinsQr,
      s.stats.checkinsManual,
      s.stats.checkinsViaIncidencia,
      s.stats.personasNoPresentados,
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

// =============================================================
// Informe DETALLADO por sesión: Asistentes, Inscritos, No asistentes, Resumen
// =============================================================

type PersonFull = {
  first_name: string | null; last_name: string | null;
  dni: string | null; email: string | null; phone: string | null;
  birth_date: string | null; gender: string | null;
  city: string | null; province: string | null; country: string | null;
  source: string | null;
};
type PartFull = {
  id: string; status: ParticipantStatusLite; attendee_type: string;
  session_id: string; companions_count: number | null;
  submission_id: string | null; public_form_id: string | null; import_batch_id: string | null;
  seat_zone: string | null; seat_row: string | null; seat_number: string | null;
  created_at: string; approved_at: string | null; confirmed_at: string | null;
  internal_notes: string | null;
  people: PersonFull | null;
  event_sessions: { id: string; name: string | null } | null;
};
type ParticipantStatusLite = string;
type CompFull = {
  id: string; participant_id: string;
  first_name: string | null; last_name: string | null;
  dni: string | null; email: string | null; phone: string | null;
  age: number | null;
  seat_zone: string | null; seat_row: string | null; seat_number: string | null;
};
type CheckinFull = {
  participant_id: string | null; session_id: string;
  checked_in_at: string; device_info: string | null; result: string | null;
  validator_id: string | null;
};
type IncidentFull = {
  id: string; participant_id: string | null; session_id: string | null;
  category: string | null; incident_type: string | null;
  title: string | null; description: string | null; created_at: string;
  walk_in_first_name: string | null; walk_in_last_name: string | null;
  walk_in_dni: string | null; walk_in_companions: number | null;
};

async function fetchPaged<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await q(from, from + size - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

function originLabel(p: PartFull, formNames: Map<string, string>, batchNames: Map<string, string>): string {
  if (p.public_form_id) return `Formulario público${formNames.get(p.public_form_id) ? ` · ${formNames.get(p.public_form_id)}` : ""}`;
  if (p.import_batch_id) return `Importación${batchNames.get(p.import_batch_id) ? ` · ${batchNames.get(p.import_batch_id)}` : ""}`;
  if (p.submission_id) return "Formulario interno";
  if (p.people?.source) return `Manual · ${p.people.source}`;
  return "Manual";
}

function ageFrom(birth: string | null | undefined): number | string {
  if (!birth) return "";
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return "";
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

export async function exportReportDetailExcel(data: ReportData, opts: { sessionId?: string; perms?: VisibilityPermissions } = {}) {
  const eventId = data.event.id;
  const perms = opts.perms;
  const hideNames = perms && !perms.see_names;
  const hideDni = perms && !perms.see_dni;
  const hideEmail = perms && !perms.see_email;
  const hidePhone = perms && !perms.see_phone;
  const mask = (v: string | null | undefined, hide?: boolean) => hide ? "" : (v ?? "");
  const fullName = (fn?: string | null, ln?: string | null) => `${fn ?? ""} ${ln ?? ""}`.trim();

  // 1. Participantes con todo el detalle
  const participants = await fetchPaged<PartFull>((from, to) =>
    supabase.from("event_participants")
      .select("id, status, attendee_type, session_id, companions_count, submission_id, public_form_id, import_batch_id, seat_zone, seat_row, seat_number, created_at, approved_at, confirmed_at, internal_notes, people(first_name,last_name,dni,email,phone,birth_date,gender,city,province,country,source), event_sessions(id,name)")
      .eq("event_id", eventId)
      .range(from, to) as unknown as PromiseLike<{ data: PartFull[] | null; error: { message: string } | null }>,
  );
  const filteredParts = opts.sessionId ? participants.filter((p) => p.session_id === opts.sessionId) : participants;
  const partIds = filteredParts.map((p) => p.id);

  // 2. Acompañantes
  const companions: CompFull[] = [];
  for (let i = 0; i < partIds.length; i += 300) {
    const chunk = partIds.slice(i, i + 300);
    const rows = await fetchPaged<CompFull>((from, to) =>
      supabase.from("companions")
        .select("id, participant_id, first_name, last_name, dni, email, phone, age, seat_zone, seat_row, seat_number")
        .in("participant_id", chunk)
        .range(from, to) as unknown as PromiseLike<{ data: CompFull[] | null; error: { message: string } | null }>,
    );
    companions.push(...rows);
  }
  const compsByPart = new Map<string, CompFull[]>();
  for (const c of companions) {
    const a = compsByPart.get(c.participant_id) ?? [];
    a.push(c); compsByPart.set(c.participant_id, a);
  }

  // 3. Check-ins
  const checkins = await fetchPaged<CheckinFull>((from, to) =>
    supabase.from("checkins")
      .select("participant_id, session_id, checked_in_at, device_info, result, validator_id")
      .eq("event_id", eventId)
      .range(from, to) as unknown as PromiseLike<{ data: CheckinFull[] | null; error: { message: string } | null }>,
  );
  const okCheckins = checkins.filter((c) => (c.result ?? "ok") === "ok" && (!opts.sessionId || c.session_id === opts.sessionId));
  const checkinByPart = new Map<string, CheckinFull>();
  for (const c of okCheckins) {
    if (c.participant_id && !checkinByPart.has(c.participant_id)) checkinByPart.set(c.participant_id, c);
  }

  // 4. Incidencias
  const incidents = await fetchPaged<IncidentFull>((from, to) =>
    supabase.from("incidents")
      .select("id, participant_id, session_id, category, incident_type, title, description, created_at, walk_in_first_name, walk_in_last_name, walk_in_dni, walk_in_companions")
      .eq("event_id", eventId)
      .range(from, to) as unknown as PromiseLike<{ data: IncidentFull[] | null; error: { message: string } | null }>,
  );
  const filteredIncidents = opts.sessionId ? incidents.filter((i) => i.session_id === opts.sessionId) : incidents;

  // 5. Maps auxiliares (forms / batches / sessions / validators)
  const formIds = Array.from(new Set(filteredParts.map((p) => p.public_form_id).filter((x): x is string => !!x)));
  const batchIds = Array.from(new Set(filteredParts.map((p) => p.import_batch_id).filter((x): x is string => !!x)));
  const formNames = new Map<string, string>();
  if (formIds.length) {
    const { data } = await supabase.from("public_forms").select("id, title").in("id", formIds);
    for (const f of data ?? []) formNames.set(f.id, (f as { title?: string }).title ?? "");
  }
  const batchNames = new Map<string, string>();
  if (batchIds.length) {
    const { data } = await supabase.from("import_batches").select("id, filename").in("id", batchIds);
    for (const b of data ?? []) batchNames.set(b.id, (b as { filename?: string }).filename ?? "");
  }
  const sessionMap = new Map<string, { name: string }>();
  for (const s of data.sessions) sessionMap.set(s.id, { name: s.name });
  const validatorIds = Array.from(new Set(okCheckins.map((c) => c.validator_id).filter((v): v is string => !!v)));
  const validatorName = new Map<string, string>();
  if (validatorIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", validatorIds);
    for (const p of profs ?? []) validatorName.set(p.id, p.full_name ?? p.email ?? "—");
  }

  // Workbook
  const wb = XLSX.utils.book_new();

  // ---- Hoja 1: Asistentes (titulares + acompañantes con check-in + walk-ins por incidencia)
  const asisHeader = [
    "Sesión", "Rol", "Grupo titular", "Nombre", "Apellidos", "DNI", "Email", "Teléfono",
    "Edad", "Género", "Ciudad", "Provincia",
    "Tipo asistente", "Origen", "Estado", "Zona", "Fila", "Asiento",
    "Hora check-in", "Método", "Validador", "Vía", "Notas",
  ];
  const asisAoa: (string | number)[][] = [asisHeader];
  // Sort by session/apellidos
  const sortedParts = [...filteredParts].sort((a, b) =>
    `${a.event_sessions?.name ?? ""}|${a.people?.last_name ?? ""}|${a.people?.first_name ?? ""}`
      .localeCompare(`${b.event_sessions?.name ?? ""}|${b.people?.last_name ?? ""}|${b.people?.first_name ?? ""}`),
  );
  for (const p of sortedParts) {
    const ci = checkinByPart.get(p.id);
    if (!ci) continue;
    const titular = fullName(p.people?.first_name, p.people?.last_name);
    const method = (ci.device_info ?? "") === "manual_override" ? "Manual" : "QR";
    asisAoa.push([
      p.event_sessions?.name ?? "", "Titular", hideNames ? "" : titular,
      mask(p.people?.first_name, hideNames), mask(p.people?.last_name, hideNames),
      mask(p.people?.dni, hideDni), mask(p.people?.email, hideEmail), mask(p.people?.phone, hidePhone),
      ageFrom(p.people?.birth_date), p.people?.gender ?? "", p.people?.city ?? "", p.people?.province ?? "",
      attendeeLabel(p.attendee_type as never), originLabel(p, formNames, batchNames), statusLabel(p.status as never),
      p.seat_zone ?? "", p.seat_row ?? "", p.seat_number ?? "",
      ci.checked_in_at ? new Date(ci.checked_in_at).toLocaleString("es-ES") : "",
      method, ci.validator_id ? (validatorName.get(ci.validator_id) ?? "") : "",
      "Check-in", p.internal_notes ?? "",
    ]);
    for (const c of compsByPart.get(p.id) ?? []) {
      asisAoa.push([
        p.event_sessions?.name ?? "", "Acompañante", hideNames ? "" : titular,
        mask(c.first_name, hideNames), mask(c.last_name, hideNames),
        mask(c.dni, hideDni), mask(c.email, hideEmail), mask(c.phone, hidePhone),
        c.age ?? "", "", "", "",
        "Acompañante", originLabel(p, formNames, batchNames), statusLabel(p.status as never),
        c.seat_zone ?? p.seat_zone ?? "", c.seat_row ?? "", c.seat_number ?? "",
        ci.checked_in_at ? new Date(ci.checked_in_at).toLocaleString("es-ES") : "",
        method, ci.validator_id ? (validatorName.get(ci.validator_id) ?? "") : "",
        "Check-in titular", "",
      ]);
    }
  }
  // Walk-ins por incidencia de entrada (sin check-in asociado)
  for (const inc of filteredIncidents) {
    if ((inc.category ?? "entrada") !== "entrada") continue;
    const linkedPart = inc.participant_id ? filteredParts.find((p) => p.id === inc.participant_id) : null;
    if (linkedPart && checkinByPart.has(linkedPart.id)) continue; // ya contado
    const sessName = inc.session_id ? sessionMap.get(inc.session_id)?.name ?? "" : "";
    const personFn = linkedPart?.people?.first_name ?? inc.walk_in_first_name;
    const personLn = linkedPart?.people?.last_name ?? inc.walk_in_last_name;
    asisAoa.push([
      sessName, linkedPart ? "Titular (incidencia)" : "Walk-in",
      hideNames ? "" : fullName(personFn, personLn),
      mask(personFn, hideNames), mask(personLn, hideNames),
      mask(linkedPart?.people?.dni ?? inc.walk_in_dni, hideDni),
      mask(linkedPart?.people?.email, hideEmail), mask(linkedPart?.people?.phone, hidePhone),
      ageFrom(linkedPart?.people?.birth_date), linkedPart?.people?.gender ?? "",
      linkedPart?.people?.city ?? "", linkedPart?.people?.province ?? "",
      linkedPart ? attendeeLabel(linkedPart.attendee_type as never) : "Walk-in",
      linkedPart ? originLabel(linkedPart, formNames, batchNames) : "Walk-in",
      linkedPart ? statusLabel(linkedPart.status as never) : "Incidencia",
      linkedPart?.seat_zone ?? "", linkedPart?.seat_row ?? "", linkedPart?.seat_number ?? "",
      new Date(inc.created_at).toLocaleString("es-ES"),
      "Incidencia", "",
      `Incidencia · ${inc.title ?? inc.incident_type ?? ""}`,
      `${inc.description ?? ""}${inc.walk_in_companions ? ` (+${inc.walk_in_companions} acomp.)` : ""}`,
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(asisAoa), "Asistentes");

  // ---- Hoja 2: Inscritos (todos los titulares + acompañantes inscritos)
  const inscHeader = [
    "Sesión", "Rol", "Grupo titular", "Nombre", "Apellidos", "DNI", "Email", "Teléfono",
    "Fecha nacimiento", "Edad", "Género", "Ciudad", "Provincia", "País",
    "Tipo asistente", "Origen", "Estado", "Acompañantes (nº)",
    "Zona", "Fila", "Asiento", "Fecha solicitud", "Fecha aprobación", "Fecha confirmación",
    "Notas internas",
  ];
  const inscAoa: (string | number)[][] = [inscHeader];
  for (const p of sortedParts) {
    const titular = fullName(p.people?.first_name, p.people?.last_name);
    inscAoa.push([
      p.event_sessions?.name ?? "", "Titular", hideNames ? "" : titular,
      mask(p.people?.first_name, hideNames), mask(p.people?.last_name, hideNames),
      mask(p.people?.dni, hideDni), mask(p.people?.email, hideEmail), mask(p.people?.phone, hidePhone),
      p.people?.birth_date ?? "", ageFrom(p.people?.birth_date), p.people?.gender ?? "",
      p.people?.city ?? "", p.people?.province ?? "", p.people?.country ?? "",
      attendeeLabel(p.attendee_type as never), originLabel(p, formNames, batchNames),
      statusLabel(p.status as never), p.companions_count ?? 0,
      p.seat_zone ?? "", p.seat_row ?? "", p.seat_number ?? "",
      p.created_at ? new Date(p.created_at).toLocaleString("es-ES") : "",
      p.approved_at ? new Date(p.approved_at).toLocaleString("es-ES") : "",
      p.confirmed_at ? new Date(p.confirmed_at).toLocaleString("es-ES") : "",
      p.internal_notes ?? "",
    ]);
    for (const c of compsByPart.get(p.id) ?? []) {
      inscAoa.push([
        p.event_sessions?.name ?? "", "Acompañante", hideNames ? "" : titular,
        mask(c.first_name, hideNames), mask(c.last_name, hideNames),
        mask(c.dni, hideDni), mask(c.email, hideEmail), mask(c.phone, hidePhone),
        "", c.age ?? "", "", "", "", "",
        "Acompañante", originLabel(p, formNames, batchNames), statusLabel(p.status as never), "",
        c.seat_zone ?? p.seat_zone ?? "", c.seat_row ?? "", c.seat_number ?? "",
        "", "", "", "",
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inscAoa), "Inscritos");

  // ---- Hoja 3: No asistentes (aprobados/confirmados sin check-in)
  const noShowHeader = [
    "Sesión", "Nombre", "Apellidos", "DNI", "Email", "Teléfono",
    "Tipo asistente", "Estado", "Acompañantes (nº)", "Origen",
    "Fecha confirmación", "Notas",
  ];
  const noShowAoa: (string | number)[][] = [noShowHeader];
  for (const p of sortedParts) {
    if (!APPROVED_LIKE.includes(p.status as never)) continue;
    if (checkinByPart.has(p.id)) continue;
    // No considerar como "no asistente" los walk-in que entraron por incidencia
    const viaInc = filteredIncidents.some((i) => i.participant_id === p.id && (i.category ?? "entrada") === "entrada");
    if (viaInc) continue;
    noShowAoa.push([
      p.event_sessions?.name ?? "",
      mask(p.people?.first_name, hideNames), mask(p.people?.last_name, hideNames),
      mask(p.people?.dni, hideDni), mask(p.people?.email, hideEmail), mask(p.people?.phone, hidePhone),
      attendeeLabel(p.attendee_type as never), statusLabel(p.status as never),
      p.companions_count ?? 0, originLabel(p, formNames, batchNames),
      p.confirmed_at ? new Date(p.confirmed_at).toLocaleString("es-ES") : "",
      p.internal_notes ?? "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(noShowAoa), "No asistentes");

  // ---- Hoja 4: Resumen evento
  const t = data.totals;
  const resumen: (string | number)[][] = [
    ["Evento", data.event.name],
    ["Ubicación", [data.event.location_name, data.event.city].filter(Boolean).join(" · ")],
    ["Inicio", data.event.starts_at ? new Date(data.event.starts_at).toLocaleString("es-ES") : ""],
    ["Fecha generación", new Date().toLocaleString("es-ES")],
    [],
    ["MÉTRICA", "VALOR"],
    ["Solicitudes totales", t.solicitudes],
    ["Pendientes de revisión", t.pendientes],
    ["Aprobados", t.aprobados],
    ["Rechazados", t.rechazados],
    ["Lista de espera", t.listaEspera],
    ["Confirmados (titulares)", t.confirmados],
    ["Personas con plaza (titulares + acompañantes)", t.personasConfirmadas],
    ["Cancelados", t.cancelados],
    ["Aforo total", t.capacidad],
    ["Ocupación %", t.ocupacion],
    [],
    ["ASISTENCIA REAL", ""],
    ["Check-ins totales", t.checkins],
    ["  · Vía QR", t.checkinsQr],
    ["  · Manuales", t.checkinsManual],
    ["  · Vía incidencia (walk-in)", t.checkinsViaIncidencia],
    ["No presentados", t.noPresentados],
    ["Ratio asistencia %", t.confirmados ? Math.round((t.checkins / t.confirmados) * 100) : 0],
    [],
    ["INCIDENCIAS", ""],
    ["Total incidencias", t.incidents],
    ["Intentos QR duplicado", t.duplicateAttempts],
    ["Validadores activos", t.activeValidators],
    [],
    ["COMUNICACIONES", ""],
    ["Enviadas", t.communicationsSent],
    ["Errores", t.communicationsErrors],
    [],
    ["DESGLOSE POR SESIÓN", ""],
    ["Sesión", "Aforo", "Solic.", "Aprob.", "Conf.", "Personas conf.", "Asist.", "QR", "Manual", "Walk-in", "No-show", "Inc.", "Ocup. %"],
    ...data.sessions.map((s) => [
      s.name, s.capacity, s.stats.solicitudes, s.stats.aprobados, s.stats.confirmados,
      s.stats.personasConfirmadas, s.stats.checkins, s.stats.checkinsQr, s.stats.checkinsManual,
      s.stats.checkinsViaIncidencia, s.stats.noPresentados, s.stats.incidencias,
      s.capacity ? Math.round((s.stats.personasConfirmadas / s.capacity) * 100) : 0,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  const filename = `detalle-${slug(data.event.name)}-${Date.now()}.xlsx`;
  XLSX.writeFile(wb, filename);

  await logExport("report.export.detail.xlsx", eventId, opts.sessionId, "xlsx", asisAoa.length - 1);
}