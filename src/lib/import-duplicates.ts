/** Coincidencias orientativas: nunca deciden si se importa una persona. */
export function importNameKey(first?: string | null, last?: string | null): string {
  const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  return `${normalize(first)}|${normalize(last?.replace(/\s+VIS\s+\d+$/i, ""))}`;
}

export interface DuplicateReportEntry {
  first_name: string;
  last_name: string | null;
  dni: string | null;
  email: string | null;
  phone: string | null;
  seat_zone: string | null;
  seat_row: string | null;
  seat_number: string | null;
  participant_id: string | null;
  row_number: number | null;
  origin: "archivo" | "sesión";
  outcome: string | null;
  note: string | null;
}

export function buildImportDuplicateReport(incoming: DuplicateReportEntry[], roster: DuplicateReportEntry[]) {
  const groups = new Map<string, DuplicateReportEntry[]>();
  const linkedIds = new Set(incoming.flatMap((r) => r.participant_id ? [r.participant_id] : []));
  for (const entry of [...incoming, ...roster.filter((r) => !r.participant_id || !linkedIds.has(r.participant_id))]) {
    if (!entry.first_name.trim()) continue;
    const key = importNameKey(entry.first_name, entry.last_name);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  const duplicates = [...groups.values()].filter((g) => g.length > 1 && g.some((r) => r.origin === "archivo"));
  return {
    groups: duplicates.length,
    possibleDuplicateRows: duplicates.reduce((n, g) => n + g.filter((r) => r.origin === "archivo").length, 0),
    entries: duplicates.flatMap((group, i) => group.map((entry) => ({ group: i + 1, ...entry }))),
    dniWarnings: incoming.filter((r) => r.note?.includes("DNI compartido")),
  };
}

export type ImportDuplicateReport = ReturnType<typeof buildImportDuplicateReport>;

/** Identidad por lote y fila: los reintentos no crean otra inscripción. */
export async function importRowId(batchId: string, rowIndex: number, entity: "persona" | "participante"): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${batchId}:${rowIndex}:${entity}`));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 15) | 80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}