import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, ArrowRightLeft, Ban, Mail,
  Save, AlertCircle, Image as ImageIcon, Shield, UserCheck,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

import {
  useParticipant, useUpdateParticipant, useBlockPerson, useUpdatePerson,
  useParticipantCompanions, useParticipantConsents,
} from "@/lib/use-participants";
import { useEventSessions } from "@/lib/use-events";
import {
  PARTICIPANT_STATUS_OPTIONS, ATTENDEE_TYPE_OPTIONS,
  statusLabel, ageFromBirth,
} from "@/lib/participant-constants";
import type { Database } from "@/integrations/supabase/types";
import { SendCommunicationDialog, type CommRecipient } from "@/components/send-communication-dialog";

type Status = Database["public"]["Enums"]["participant_status"];
type Attendee = Database["public"]["Enums"]["attendee_type"];

export const Route = createFileRoute("/_authenticated/solicitudes/$participantId")({
  component: Page,
});

function Page() {
  const { participantId } = Route.useParams();
  const { data: p, isLoading } = useParticipant(participantId);
  const { data: companions = [] } = useParticipantCompanions(participantId);
  const { data: consents = [] } = useParticipantConsents(participantId);
  const { data: sessions = [] } = useEventSessions(p?.event_id);

  const updateParticipant = useUpdateParticipant();
  const updatePerson = useUpdatePerson();
  const blockPerson = useBlockPerson();

  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [editPerson, setEditPerson] = useState<Record<string, string>>({});
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetSession, setTargetSession] = useState("");
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [commOpen, setCommOpen] = useState(false);

  if (isLoading || !p) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const person = p.people;
  const age = ageFromBirth(person?.birth_date);
  const submission = p.form_submissions;
  const payload = (submission?.payload ?? {}) as Record<string, unknown>;
  const photoUrl = (payload.photo_url as string) ?? (payload.photoUrl as string) ?? null;

  const consentByKind = (kind: string) => consents.find((c) => c.legal_texts?.kind === kind);

  const setStatus = (status: Status, extra: Database["public"]["Tables"]["event_participants"]["Update"] = {}) => {
    updateParticipant.mutate(
      { id: p.id, eventId: p.event_id, patch: { status, ...extra }, action: `participant.${status}` },
      { onSuccess: () => toast.success(`Estado: ${statusLabel(status)}`) },
    );
  };

  const setAttendeeType = (t: Attendee) => {
    updateParticipant.mutate(
      { id: p.id, eventId: p.event_id, patch: { attendee_type: t }, action: "participant.attendee_type" },
      { onSuccess: () => toast.success("Tipo actualizado") },
    );
  };

  const addNote = () => {
    if (!notes.trim()) return;
    const merged = [p.internal_notes, `[${new Date().toLocaleString("es-ES")}] ${notes.trim()}`].filter(Boolean).join("\n\n");
    updateParticipant.mutate(
      { id: p.id, eventId: p.event_id, patch: { internal_notes: merged }, action: "participant.note" },
      { onSuccess: () => { setNotes(""); toast.success("Nota añadida"); } },
    );
  };

  const startEdit = () => {
    setEditPerson({
      first_name: person?.first_name ?? "",
      last_name: person?.last_name ?? "",
      email: person?.email ?? "",
      phone: person?.phone ?? "",
      dni: person?.dni ?? "",
      city: person?.city ?? "",
      province: person?.province ?? "",
    });
    setEditing(true);
  };

  const saveEdit = () => {
    if (!person) return;
    updatePerson.mutate(
      { id: person.id, patch: editPerson },
      { onSuccess: () => { setEditing(false); toast.success("Datos actualizados"); } },
    );
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/solicitudes"><ArrowLeft className="h-4 w-4 mr-1" />Volver a solicitudes</Link>
      </Button>

      <PageHeader
        eyebrow={p.events?.name ?? "Solicitud"}
        title={person ? `${person.first_name} ${person.last_name ?? ""}`.trim() : "Persona"}
        description={p.event_sessions ? `${p.event_sessions.name} · ${new Date(p.event_sessions.starts_at).toLocaleString("es-ES")}` : undefined}
        actions={
          <Badge variant="outline" className="uppercase tracking-wider">
            {statusLabel(p.status)}
          </Badge>
        }
      />

      {person?.is_blocked && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 flex items-start gap-2 text-sm">
            <Shield className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div>
              <div className="font-semibold">Persona bloqueada</div>
              {person.blocked_reason && <div className="text-muted-foreground">{person.blocked_reason}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-2">
          <Button onClick={() => setStatus("aprobado", { approved_at: new Date().toISOString() })} disabled={updateParticipant.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" />Aprobar
          </Button>
          <Button variant="outline" onClick={() => setStatus("pendiente_confirmacion", { approved_at: new Date().toISOString() })}>
            <UserCheck className="h-4 w-4 mr-1" />Aprobar a la espera de confirmación
          </Button>
          <Button variant="outline" onClick={() => setStatus("rechazado")}>
            <XCircle className="h-4 w-4 mr-1" />Rechazar
          </Button>
          <Button variant="outline" onClick={() => setStatus("lista_espera")}>
            <Clock className="h-4 w-4 mr-1" />Lista de espera
          </Button>
          <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><ArrowRightLeft className="h-4 w-4 mr-1" />Cambiar sesión</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mover a otra sesión</DialogTitle>
                <DialogDescription>Mantiene el estado actual y la persona.</DialogDescription>
              </DialogHeader>
              <Select value={targetSession} onValueChange={setTargetSession}>
                <SelectTrigger><SelectValue placeholder="Selecciona sesión" /></SelectTrigger>
                <SelectContent>
                  {sessions.filter((s) => s.id !== p.session_id).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setMoveOpen(false)}>Cancelar</Button>
                <Button disabled={!targetSession} onClick={() => {
                  updateParticipant.mutate(
                    { id: p.id, eventId: p.event_id, patch: { session_id: targetSession }, action: "participant.move_session" },
                    { onSuccess: () => { setMoveOpen(false); toast.success("Sesión cambiada"); } },
                  );
                }}>Mover</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => setCommOpen(true)}>
            <Mail className="h-4 w-4 mr-1" />Enviar comunicación
          </Button>
          <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <Ban className="h-4 w-4 mr-1" />{person?.is_blocked ? "Desbloquear persona" : "Bloquear persona"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{person?.is_blocked ? "Desbloquear" : "Bloquear"} persona</DialogTitle>
                <DialogDescription>
                  {person?.is_blocked
                    ? "Esta persona podrá volver a inscribirse en futuros eventos."
                    : "Esta persona no podrá inscribirse en futuros eventos hasta que la desbloquees."}
                </DialogDescription>
              </DialogHeader>
              {!person?.is_blocked && (
                <div className="space-y-2">
                  <Label>Motivo</Label>
                  <Textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Motivo del bloqueo…" />
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setBlockOpen(false)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!person) return;
                    blockPerson.mutate(
                      { personId: person.id, blocked: !person.is_blocked, reason: blockReason },
                      {
                        onSuccess: () => { setBlockOpen(false); setBlockReason(""); toast.success("Hecho"); },
                      },
                    );
                  }}
                >Confirmar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Person info */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base uppercase tracking-wider">Datos personales</CardTitle>
            {!editing ? (
              <Button size="sm" variant="ghost" onClick={startEdit}>Editar</Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button size="sm" onClick={saveEdit}><Save className="h-4 w-4 mr-1" />Guardar</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!editing ? (
              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                <Field label="Nombre" value={person?.first_name} />
                <Field label="Apellidos" value={person?.last_name} />
                <Field label="Email" value={person?.email} />
                <Field label="Teléfono" value={person?.phone} />
                <Field label="DNI" value={person?.dni} />
                <Field label="Edad" value={age ? `${age} años` : "—"} />
                <Field label="Ciudad" value={person?.city} />
                <Field label="Provincia" value={person?.province} />
              </dl>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(["first_name","last_name","email","phone","dni","city","province"] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-xs uppercase tracking-wider">{k}</Label>
                    <Input value={editPerson[k] ?? ""} onChange={(e) => setEditPerson((s) => ({ ...s, [k]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base uppercase tracking-wider">Marcado como</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={p.attendee_type} onValueChange={(v) => setAttendeeType(v as Attendee)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATTENDEE_TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">Cambia el tipo (VIP, prensa, staff…) en cualquier momento.</div>
            <div className="pt-2 border-t">
              <Label className="text-xs uppercase tracking-wider">Cambio manual de estado</Label>
              <Select value={p.status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTICIPANT_STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Photo + submission */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Inscripción</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
            <div className="sm:col-span-1">
              {photoUrl ? (
                <img src={photoUrl} alt="Foto" className="rounded-md border w-full aspect-square object-cover" />
              ) : (
                <div className="rounded-md border-2 border-dashed aspect-square flex items-center justify-center text-muted-foreground text-xs">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
            </div>
            <dl className="sm:col-span-2 grid gap-2">
              <Field label="Fecha solicitud" value={new Date(p.created_at).toLocaleString("es-ES")} />
              <Field label="Acompañantes" value={String(p.companions_count)} />
              <Field label="Aprobado" value={p.approved_at ? new Date(p.approved_at).toLocaleString("es-ES") : "—"} />
              <Field label="Confirmado" value={p.confirmed_at ? new Date(p.confirmed_at).toLocaleString("es-ES") : "—"} />
              {payload.instagram ? <Field label="Instagram" value={String(payload.instagram)} /> : null}
              {payload.notes ? <Field label="Notas del solicitante" value={String(payload.notes)} /> : null}
            </dl>
            {companions.length > 0 && (
              <div className="sm:col-span-3 border-t pt-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Acompañantes registrados</div>
                <ul className="space-y-1">
                  {companions.map((c) => (
                    <li key={c.id} className="text-sm">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Sin nombre"}
                      {c.dni && <span className="text-muted-foreground"> · DNI {c.dni}</span>}
                      {c.age && <span className="text-muted-foreground"> · {c.age} años</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Consentimientos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ConsentRow label="Privacidad" record={consentByKind("privacidad")} />
            <ConsentRow label="Imagen" record={consentByKind("imagen")} />
            <ConsentRow label="Futuros procesos" record={consentByKind("futuros_procesos")} />
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Notas internas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {p.internal_notes && (
              <pre className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md border">{p.internal_notes}</pre>
            )}
            <div className="flex gap-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Añadir una nota interna…" rows={2} />
              <Button onClick={addNote} disabled={!notes.trim() || updateParticipant.isPending}>Añadir</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <SendCommunicationDialog
        open={commOpen}
        onOpenChange={setCommOpen}
        recipients={person ? [{
          personId: person.id,
          participantId: p.id,
          eventId: p.event_id,
          sessionId: p.session_id,
          name: `${person.first_name} ${person.last_name ?? ""}`.trim(),
          email: person.email,
          phone: person.phone,
          context: {
            apellidos: person.last_name,
            evento: p.events?.name ?? null,
            sesion: p.event_sessions?.name ?? null,
            fecha: p.event_sessions ? new Date(p.event_sessions.starts_at).toLocaleString("es-ES") : null,
          },
        } satisfies CommRecipient] : []}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

type ConsentRecord = {
  accepted: boolean;
  accepted_at: string;
  legal_texts: { version: string; title?: string | null; kind?: string | null } | null;
};

function ConsentRow({ label, record }: { label: string; record: ConsentRecord | undefined }) {
  if (!record) return (
    <div className="flex items-center justify-between border-b last:border-0 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">Sin registro</span>
    </div>
  );
  return (
    <div className="flex items-center justify-between border-b last:border-0 py-1.5">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        {record.accepted ? (
          <Badge className="text-[10px] uppercase">Aceptado</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] uppercase">Rechazado</Badge>
        )}
        <span className="text-xs text-muted-foreground">v{record.legal_texts?.version ?? "—"}</span>
      </div>
    </div>
  );
}

// Silence unused warning
void AlertCircle;