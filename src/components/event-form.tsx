import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  EVENT_TYPE_OPTIONS,
  EVENT_STATUS_OPTIONS,
  COMPANIONS_QR_MODE_OPTIONS,
  slugify,
  type CompanionsQrMode,
  type EventStatus,
  type EventType,
} from "@/lib/event-constants";
import { useClientsList, useUpsertEvent, type EventRow } from "@/lib/use-events";
import { FieldRequirementsEditor } from "@/components/field-requirements-editor";
import type { FieldRequirements } from "@/lib/field-requirements";

type FormState = {
  name: string;
  slug: string;
  client_id: string | null;
  event_type: EventType;
  status: EventStatus;
  description: string;
  cover_image_url: string;
  logo_url: string;
  brand_color: string;
  location_name: string;
  location_address: string;
  city: string;
  province: string;
  public_registration_enabled: boolean;
  user_can_choose_session: boolean;
  requires_approval: boolean;
  requires_confirmation: boolean;
  requires_image_consent: boolean;
  requires_recording: boolean;
  default_min_age: number;
  default_waitlist_enabled: boolean;
  default_allow_companions: boolean;
  default_max_companions: number;
  default_companions_qr_mode: CompanionsQrMode;
  general_instructions: string;
  field_requirements: FieldRequirements;
};

function initial(event?: EventRow | null): FormState {
  return {
    name: event?.name ?? "",
    slug: event?.slug ?? "",
    client_id: event?.client_id ?? null,
    event_type: (event?.event_type as EventType) ?? "publico_tv",
    status: (event?.status as EventStatus) ?? "borrador",
    description: event?.description ?? "",
    cover_image_url: event?.cover_image_url ?? "",
    logo_url: event?.logo_url ?? "",
    brand_color: event?.brand_color ?? "",
    location_name: event?.location_name ?? "",
    location_address: event?.location_address ?? "",
    city: event?.city ?? "",
    province: event?.province ?? "",
    public_registration_enabled: event?.public_registration_enabled ?? false,
    user_can_choose_session: event?.user_can_choose_session ?? false,
    requires_approval: event?.requires_approval ?? true,
    requires_confirmation: event?.requires_confirmation ?? true,
    requires_image_consent: event?.requires_image_consent ?? false,
    requires_recording: event?.requires_recording ?? false,
    default_min_age: event?.default_min_age ?? 0,
    default_waitlist_enabled: event?.default_waitlist_enabled ?? true,
    default_allow_companions: event?.default_allow_companions ?? false,
    default_max_companions: event?.default_max_companions ?? 0,
    default_companions_qr_mode: (event?.default_companions_qr_mode as CompanionsQrMode) ?? "mismo_qr",
    general_instructions: event?.general_instructions ?? "",
    field_requirements:
      (event && typeof (event as { field_requirements?: unknown }).field_requirements === "object"
        ? ((event as { field_requirements?: unknown }).field_requirements as FieldRequirements)
        : {}) ?? {},
  };
}

