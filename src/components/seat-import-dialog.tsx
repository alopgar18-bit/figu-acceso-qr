import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Armchair, Loader2, FileSpreadsheet } from "lucide-react";
import { read, utils } from "xlsx";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { bulkAssignSeats } from "@/lib/seats.functions";
import { useEventSessions } from "@/lib/use-events";

type SeatRow = {
  email?: string;
  dni?: string;
  tipo?: "titular" | "acompanante";
  first_name?: string;
  last_name?: string;
  titular_full_name?: string;
  session_name?: string;
  seat_zone?: string;
  seat_row?: string;
  seat_number?: string;
};

function normH(h: string) {
  return h.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function rowsFromRecords(records: Array<Record<string, unknown>>): SeatRow[] {
  if (records.length === 0) return [];
  const headerKeys = Object.keys(records[0]!);
  const norm = new Map(headerKeys.map((k) => [normH(k), k] as const));
  const find = (names: string[]) => {
    for (const n of names) {
      const k = norm.get(n);
      if (k) return k;
    }
    return undefined;
  };
  const kEmail = find(["email", "correo", "e-mail"]);
  const kDni = find(["dni", "nie", "documento", "pasaporte"]);
  const kRol = find(["rol", "tipo", "role"]);
  const kFirst = find(["nombre"]);
  const kLast = find(["apellidos", "apellido", "surname"]);
  const kTitular = find([
    "solicitante (titular)", "solicitante titular", "solicitante", "titular",
  ]);
  const kSession = find(["sesion", "sesión", "session"]);
  const kZone = find(["zona", "sector", "zone"]);
  const kRow = find(["fila", "row"]);
  const kSeat = find(["asiento", "butaca", "seat", "numero"]);
  const out: SeatRow[] = [];
  for (const rec of records) {
    const get = (k?: string) => (k ? String(rec[k] ?? "").trim() : "");
    const rawRol = get(kRol).toLowerCase();
    let tipo: SeatRow["tipo"];
    if (rawRol.startsWith("acomp") || rawRol === "companion") tipo = "acompanante";
    else if (
      rawRol.startsWith("titu") || rawRol.startsWith("solic") ||
      rawRol === "main" || rawRol === "principal"
    ) tipo = "titular";
    const row: SeatRow = {
      email: get(kEmail) || undefined,
      dni: get(kDni).toUpperCase() || undefined,
      tipo,
      first_name: get(kFirst) || undefined,
      last_name: get(kLast) || undefined,
      titular_full_name: get(kTitular) || undefined,
      session_name: get(kSession) || undefined,
      seat_zone: get(kZone) || undefined,
      seat_row: get(kRow) || undefined,
      seat_number: get(kSeat) || undefined,
    };
    if (!row.email && !row.dni && !row.first_name && !row.titular_full_name) continue;
    if (!row.seat_zone && !row.seat_row && !row.seat_number) continue;
    out.push(row);
  }
  return out;
}

function parseCsv(text: string): SeatRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const sep = lines[0]!.includes(";") ? ";" : ",";
  const header = lines[0]!.split(sep).map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim());
    const rec: Record<string, string> = {};
    header.forEach((h, idx) => { rec[h] = cols[idx] ?? ""; });
    records.push(rec);
  }
  return rowsFromRecords(records);
}

async function parseExcel(file: File): Promise<SeatRow[]> {
  const buf = await file.arrayBuffer();
  const wb = read(buf, { type: "array" });
  // Prefer the "Detalle" sheet from the report export; fall back to first sheet.
  const preferred = wb.SheetNames.find((n) => normH(n) === "detalle")
    ?? wb.SheetNames.find((n) => normH(n) === "asistentes")
    ?? wb.SheetNames[0];
  const sheet = wb.Sheets[preferred!];
  const json = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  return rowsFromRecords(json);
}

export function SeatImportDialog({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(bulkAssignSeats);
  const { data: sessions = [] } = useEventSessions(eventId);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileRows, setFileRows] = useState<SeatRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [sessionId, setSessionId] = useState("all");
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const rows = ext === "csv" ? parseCsv(await file.text()) : await parseExcel(file);
      if (rows.length === 0) {
        toast.error("No se han encontrado filas con email/DNI y asiento en el archivo.");
        return;
      }
      setFileRows(rows);
      setFileName(file.name);
      toast.success(`${rows.length} filas listas para importar desde ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  }

  async function submit() {
    const rows = fileRows && fileRows.length > 0 ? fileRows : parseCsv(csv);
    if (rows.length === 0) { toast.error("Sin filas válidas para importar."); return; }
    setBusy(true);
    try {
      const res = await fn({
        data: {
          event_id: eventId,
          session_id: sessionId === "all" ? null : sessionId,
          rows,
        },
      });
      toast.success(
        `${res.updated} asignados (${res.updated_titulares} titulares · ${res.updated_acompanantes} acompañantes) · ${res.skipped} no encontrados`,
      );
      if (res.errors.length > 0) {
        console.warn("Errores import asientos:", res.errors);
      }
      qc.invalidateQueries({ queryKey: ["participants"] });
      setOpen(false);
      setCsv("");
      setFileRows(null);
      setFileName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Armchair className="h-4 w-4 mr-1" />Importar asientos</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar asientos</DialogTitle>
          <DialogDescription>
            Sube el <strong>Excel del informe</strong> (hoja <code>Detalle</code>) con las columnas
            <code> Zona</code>, <code>Fila</code> y <code>Asiento</code> rellenas a mano, o pega un CSV
            con cabeceras <code>email</code>/<code>dni</code>, <code>rol</code>
            (Solicitante/Acompañante), <code>zona</code>, <code>fila</code>, <code>asiento</code>.
            Si no indicas el rol, se busca primero entre titulares y luego entre acompañantes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Sesión</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sesiones</SelectItem>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Archivo (.xlsx, .csv)</Label>
            <label className="mt-1 flex items-center gap-3 border-2 border-dashed rounded-md p-4 cursor-pointer hover:bg-muted/50 transition">
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 text-sm">
                {fileRows ? (
                  <span><strong>{fileName}</strong> — {fileRows.length} filas listas</span>
                ) : (
                  <span className="text-muted-foreground">Selecciona el Excel del informe o un CSV</span>
                )}
              </div>
              {fileRows && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.preventDefault(); setFileRows(null); setFileName(""); }}
                >
                  Quitar
                </Button>
              )}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div>
            <Label>…o pegar CSV</Label>
            <Textarea
              rows={6}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className="font-mono text-xs"
              placeholder={"email,rol,zona,fila,asiento\njuan@ejemplo.com,titular,VIP,A,12\nana@ejemplo.com,acompanante,VIP,A,13"}
              disabled={!!fileRows}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || (!fileRows && !csv.trim())}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}