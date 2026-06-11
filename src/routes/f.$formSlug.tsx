import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
import { getPublicFormBySlug } from "@/lib/forms.functions";
import { submitPublicFormBySlug } from "@/lib/public-forms.functions";
import { attendeeLabel } from "@/lib/participant-constants";

export const Route = createFileRoute("/f/$formSlug")({
  component: Page,
  head: ({ params }) => ({
    meta: [
      { title: `Inscripción · ${params.formSlug} · FIGURARTE` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type State = {
  firstName: string; lastName: string; dni: string; email: string; phone: string;
  birthDate: string; socialMedia: string; sessionId: string;
  city: string; province: string; gender: string; profession: string;
  notes: string; specialNeeds: string; companionsCount: number;
  companions: Array<{ firstName: string; lastName: string; email: string; phone: string }>;
  acceptPrivacy: boolean; acceptAttendance: boolean; acceptImage: boolean; acceptFuture: boolean;
};

const INITIAL: State = {
  firstName: "", lastName: "", dni: "", email: "", phone: "", birthDate: "",
  socialMedia: "", sessionId: "", city: "", province: "", gender: "",
  profession: "", notes: "", specialNeeds: "", companionsCount: 0,
  companions: [],
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
  const { formSlug } = Route.useParams();
  const navigate = useNavigate();
  const getForm = useServerFn(getPublicFormBySlug);
  const submit = useServerFn(submitPublicFormBySlug);

  const { data: result, isLoading } = useQuery({
    queryKey: ["public-form", formSlug],
    queryFn: () => getForm({ data: { slug: formSlug } }),
  });

  const [state, setState] = useState<State>(INITIAL);
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState<Record<string, boolean>>({});
  const [openPrivacy, setOpenPrivacy] = useState<string | null>(null);

  const selectableSessions = useMemo(() => {
    if (!result?.ok) return [];
    return result.sessions.filter(
      (s) => s.user_selectable && s.status !== "cerrada" && s.status !== "cancelada" && s.status !== "completada",
    );
  }, [result]);

  if (isLoading) return <PublicShell><Skeleton className="h-96" /></PublicShell>;

  if (!result || !result.ok) {
    const msg: Record<string, string> = {
      no_existe: "Este formulario no existe o ya no está disponible.",
      no_publicado: "Este formulario aún no está publicado.",
      no_abierto: "Este formulario todavía no está abierto.",
      cerrado: "Las inscripciones de este formulario han cerrado.",
    };
    return (
      <PublicShell>
        <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold mb-3">No disponible</div>
        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Formulario no disponible</h1>
        <p className="mt-4 text-muted-foreground">{msg[(result?.code as string) ?? "no_existe"] ?? "No disponible."}</p>
        <div className="mt-8">
          <Button asChild variant="outline"><Link to="/">Volver al inicio</Link></Button>
        </div>
      </PublicShell>
    );
  }

  const { form, event, sessions } = result;
  const privacyTexts = result.privacyTexts ?? [];
  const fieldCfg = (form.field_config ?? {}) as Record<string, { visible?: boolean; required?: boolean }>;
  const showField = (key: string) => fieldCfg[key]?.visible !== false;
  const reqField = (key: string) => fieldCfg[key]?.required === true;
  const userCanChoose = !form.session_id && event.user_can_choose_session;
  const targetSession = form.session_id
    ? sessions.find((s) => s.id === form.session_id)
    : userCanChoose
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
    if (!state.acceptAttendance) { toast.error("Debes aceptar los consentimientos obligatorios."); return; }
    if (privacyTexts.length > 0) {
      const allOk = privacyTexts.every((t) => privacyAccepted[t.id]);
      if (!allOk) { toast.error("Debes aceptar todas las políticas de privacidad."); return; }
    } else if (!state.acceptPrivacy) {
      toast.error("Debes aceptar la política de privacidad."); return;
    }
    if (imageRequired && !state.acceptImage) { toast.error("Este evento requiere consentimiento de imagen."); return; }
    if (ageBlocked) { toast.error(`Edad mínima requerida: ${minAge} años.`); return; }

    setSubmitting(true);
    try {
      let path: string | undefined;
      if (photo) {
        const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
        path = `${event.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("submission-photos")
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (upErr) throw new Error("No se pudo subir la foto: " + upErr.message);
      }

      const res = await submit({
        data: {
          formSlug,
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
          companions: state.companions.slice(0, state.companionsCount),
          acceptPrivacy: true,
          acceptAttendance: true,
          acceptImage: state.acceptImage,
          acceptFuture: state.acceptFuture,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
        },
      });

      if (!res.ok) {
        if (res.code === "sesion_completa") {
          navigate({ to: "/e/$slug/completo", params: { slug: event.slug } });
        } else if (res.code === "inscripciones_cerradas" || res.code === "evento_no_disponible") {
          navigate({ to: "/e/$slug/cerrado", params: { slug: event.slug } });
        } else if (res.code === "duplicado") {
          toast.error("Ya existe una solicitud para esta sesión con tus datos.");
        } else if (res.code === "edad_minima_no_cumplida") {
          toast.error(`Edad mínima requerida: ${(res as { minAge?: number }).minAge ?? minAge} años.`);
        } else {
          toast.error("No se pudo enviar la solicitud: " + res.code);
        }
        return;
      }
      navigate({
        to: "/e/$slug/gracias",
        params: { slug: event.slug },
        search: res.code === "lista_espera" ? { waitlist: true } : {},
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicShell brandColor={event.brand_color}>
      {form.header_image_url && (
        <img
          src={form.header_image_url}
          alt=""
          className="w-full h-48 md:h-64 object-cover rounded-lg mb-6"
        />
      )}
      <div className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-2">
        {form.title} · {attendeeLabel(form.attendee_type)}
      </div>
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">{event.name}</h1>
      {form.intro_text ? (
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">{form.intro_text}</p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Completa el formulario. Los campos marcados con * son obligatorios.
        </p>
      )}

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
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Datos personales</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre *"><Input required maxLength={100} value={state.firstName} onChange={(e) => update("firstName", e.target.value)} /></Field>
            <Field label="Apellidos *"><Input required maxLength={150} value={state.lastName} onChange={(e) => update("lastName", e.target.value)} /></Field>
            {showField("dni") && (
              <Field label={`DNI / NIE / Pasaporte${reqField("dni") ? " *" : ""}`}>
                <Input required={reqField("dni")} maxLength={20} value={state.dni} onChange={(e) => update("dni", e.target.value.toUpperCase())} />
              </Field>
            )}
            <Field label="Email *"><Input required type="email" maxLength={255} value={state.email} onChange={(e) => update("email", e.target.value)} /></Field>
            {showField("phone") && (
              <Field label={`Teléfono${reqField("phone") ? " *" : ""}`}>
                <Input required={reqField("phone")} type="tel" maxLength={30} value={state.phone} onChange={(e) => update("phone", e.target.value)} />
              </Field>
            )}
            {showField("birthDate") && (
              <Field label={`Fecha de nacimiento${reqField("birthDate") ? " *" : ""}`}>
                <Input required={reqField("birthDate")} type="date" max={new Date().toISOString().slice(0, 10)} value={state.birthDate} onChange={(e) => update("birthDate", e.target.value)} />
                {computedAge !== null && (
                  <p className={"text-xs mt-1 " + (ageBlocked ? "text-destructive" : "text-muted-foreground")}>
                    Edad: {computedAge} años {minAge > 0 && `· edad mínima ${minAge}`}
                  </p>
                )}
              </Field>
            )}
            {showField("gender") && (
              <Field label={`Género${reqField("gender") ? " *" : ""}`}><Input required={reqField("gender")} maxLength={40} value={state.gender} onChange={(e) => update("gender", e.target.value)} /></Field>
            )}
            {showField("profession") && (
              <Field label={`Profesión${reqField("profession") ? " *" : ""}`}><Input required={reqField("profession")} maxLength={150} value={state.profession} onChange={(e) => update("profession", e.target.value)} /></Field>
            )}
            {showField("city") && (
              <Field label={`Ciudad${reqField("city") ? " *" : ""}`}><Input required={reqField("city")} maxLength={120} value={state.city} onChange={(e) => update("city", e.target.value)} /></Field>
            )}
            {showField("province") && (
              <Field label={`Provincia${reqField("province") ? " *" : ""}`}><Input required={reqField("province")} maxLength={120} value={state.province} onChange={(e) => update("province", e.target.value)} /></Field>
            )}
          </CardContent>
        </Card>

        {(showField("photo") || showField("socialMedia")) && (
          <Card>
            <CardHeader><CardTitle className="text-base uppercase tracking-wider">Material y redes</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              {showField("photo") && (
                <Field label="Foto reciente (JPG/PNG/WebP, máx. 5 MB)">
                  <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                </Field>
              )}
              {showField("socialMedia") && (
                <Field label="Redes sociales (Instagram, TikTok…)">
                  <Textarea maxLength={500} value={state.socialMedia} onChange={(e) => update("socialMedia", e.target.value)} placeholder="@usuario, enlaces…" rows={2} />
                </Field>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Información adicional</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {allowCompanions && maxCompanions > 0 && (
              <>
                <Field label={`Nº de acompañantes (máx. ${maxCompanions})`}>
                  <Input type="number" min={0} max={maxCompanions} value={state.companionsCount} onChange={(e) => {
                    const n = Math.min(maxCompanions, Math.max(0, Number(e.target.value) || 0));
                    setState((s) => {
                      const comps = [...s.companions];
                      while (comps.length < n) comps.push({ firstName: "", lastName: "", email: "", phone: "" });
                      comps.length = n;
                      return { ...s, companionsCount: n, companions: comps };
                    });
                  }} />
                </Field>
                {state.companions.map((c, idx) => (
                  <div key={idx} className="rounded-md border p-3 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acompañante {idx + 1}</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {showField("companion_firstName") && (
                      <Field label={`Nombre${reqField("companion_firstName") ? " *" : ""}`}>
                        <Input required={reqField("companion_firstName")} maxLength={100} value={c.firstName} onChange={(e) => {
                          const v = e.target.value;
                          setState((s) => { const a = [...s.companions]; a[idx] = { ...a[idx], firstName: v }; return { ...s, companions: a }; });
                        }} />
                      </Field>
                      )}
                      {showField("companion_lastName") && (
                      <Field label={`Apellidos${reqField("companion_lastName") ? " *" : ""}`}>
                        <Input required={reqField("companion_lastName")} maxLength={150} value={c.lastName} onChange={(e) => {
                          const v = e.target.value;
                          setState((s) => { const a = [...s.companions]; a[idx] = { ...a[idx], lastName: v }; return { ...s, companions: a }; });
                        }} />
                      </Field>
                      )}
                      {showField("companion_email") && (
                      <Field label={`Email${reqField("companion_email") ? " *" : ""}`}>
                        <Input required={reqField("companion_email")} type="email" maxLength={255} value={c.email} onChange={(e) => {
                          const v = e.target.value;
                          setState((s) => { const a = [...s.companions]; a[idx] = { ...a[idx], email: v }; return { ...s, companions: a }; });
                        }} />
                      </Field>
                      )}
                      {showField("companion_phone") && (
                      <Field label={`Teléfono${reqField("companion_phone") ? " *" : ""}`}>
                        <Input required={reqField("companion_phone")} type="tel" maxLength={30} value={c.phone} onChange={(e) => {
                          const v = e.target.value;
                          setState((s) => { const a = [...s.companions]; a[idx] = { ...a[idx], phone: v }; return { ...s, companions: a }; });
                        }} />
                      </Field>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
            {showField("specialNeeds") && (
              <Field label="Necesidades especiales o accesibilidad">
                <Textarea maxLength={1000} value={state.specialNeeds} onChange={(e) => update("specialNeeds", e.target.value)} rows={2} />
              </Field>
            )}
            {showField("notes") && (
              <Field label="Observaciones">
                <Textarea maxLength={1000} value={state.notes} onChange={(e) => update("notes", e.target.value)} rows={2} />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Consentimientos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {privacyTexts.length > 0 ? (
              privacyTexts.map((t) => (
                <div key={t.id} className="space-y-2">
                  <ConsentRow
                    checked={!!privacyAccepted[t.id]}
                    onChange={(v) => setPrivacyAccepted((p) => ({ ...p, [t.id]: v }))}
                  >
                    He leído y acepto la{" "}
                    <button
                      type="button"
                      className="underline text-primary"
                      onClick={() => setOpenPrivacy(openPrivacy === t.id ? null : t.id)}
                    >
                      {t.title}
                    </button>
                    {" "}(v{t.version}). *
                  </ConsentRow>
                  {openPrivacy === t.id && (
                    <div className="ml-7 max-h-56 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-line">
                      {t.body}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <ConsentRow checked={state.acceptPrivacy} onChange={(v) => update("acceptPrivacy", v)}>
                He leído y acepto la{" "}
                <Link to="/privacidad" target="_blank" className="underline text-primary">política de privacidad</Link>
                {" "}y el tratamiento de mis datos personales. *
              </ConsentRow>
            )}
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
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function ConsentRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 text-sm cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}