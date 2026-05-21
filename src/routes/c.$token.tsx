import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, Clock, MapPin, Users, AlertTriangle, Loader2, CheckCircle2, XCircle, Lock } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getConfirmation, confirmAttendance } from "@/lib/confirmation.functions";

export const Route = createFileRoute("/c/$token")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Confirmación de asistencia · FIGURARTE" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Companion = { first_name: string; last_name: string; dni: string };

function Page() {
  const { token } = Route.useParams();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isChildRoute = pathname !== `/c/${token}`;
  const navigate = useNavigate();
  const fetch = useServerFn(getConfirmation);
  const confirm = useServerFn(confirmAttendance);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["confirmation", token],
    queryFn: () => fetch({ data: { token } }),
    enabled: !isChildRoute,
  });

  const [companions, setCompanions] = useState<Companion[]>([]);
  const [acceptImage, setAcceptImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isChildRoute || !data?.ok) return;
    if (["qr_generado", "confirmado", "acceso_validado"].includes(data.participant.status)) {
      navigate({ to: "/c/$token/entrada", params: { token }, replace: true });
    }
  }, [data, isChildRoute, navigate, token]);

  if (isChildRoute) {
    return <Outlet />;
  }

  if (isLoading) {
    return <PublicShell><Skeleton className="h-96 w-full" /></PublicShell>;
  }

  if (!data || !data.ok) {
    return <ErrorState code={data?.code ?? "invalido"} />;
  }

  const { participant, event, session, person } = data;
  const brandColor = event.brand_color ?? null;

  // Already confirmed → show ticket directly
  if (participant.status === "qr_generado" || participant.status === "confirmado" || participant.status === "acceso_validado") {
    return (
      <PublicShell brandColor={brandColor}>
        <div className="text-center py-6">
          <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
          <h1 className="mt-4 text-3xl font-black uppercase tracking-tight">Ya has confirmado</h1>
          <p className="mt-2 text-muted-foreground">Abriendo tu entrada digital…</p>
          <Button asChild size="lg" className="mt-6 uppercase tracking-wider">
            <a href={`/c/${token}/entrada`}>Abrir entrada</a>
          </Button>
        </div>
      </PublicShell>
    );
  }

  const imageRequired = (event.requires_image_consent || event.requires_recording);
  const maxCompanions = session.allow_companions ? session.max_companions_per_participant ?? 0 : 0;

  const updateCompanion = (i: number, patch: Partial<Companion>) => {
    setCompanions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    if (imageRequired && !acceptImage) {
      toast.error("Debes aceptar el consentimiento de imagen para confirmar.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await confirm({
        data: {
          token,
          companions: companions.filter((c) => c.first_name || c.last_name || c.dni).map((c) => ({
            first_name: c.first_name || null,
            last_name: c.last_name || null,
            dni: c.dni || null,
          })),
          acceptImage: imageRequired ? acceptImage : undefined,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
        },
      });
      if (!result.ok) {
        await refetch();
        toast.error("No se pudo confirmar: " + result.code);
        return;
      }
      navigate({ to: "/c/$token/entrada", params: { token } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  const startsAt = new Date(session.starts_at);
  const doorsAt = session.doors_open_at ? new Date(session.doors_open_at) : null;

  return (
    <PublicShell brandColor={brandColor}>
      <div className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-2">Confirmación de asistencia</div>
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">{event.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Hola {person?.first_name}, tu solicitud ha sido aprobada. Por favor confirma tu asistencia.
      </p>

      <Card className="mt-8">
        <CardHeader><CardTitle className="text-base uppercase tracking-wider">Detalles de la sesión</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="Sesión" value={session.name} />
          <InfoRow icon={<Clock className="h-4 w-4" />} label="Fecha y hora" value={startsAt.toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short" })} />
          {doorsAt && <InfoRow icon={<Clock className="h-4 w-4" />} label="Apertura de puertas" value={doorsAt.toLocaleString("es-ES", { timeStyle: "short" })} />}
          {(session.location_name || event.location_name) && (
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Ubicación" value={`${session.location_name ?? event.location_name}${session.location_address || event.location_address ? ` · ${session.location_address ?? event.location_address}` : ""}`} />
          )}
          {(session.specific_instructions || event.general_instructions) && (
            <div className="pt-2 border-t text-muted-foreground whitespace-pre-line">
              {session.specific_instructions ?? event.general_instructions}
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleConfirm} className="mt-6 space-y-6">
        {maxCompanions > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base uppercase tracking-wider flex items-center gap-2">
                <Users className="h-4 w-4" /> Acompañantes (máx. {maxCompanions})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Si vas a asistir con acompañantes, indícalos a continuación. Cuentan para el aforo.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => companions.length < maxCompanions && setCompanions((c) => [...c, { first_name: "", last_name: "", dni: "" }])} disabled={companions.length >= maxCompanions}>+ Añadir acompañante</Button>
                {companions.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCompanions((c) => c.slice(0, -1))}>Quitar último</Button>
                )}
              </div>
              {companions.map((c, i) => (
                <div key={i} className="grid gap-3 md:grid-cols-3 p-3 rounded-md border">
                  <div><Label className="text-xs">Nombre</Label><Input value={c.first_name} onChange={(e) => updateCompanion(i, { first_name: e.target.value })} /></div>
                  <div><Label className="text-xs">Apellidos</Label><Input value={c.last_name} onChange={(e) => updateCompanion(i, { last_name: e.target.value })} /></div>
                  <div><Label className="text-xs">DNI</Label><Input value={c.dni} onChange={(e) => updateCompanion(i, { dni: e.target.value.toUpperCase() })} /></div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {imageRequired && (
          <Card>
            <CardHeader><CardTitle className="text-base uppercase tracking-wider">Consentimientos</CardTitle></CardHeader>
            <CardContent>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <Checkbox checked={acceptImage} onCheckedChange={(v) => setAcceptImage(v === true)} className="mt-0.5" />
                <span>Autorizo la captación, grabación y difusión de mi imagen y voz en el contexto de este evento. *</span>
              </label>
            </CardContent>
          </Card>
        )}

        <Separator />

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <Button asChild type="button" variant="outline" className="uppercase tracking-wider">
            <Link to="/c/$token/cancelar" params={{ token }}>No podré asistir</Link>
          </Button>
          <Button type="submit" size="lg" disabled={submitting} className="uppercase tracking-wider">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar asistencia
          </Button>
        </div>
      </form>
    </PublicShell>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

function ErrorState({ code }: { code: string }) {
  const map: Record<string, { icon: React.ReactNode; title: string; description: string }> = {
    invalido: {
      icon: <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />,
      title: "Enlace no válido o expirado",
      description: "El enlace que has utilizado no es correcto o ya no está activo. Contacta con FIGURARTE si crees que es un error.",
    },
    evento_cerrado: {
      icon: <Lock className="h-12 w-12 mx-auto text-muted-foreground" />,
      title: "Evento cerrado",
      description: "Este evento ya no admite confirmaciones porque ha finalizado o ha sido cancelado.",
    },
    no_disponible: {
      icon: <XCircle className="h-12 w-12 mx-auto text-destructive" />,
      title: "Esta confirmación ya no está disponible",
      description: "Tu participación está cancelada, rechazada o bloqueada. Si necesitas ayuda, contacta con el equipo de FIGURARTE.",
    },
  };
  const c = map[code] ?? map.invalido;
  return (
    <PublicShell>
      <div className="text-center py-16">
        {c.icon}
        <h1 className="mt-6 text-3xl font-black uppercase tracking-tight">{c.title}</h1>
        <p className="mt-3 text-muted-foreground max-w-md mx-auto">{c.description}</p>
        <Button asChild variant="outline" className="mt-8 uppercase tracking-wider">
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </PublicShell>
  );
}