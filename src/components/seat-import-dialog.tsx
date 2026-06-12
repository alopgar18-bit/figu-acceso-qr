import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Armchair, Loader2 } from "lucide-react";

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

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const sep = lines[0]!.includes(";") ? ";" : ",";
  const header = lines[0]!.split(sep).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iEmail = idx(["email", "correo", "e-mail"]);
  const iDni = idx(["dni", "nie", "documento", "pasaporte"]);
  const iTipo = idx(["tipo", "rol", "role"]);
  const iZone = idx(["zona", "sector", "zone"]);
  const iRow = idx(["fila", "row"]);
  const iSeat = idx(["asiento", "butaca", "seat", "numero", "número"]);
  const rows: Array<{ email?: string; dni?: string; tipo?: "titular" | "acompanante"; seat_zone?: string; seat_row?: string; seat_number?: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim());
    let tipo: "titular" | "acompanante" | undefined;
    if (iTipo >= 0) {
      const raw = (cols[iTipo] ?? "").toLowerCase();
      if (raw.startsWith("acomp") || raw === "companion") tipo = "acompanante";
      else if (raw.startsWith("titu") || raw === "main" || raw === "principal") tipo = "titular";
    }
    rows.push({
      email: iEmail >= 0 ? cols[iEmail] || undefined : undefined,
      dni: iDni >= 0 ? cols[iDni]?.toUpperCase() || undefined : undefined,
      tipo,
      seat_zone: iZone >= 0 ? cols[iZone] || undefined : undefined,
      seat_row: iRow >= 0 ? cols[iRow] || undefined : undefined,
      seat_number: iSeat >= 0 ? cols[iSeat] || undefined : undefined,
    });
  }
  return rows;
}

export function SeatImportDialog({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(bulkAssignSeats);
  const { data: sessions = [] } = useEventSessions(eventId);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [sessionId, setSessionId] = useState("all");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const rows = parseCsv(csv);
    if (rows.length === 0) { toast.error("CSV vacío o sin filas válidas."); return; }
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
          <DialogTitle>Importar asientos por CSV</DialogTitle>
          <DialogDescription>
            Cabeceras: <code>email</code> o <code>dni</code> (identificación), <code>tipo</code> (opcional: <code>titular</code> / <code>acompanante</code>),
            <code>zona</code>, <code>fila</code>, <code>asiento</code>. Si no indicas <code>tipo</code>, se busca primero entre titulares y luego entre acompañantes.
            Separador coma o punto y coma.
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
            <Label>CSV</Label>
            <Textarea
              rows={10}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className="font-mono text-xs"
              placeholder={"email,tipo,zona,fila,asiento\njuan@ejemplo.com,titular,VIP,A,12\nana@ejemplo.com,acompanante,VIP,A,13"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !csv.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}