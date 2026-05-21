import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  SESSION_STATUS_OPTIONS,
  COMPANIONS_QR_MODE_OPTIONS,
  toDateTimeLocal,
  fromDateTimeLocal,
  type CompanionsQrMode,
  type SessionStatus,
} from "@/lib/event-constants";
import {
  useUpsertSession,
  type EventRow,
  type SessionRow,
} from "@/lib/use-events";
import { FieldRequirementsEditor } from "@/components/field-requirements-editor";
import type { FieldRequirements } from "@/lib/field-requirements";

type FormState = {
  name: string;
  description: string;
  doors_open_at: string;
  starts_at: string;
  ends_at: string;
  location_name: string;
  location_address: string;
  capacity: number;
  max_validators: number;
  public_form_enabled: boolean;
  user_selectable: boolean;
  waitlist_enabled: boolean;
  allow_companions: boolean;
  max_companions_per_participant: number;
  companions_qr_mode: CompanionsQrMode;
  min_age: number;
  specific_instructions: string;
  status: SessionStatus;
  inherit_event_fields: boolean;
  field_requirements: FieldRequirements;
};

function initial(event: EventRow, session?: SessionRow | null): FormState {
  return {
    name: session?.name ?? "",
    description: session?.description ?? "",
    doors_open_at: toDateTimeLocal(session?.doors_open_at),
    starts_at: toDateTimeLocal(session?.starts_at),
    ends_at: toDateTimeLocal(session?.ends_at),
    location_name: session?.location_name ?? event.location_name ?? "",
    location_address: session?.location_address ?? event.location_address ?? "",
    capacity: session?.capacity ?? 0,
    max_validators: session?.max_validators ?? 1,
    public_form_enabled: session?.public_form_enabled ?? event.public_registration_enabled ?? false,
    user_selectable: session?.user_selectable ?? event.user_can_choose_session ?? true,
    waitlist_enabled: session?.waitlist_enabled ?? event.default_waitlist_enabled ?? true,
    allow_companions: session?.allow_companions ?? event.default_allow_companions ?? false,
    max_companions_per_participant: session?.max_companions_per_participant ?? event.default_max_companions ?? 0,
    companions_qr_mode: (session?.companions_qr_mode as CompanionsQrMode) ?? (event.default_companions_qr_mode as CompanionsQrMode) ?? "mismo_qr",
    min_age: session?.min_age ?? event.default_min_age ?? 0,
    specific_instructions: session?.specific_instructions ?? "",
    status: (session?.status as SessionStatus) ?? "programada",
    inherit_event_fields:
      session && typeof session.inherit_event_fields === "boolean" ? session.inherit_event_fields : true,
    field_requirements:
      (session && typeof (session as { field_requirements?: unknown }).field_requirements === "object"
        ? ((session as { field_requirements?: unknown }).field_requirements as FieldRequirements)
        : {}) ?? {},
  };
}

