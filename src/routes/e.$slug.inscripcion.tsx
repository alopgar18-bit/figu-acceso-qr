import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { supabase } from "@/integrations/supabase/client";
import { usePublicEvent } from "@/lib/use-public-event";
import { submitPublicForm } from "@/lib/public-forms.functions";

export const Route = createFileRoute("/e/$slug/inscripcion")({
  component: Page,
  head: ({ params }) => ({
    meta: [
      { title: `Inscripción · ${params.slug} · FIGURARTE` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type State = {
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  phone: string;
  birthDate: string;
  socialMedia: string;
  sessionId: string;
  city: string;
  province: string;
  gender: string;
  profession: string;
  notes: string;
  specialNeeds: string;
  companionsCount: number;
  acceptPrivacy: boolean;
  acceptAttendance: boolean;
  acceptImage: boolean;
  acceptFuture: boolean;
};

const INITIAL: State = {
  firstName: "", lastName: "", dni: "", email: "", phone: "", birthDate: "",
  socialMedia: "", sessionId: "", city: "", province: "", gender: "",
  profession: "", notes: "", specialNeeds: "", companionsCount: 0,
  acceptPrivacy: false, acceptAttendance: false, acceptImage: false, acceptFuture: false,
};

function calcAge(birth: string): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function Page() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = usePublicEvent(slug);
  const submit = useServerFn(submitPublicForm);

  const [state, setState] = useState<State>(INITIAL);
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectableSessions = useMemo(
    () => (data?.sessions ?? []).filter(
      (s) => s.user_selectable && s.status !== "cerrada" && s.status !== "cancelada" && s.status !== "completada",
    ),
    [data],
  );

  if (isLoading) return <PublicShell><Skeleton className="h-96" /></PublicShell>;
  if (!data) {
    return (
      <PublicShell>
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold mb-3">Error 404</div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Evento no encontrado</h1>
        <p className="mt-4 text-muted-foreground">
          El enlace <code className="font-mono text-foreground">/e/{slug}</code> no corresponde a ningún evento.
        </p>
        <div className="mt-8">
          <Button asChild variant="outline"><Link to="/">Volver al inicio</Link></Button>
        </div>
      </PublicShell>
    );
  }
  if (data.closed) return <Navigate to="/e/$slug/cerrado" params={{ slug }} />;

  const { event, sessions } = data;
  if (!event.public_registration_enabled || sessions.length === 0) {
    return <Navigate to="/e/$slug/cerrado" params={{ slug }} />;
  }

  const userCanChoose = event.user_can_choose_session;
  const targetSession = userCanChoose
    ? selectableSessions.find((s) => s.id === state.sessionId)
    : sessions[0];
  const minAge = (targetSession?.min_age || event.default_min_age || 0);
  const allowCompanions = (targetSession?.allow_companions ?? event.default_allow_companions) ?? false;
  const maxCompanions = targetSession?.max_companions_per_participant ?? event.default_max_companions ?? 0;
  const imageRequired = event.requires_image_consent || event.requires_recording;
  const computedAge = calcAge(state.birthDate);
  const ageBlocked = computedAge !== null && minAge > 0 && computedAge < minAge;

  const update = <K extends keyof State>(k: K, v: State[K]) => setState((s) => ({ ...s, [k]: v }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (photo && photo.size > 5 * 1024 * 1024) { toast.error("La foto debe pesar menos de 5 MB."); return; }
    if (userCanChoose && !state.sessionId) { toast.error("Selecciona una sesión."); return; }
    if (!state.acceptPrivacy || !state.acceptAttendance) { toast.error("Debes aceptar los consentimientos obligatorios."); return; }
    if (imageRequired && !state.acceptImage) { toast.error("Este evento requiere consentimiento de imagen."); return; }
    if (ageBlocked) { toast.error(`Edad mínima requerida: ${minAge} años.`); return; }

    setSubmitting(true);
    try {
      // 1. Upload photo (optional)
      let path: string | undefined;
      if (photo) {
        const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
        path = `${event.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("submission-photos")
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (upErr) throw new Error("No se pudo subir la foto: " + upErr.message);
      }

      // 2. Submit form
      const result = await submit({
        data: {
          slug,
          sessionId: userCanChoose ? state.sessionId : undefined,
          firstName: state.firstName,
          lastName: state.lastName,
          dni: state.dni,
          email: state.email,
          phone: state.phone,
          birthDate: state.birthDate,
          photoPath: path,
          socialMedia: state.socialMedia,
          city: state.city || null,
          province: state.province || null,
          gender: state.gender || null,
          profession: state.profession || null,
          notes: state.notes || null,
          specialNeeds: state.specialNeeds || null,
          companionsCount: state.companionsCount,
          acceptPrivacy: true,
          acceptAttendance: true,
          acceptImage: state.acceptImage,
          acceptFuture: state.acceptFuture,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
        },
      });

      if (!result.ok) {
        if (result.code === "sesion_completa") {
          navigate({ to: "/e/$slug/completo", params: { slug } });
        } else if (result.code === "inscripciones_cerradas" || result.code === "evento_no_disponible") {
          navigate({ to: "/e/$slug/cerrado", params: { slug } });
        } else if (result.code === "duplicado") {
          toast.error("Ya existe una solicitud para esta sesión con tus datos.");
        } else if (result.code === "edad_minima_no_cumplida") {
          toast.error(`Edad mínima requerida: ${result.minAge} años.`);
        } else {
          toast.error("No se pudo enviar la solicitud: " + result.code);
        }
        return;
      }
      navigate({
        to: "/e/$slug/gracias",
        params: { slug },
        search: result.code === "lista_espera" ? { waitlist: true } : {},
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell brandColor={event.brand_color}>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
        <Link to="/e/$slug" params={{ slug }}><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link>
      </Button>
      <div className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-2">Inscripción</div>
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">{event.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Completa el formulario. Los campos marcados con * son obligatorios.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {userCanChoose && (
          <Card>
            <CardHeader><CardTitle className="text-base uppercase tracking-wider">Sesión</CardTitle></CardHeader>
            <CardContent>
              <Label htmlFor="session">Selecciona la sesión a la que quieres asistir *</Label>
              <Select value={state.sessionId} onValueChange={(v) => update("sessionId", v)}>
                <SelectTrigger id="session" className="mt-2"><SelectValue placeholder="Selecciona una sesión" /></SelectTrigger>
                <SelectContent>
                  {selectableSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {new Date(s.starts_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectableSessions.length === 0 && (
                <p className="text-sm text-destructive mt-2">No hay sesiones disponibles en este momento.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Datos personales</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre *"><Input required maxLength={100} value={state.firstName} onChange={(e) => update("firstName", e.target.value)} /></Field>
            <Field label="Apellidos *"><Input required maxLength={150} value={state.lastName} onChange={(e) => update("lastName", e.target.value)} /></Field>
            <Field label="DNI / NIE / Pasaporte"><Input maxLength={20} value={state.dni} onChange={(e) => update("dni", e.target.value.toUpperCase())} /></Field>
            <Field label="Email *"><Input required type="email" maxLength={255} value={state.email} onChange={(e) => update("email", e.target.value)} /></Field>
            <Field label="Teléfono"><Input type="tel" maxLength={30} value={state.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
            <Field label="Fecha de nacimiento">
              <Input type="date" max={new Date().toISOString().slice(0, 10)} value={state.birthDate} onChange={(e) => update("birthDate", e.target.value)} />
              {computedAge !== null && (
                <p className={"text-xs mt-1 " + (ageBlocked ? "text-destructive" : "text-muted-foreground")}>
                  Edad: {computedAge} años {minAge > 0 && `· edad mínima ${minAge}`}
                </p>
              )}
            </Field>
            <Field label="Género"><Input maxLength={40} value={state.gender} onChange={(e) => update("gender", e.target.value)} /></Field>
            <Field label="Profesión"><Input maxLength={150} value={state.profession} onChange={(e) => update("profession", e.target.value)} /></Field>
            <Field label="Ciudad"><Input maxLength={120} value={state.city} onChange={(e) => update("city", e.target.value)} /></Field>
            <Field label="Provincia"><Input maxLength={120} value={state.province} onChange={(e) => update("province", e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Material y redes</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Foto reciente (JPG/PNG/WebP, máx. 5 MB)">
              <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Redes sociales (Instagram, TikTok…)">
              <Textarea maxLength={500} value={state.socialMedia} onChange={(e) => update("socialMedia", e.target.value)} placeholder="@usuario, enlaces…" rows={2} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Información adicional</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {allowCompanions && maxCompanions > 0 && (
              <Field label={`Acompañantes (máx. ${maxCompanions})`}>
                <Input type="number" min={0} max={maxCompanions} value={state.companionsCount} onChange={(e) => update("companionsCount", Math.min(maxCompanions, Math.max(0, Number(e.target.value))))} />
              </Field>
            )}
            <Field label="Necesidades especiales o accesibilidad">
              <Textarea maxLength={1000} value={state.specialNeeds} onChange={(e) => update("specialNeeds", e.target.value)} rows={2} />
            </Field>
            <Field label="Observaciones">
              <Textarea maxLength={1000} value={state.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Consentimientos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ConsentRow checked={state.acceptPrivacy} onChange={(v) => update("acceptPrivacy", v)}>
              He leído y acepto la{" "}
              <Link to="/privacidad" target="_blank" className="underline text-primary">política de privacidad</Link>
              {" "}y el tratamiento de mis datos personales por FIGURARTE. *
            </ConsentRow>
            <ConsentRow checked={state.acceptAttendance} onChange={(v) => update("acceptAttendance", v)}>
              Confirmo mi compromiso de asistencia y participación si soy seleccionado/a. *
            </ConsentRow>
            {imageRequired && (
              <ConsentRow checked={state.acceptImage} onChange={(v) => update("acceptImage", v)}>
                Autorizo la captación, grabación y difusión de mi imagen y voz en el contexto de este evento. *
              </ConsentRow>
            )}
            <Separator />
            <ConsentRow checked={state.acceptFuture} onChange={(v) => update("acceptFuture", v)}>
              Quiero recibir información sobre futuros castings y eventos de FIGURARTE.
            </ConsentRow>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={submitting} className="uppercase tracking-wider">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar solicitud
          </Button>
        </div>
      </form>
    </PublicShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ConsentRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}