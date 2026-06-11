import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { duplicateSession } from "@/lib/sessions.functions";
import { toDateTimeLocal, fromDateTimeLocal } from "@/lib/event-constants";

export function DuplicateSessionDialog({
  sessionId,
  defaultName,
  defaultStartsAt,
  defaultEndsAt,
  trigger,
}: {
  sessionId: string;
  defaultName: string;
  defaultStartsAt: string;
  defaultEndsAt?: string | null;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const dup = useServerFn(duplicateSession);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${defaultName} (copia)`);
  const [startsAt, setStartsAt] = useState(toDateTimeLocal(defaultStartsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeLocal(defaultEndsAt ?? null));
  const [copyTeam, setCopyTeam] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error("Pon un nombre para la nueva sesión."); return; }
    const iso = fromDateTimeLocal(startsAt);
    if (!iso) { toast.error("Indica la fecha y hora."); return; }
    setBusy(true);
    try {
      const res = await dup({
        data: {
          session_id: sessionId,
          name: name.trim(),
          starts_at: iso,
          ends_at: endsAt ? fromDateTimeLocal(endsAt) : null,
          copy_assignments: copyTeam,
        },
      });
      toast.success(`Sesión duplicada${copyTeam ? ` (${res.copied_assignments} miembro/s del equipo copiados)` : ""}`);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["session-stats"] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo duplicar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm"><Copy className="h-3.5 w-3.5 mr-1" />Duplicar</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicar sesión</DialogTitle>
          <DialogDescription>
            Se copiarán la configuración y reglas. No se copian participantes ni check-ins.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Inicio *</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={copyTeam} onCheckedChange={(v) => setCopyTeam(v === true)} />
            Copiar también el equipo asignado a esta sesión
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Duplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}