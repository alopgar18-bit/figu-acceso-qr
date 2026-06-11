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
  const iZone = idx(["zona", "sector", "zone"]);
  const iRow = idx(["fila", "row"]);
  const iSeat = idx(["asiento", "butaca", "seat", "numero", "número"]);
  const rows: Array<{ email?: string; dni?: string; seat_zone?: string; seat_row?: string; seat_number?: string }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim());
    rows.push({
      email: iEmail >= 0 ? cols[iEmail] || undefined : undefined,
      dni: iDni >= 0 ? cols[iDni]?.toUpperCase() || undefined : undefined,
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
      toast.success(`${res.updated} asiento/s asignados · ${res.skipped} no encontrados`);
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
            Cabeceras aceptadas: <code>email</code> o <code>dni</code> (para identificar) y <code>zona</code>, <code>fila</code>, <code>asiento</code>.
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
              placeholder={"email,zona,fila,asiento\njuan@ejemplo.com,Patio,A,12\nmaria@ejemplo.com,Patio,A,13"}
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