export function EventForm({ event }: { event?: EventRow | null }) {
  const navigate = useNavigate();
  const [s, setS] = useState<FormState>(() => initial(event));
  const [slugTouched, setSlugTouched] = useState(!!event?.slug);
  const { data: clients = [] } = useClientsList();
  const upsert = useUpsertEvent();

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((p) => ({ ...p, [k]: v }));

  const saveEvent = async () => {
    if (!s.name.trim()) {
      toast.error("El nombre del evento es obligatorio");
      return;
    }
    try {
      const payload = {
        ...s,
        slug: s.slug || slugify(s.name),
        client_id: s.client_id || null,
        cover_image_url: s.cover_image_url || null,
        logo_url: s.logo_url || null,
        brand_color: s.brand_color || null,
        description: s.description || null,
        location_name: s.location_name || null,
        location_address: s.location_address || null,
        city: s.city || null,
        province: s.province || null,
        general_instructions: s.general_instructions || null,
        field_requirements: s.field_requirements ?? {},
      };
      const saved = await upsert.mutateAsync({ id: event?.id, values: payload });
      toast.success(event ? "Evento actualizado" : "Evento creado");
      navigate({ to: "/eventos/$eventId", params: { eventId: saved.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error guardando el evento");
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await saveEvent();
  };

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 max-w-5xl">
      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Identidad</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nombre *</Label>
            <Input value={s.name} onChange={(e) => {
              update("name", e.target.value);
              if (!slugTouched) update("slug", slugify(e.target.value));
            }} maxLength={200} required />
          </div>
          <div>
            <Label>Slug público</Label>
            <Input value={s.slug} onChange={(e) => { setSlugTouched(true); update("slug", slugify(e.target.value)); }} placeholder="ej: gran-hermano-2026" />
          </div>
          <div>
            <Label>Cliente / Productora</Label>
            <Select value={s.client_id ?? "none"} onValueChange={(v) => update("client_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de evento</Label>
            <Select value={s.event_type} onValueChange={(v) => update("event_type", v as EventType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={s.status} onValueChange={(v) => update("status", v as EventStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Descripción</Label>
            <Textarea value={s.description} onChange={(e) => update("description", e.target.value)} rows={3} maxLength={2000} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Branding</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>URL imagen de portada</Label>
            <Input value={s.cover_image_url} onChange={(e) => update("cover_image_url", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label>URL logo del evento</Label>
            <Input value={s.logo_url} onChange={(e) => update("logo_url", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label>Color principal</Label>
            <div className="flex gap-2 items-center">
              <Input type="color" value={s.brand_color || "#E03030"} onChange={(e) => update("brand_color", e.target.value)} className="h-10 w-16 p-1" />
              <Input value={s.brand_color} onChange={(e) => update("brand_color", e.target.value)} placeholder="#E03030" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Ubicación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Ubicación (nombre)</Label>
            <Input value={s.location_name} onChange={(e) => update("location_name", e.target.value)} placeholder="Estudios Picasso, Plató 3…" />
          </div>
          <div>
            <Label>Dirección</Label>
            <Input value={s.location_address} onChange={(e) => update("location_address", e.target.value)} />
          </div>
          <div>
            <Label>Ciudad</Label>
            <Input value={s.city} onChange={(e) => update("city", e.target.value)} />
          </div>
          <div>
            <Label>Provincia</Label>
            <Input value={s.province} onChange={(e) => update("province", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Inscripción y aprobación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <SwitchRow label="Inscripción pública activa" hint="Permite recibir solicitudes vía formulario" value={s.public_registration_enabled} onChange={(v) => update("public_registration_enabled", v)} />
          <SwitchRow label="El usuario puede elegir sesión" value={s.user_can_choose_session} onChange={(v) => update("user_can_choose_session", v)} />
          <SwitchRow label="Requiere aprobación" value={s.requires_approval} onChange={(v) => update("requires_approval", v)} />
          <SwitchRow label="Requiere confirmación del asistente" value={s.requires_confirmation} onChange={(v) => update("requires_confirmation", v)} />
          <SwitchRow label="Hay grabación / cámaras" value={s.requires_recording} onChange={(v) => update("requires_recording", v)} />
          <SwitchRow label="Requiere consentimiento de imagen" hint="Si está activo, el formulario lo pedirá" value={s.requires_image_consent} onChange={(v) => update("requires_image_consent", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Reglas por defecto de sesiones</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Edad mínima por defecto</Label>
            <Input type="number" min={0} max={120} value={s.default_min_age} onChange={(e) => update("default_min_age", Number(e.target.value))} />
          </div>
          <SwitchRow label="Lista de espera por defecto" value={s.default_waitlist_enabled} onChange={(v) => update("default_waitlist_enabled", v)} />
          <SwitchRow label="Acompañantes por defecto" value={s.default_allow_companions} onChange={(v) => update("default_allow_companions", v)} />
          <div>
            <Label>Máximo acompañantes por defecto</Label>
            <Input type="number" min={0} max={20} value={s.default_max_companions} onChange={(e) => update("default_max_companions", Number(e.target.value))} />
          </div>
          <div className="md:col-span-2">
            <Label>Modo QR acompañantes por defecto</Label>
            <Select value={s.default_companions_qr_mode} onValueChange={(v) => update("default_companions_qr_mode", v as CompanionsQrMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPANIONS_QR_MODE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Instrucciones generales</Label>
            <Textarea value={s.general_instructions} onChange={(e) => update("general_instructions", e.target.value)} rows={4} maxLength={3000} placeholder="Información para el asistente: vestimenta, llegada, restricciones…" />
          </div>
        </CardContent>
      </Card>

      <FieldRequirementsEditor
        value={s.field_requirements}
        onChange={(v) => update("field_requirements", v)}
      />

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 -mx-4 px-4 border-t">
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/eventos" })}>Cancelar</Button>
        <Button type="button" onClick={saveEvent} disabled={upsert.isPending} className="uppercase tracking-wider">
          {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {event ? "Guardar cambios" : "Crear evento"}
        </Button>
      </div>
    </form>
  );
}

function SwitchRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border rounded-md p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}