export function SessionForm({ event, session }: { event: EventRow; session?: SessionRow | null }) {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [s, setS] = useState<FormState>(() => initial(event, session));
  const upsert = useUpsertSession();
  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((p) => ({ ...p, [k]: v }));

  const saveSession = async () => {
    const form = formRef.current;
    const currentName = (form?.elements.namedItem("name") as HTMLInputElement | null)?.value ?? s.name;
    const currentStartsAt = (form?.elements.namedItem("starts_at") as HTMLInputElement | null)?.value ?? s.starts_at;
    const currentCapacity = Number((form?.elements.namedItem("capacity") as HTMLInputElement | null)?.value ?? s.capacity);
    if (!currentName.trim()) return toast.error("El nombre de la sesión es obligatorio");
    if (!currentStartsAt) return toast.error("La fecha y hora de inicio es obligatoria");
    if (!currentCapacity || currentCapacity <= 0) return toast.error("El aforo debe ser mayor que cero");
    try {
      const payload = {
        event_id: event.id,
        name: currentName.trim(),
        description: s.description || null,
        doors_open_at: fromDateTimeLocal(s.doors_open_at),
        starts_at: fromDateTimeLocal(currentStartsAt)!,
        ends_at: fromDateTimeLocal(s.ends_at),
        location_name: s.location_name || null,
        location_address: s.location_address || null,
        capacity: currentCapacity,
        max_validators: s.max_validators,
        public_form_enabled: s.public_form_enabled,
        user_selectable: s.user_selectable,
        waitlist_enabled: s.waitlist_enabled,
        allow_companions: s.allow_companions,
        max_companions_per_participant: s.allow_companions ? s.max_companions_per_participant : 0,
        companions_qr_mode: s.companions_qr_mode,
        min_age: s.min_age,
        specific_instructions: s.specific_instructions || null,
        status: s.status,
        inherit_event_fields: s.inherit_event_fields,
        field_requirements: s.inherit_event_fields ? {} : (s.field_requirements ?? {}),
      };
      await upsert.mutateAsync({ id: session?.id, values: payload });
      toast.success(session ? "Sesión actualizada" : "Sesión creada");
      navigate({ to: "/eventos/$eventId", params: { eventId: event.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error guardando la sesión");
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await saveSession();
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-6 max-w-5xl">
      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Datos generales</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nombre *</Label>
            <Input name="name" value={s.name} onChange={(e) => update("name", e.target.value)} required maxLength={200} placeholder="Sesión 1 — Mañana" />
          </div>
          <div className="md:col-span-2">
            <Label>Descripción</Label>
            <Textarea value={s.description} onChange={(e) => update("description", e.target.value)} rows={2} maxLength={1000} />
          </div>
          <div>
            <Label>Hora de convocatoria / acceso</Label>
            <Input type="datetime-local" value={s.doors_open_at} onChange={(e) => update("doors_open_at", e.target.value)} />
          </div>
          <div>
            <Label>Hora de inicio *</Label>
            <Input name="starts_at" type="datetime-local" value={s.starts_at} onChange={(e) => update("starts_at", e.target.value)} required />
          </div>
          <div>
            <Label>Hora aproximada de fin</Label>
            <Input type="datetime-local" value={s.ends_at} onChange={(e) => update("ends_at", e.target.value)} />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={s.status} onValueChange={(v) => update("status", v as SessionStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SESSION_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Ubicación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Ubicación</Label>
            <Input value={s.location_name} onChange={(e) => update("location_name", e.target.value)} />
          </div>
          <div>
            <Label>Dirección</Label>
            <Input value={s.location_address} onChange={(e) => update("location_address", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Aforo y validación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Aforo *</Label>
            <Input name="capacity" type="number" min={1} value={s.capacity} onChange={(e) => update("capacity", Number(e.target.value))} required />
          </div>
          <div>
            <Label>Máximo de validadores</Label>
            <Input type="number" min={1} value={s.max_validators} onChange={(e) => update("max_validators", Number(e.target.value))} />
          </div>
          <div>
            <Label>Edad mínima</Label>
            <Input type="number" min={0} max={120} value={s.min_age} onChange={(e) => update("min_age", Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Inscripción</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SwitchRow label="Formulario público activo" value={s.public_form_enabled} onChange={(v) => update("public_form_enabled", v)} />
          <SwitchRow label="Seleccionable por el usuario" value={s.user_selectable} onChange={(v) => update("user_selectable", v)} />
          <SwitchRow label="Lista de espera" value={s.waitlist_enabled} onChange={(v) => update("waitlist_enabled", v)} />
          <SwitchRow label="Permitir acompañantes" value={s.allow_companions} onChange={(v) => update("allow_companions", v)} />
          {s.allow_companions && (
            <>
              <div>
                <Label>Máximo acompañantes</Label>
                <Input type="number" min={0} max={20} value={s.max_companions_per_participant} onChange={(e) => update("max_companions_per_participant", Number(e.target.value))} />
              </div>
              <div>
                <Label>Modo QR acompañantes</Label>
                <Select value={s.companions_qr_mode} onValueChange={(v) => update("companions_qr_mode", v as CompanionsQrMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPANIONS_QR_MODE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <Label>Instrucciones específicas</Label>
            <Textarea value={s.specific_instructions} onChange={(e) => update("specific_instructions", e.target.value)} rows={3} maxLength={2000} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Requisitos de campos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <SwitchRow
            label="Heredar campos y requisitos del evento"
            value={s.inherit_event_fields}
            onChange={(v) => update("inherit_event_fields", v)}
          />
          {!s.inherit_event_fields && (
            <FieldRequirementsEditor
              value={s.field_requirements}
              onChange={(v) => update("field_requirements", v)}
            />
          )}
          {s.inherit_event_fields && (
            <p className="text-xs text-muted-foreground">
              Esta sesión usa la configuración de campos del evento. Desactiva el interruptor para personalizar.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 -mx-4 px-4 border-t">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/eventos/$eventId", params: { eventId: event.id } })}>Cancelar</Button>
        <Button type="button" onClick={saveSession} disabled={upsert.isPending} className="uppercase tracking-wider">
          {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {session ? "Guardar cambios" : "Crear sesión"}
        </Button>
      </div>
    </form>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border rounded-md p-3">
      <div className="text-sm font-medium">{label}</div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}