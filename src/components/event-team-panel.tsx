import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, ShieldCheck, ScanLine, Users } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  listEventAssignments, listAssignableUsers,
  addEventAssignment, removeEventAssignment,
} from "@/lib/assignments.functions";
import { useEventSessions } from "@/lib/use-events";

type Role = "coordinador" | "validador";

const ROLE_LABEL: Record<Role, string> = {
  coordinador: "Coordinador",
  validador: "Validador",
};

export function EventTeamPanel({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listEventAssignments);
  const removeFn = useServerFn(removeEventAssignment);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["event-assignments", eventId],
    queryFn: () => listFn({ data: { event_id: eventId } }),
  });

  const { data: sessions = [] } = useEventSessions(eventId);

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Asignación eliminada");
      void qc.invalidateQueries({ queryKey: ["event-assignments", eventId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const rows = (data ?? []).filter((r) => r.role === "coordinador" || r.role === "validador");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
          <Users className="h-4 w-4" />Equipo asignado
        </CardTitle>
        <Button size="sm" className="uppercase tracking-wider" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Asignar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin asignaciones. Asigna coordinadores o validadores para que puedan ver este evento y sus sesiones.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Sesión</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const ses = r.session_id ? sessions.find((s) => s.id === r.session_id) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.profile?.full_name ?? r.profile?.email ?? "—"}</div>
                      {r.profile?.email && <div className="text-xs text-muted-foreground">{r.profile.email}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        {r.role === "validador" ? <ScanLine className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {ROLE_LABEL[r.role as Role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.session_id ? (ses?.name ?? r.session_id.slice(0, 8)) : "Todas"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove.mutate(r.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AssignDialog
        eventId={eventId}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
        open={open}
        onOpenChange={setOpen}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["event-assignments", eventId] })}
      />
    </Card>
  );
}

function AssignDialog({
  eventId, sessions, open, onOpenChange, onSaved,
}: {
  eventId: string;
  sessions: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const listUsersFn = useServerFn(listAssignableUsers);
  const addFn = useServerFn(addEventAssignment);
  const [role, setRole] = useState<Role>("validador");
  const [userId, setUserId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("__all__");
  const [submitting, setSubmitting] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["assignable-users", role],
    enabled: open,
    queryFn: () => listUsersFn({ data: { role } }),
  });

  const submit = async () => {
    if (!userId) {
      toast.error("Selecciona un usuario");
      return;
    }
    setSubmitting(true);
    try {
      await addFn({
        data: {
          event_id: eventId,
          user_id: userId,
          role,
          session_id: sessionId === "__all__" ? null : sessionId,
        },
      });
      toast.success("Usuario asignado");
      onSaved();
      onOpenChange(false);
      setUserId("");
      setSessionId("__all__");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al asignar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar usuario al evento</DialogTitle>
          <DialogDescription>
            Los coordinadores ven y gestionan el evento; los validadores acceden al control de acceso.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Rol</Label>
            <Select value={role} onValueChange={(v) => { setRole(v as Role); setUserId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="validador">Validador</SelectItem>
                <SelectItem value="coordinador">Coordinador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Usuario</Label>
            <Select value={userId} onValueChange={setUserId} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Cargando…" : users.length === 0 ? `Sin usuarios con rol ${ROLE_LABEL[role]}` : "Selecciona…"} />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name ?? u.email ?? u.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && users.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Asegúrate de que el usuario tiene el rol global &quot;{ROLE_LABEL[role]}&quot; en Usuarios.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Sesión (opcional)</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas las sesiones del evento</SelectItem>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Deja &quot;Todas&quot; para que vea cualquier sesión del evento.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting || !userId}>
            {submitting ? "Asignando…" : "Asignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}