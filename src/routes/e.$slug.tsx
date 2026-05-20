import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { CalendarDays, MapPin, Users, AlertCircle } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicEvent } from "@/lib/use-public-event";

export const Route = createFileRoute("/e/$slug")({
  component: Page,
  head: ({ params }) => ({
    meta: [
      { title: `Inscripción · ${params.slug} · FIGURARTE` },
      { name: "description", content: "Inscripción al evento de FIGURARTE Casting & Producción." },
    ],
  }),
});

function Page() {
  const { slug } = Route.useParams();
  const { data, isLoading } = usePublicEvent(slug);

  if (isLoading) {
    return <PublicShell><Skeleton className="h-64" /></PublicShell>;
  }
  if (!data) return <Navigate to="/e/$slug/cerrado" params={{ slug }} />;
  const { event, sessions } = data;
  const openSessions = sessions.filter((s) => s.status !== "cerrada" && s.status !== "cancelada" && s.status !== "completada");
  const registrationOpen = event.public_registration_enabled && openSessions.length > 0;

  return (
    <PublicShell brandColor={event.brand_color}>
      <div className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-3">FIGURARTE Access</div>
      <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight">{event.name}</h1>
      {event.description && <p className="mt-4 text-muted-foreground whitespace-pre-line">{event.description}</p>}

      <Card className="mt-8">
        <CardContent className="pt-6 grid gap-3 text-sm">
          {(event.location_name || event.city) && (
            <Row icon={<MapPin className="h-4 w-4" />}>
              {[event.location_name, event.location_address, event.city, event.province].filter(Boolean).join(" · ")}
            </Row>
          )}
          {sessions.length > 0 && (
            <Row icon={<CalendarDays className="h-4 w-4" />}>
              {sessions.length} sesión{sessions.length === 1 ? "" : "es"} · próxima{" "}
              {new Date(sessions[0]!.starts_at).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}
            </Row>
          )}
          <Row icon={<Users className="h-4 w-4" />}>
            Aforo total: {sessions.reduce((a, s) => a + (s.capacity || 0), 0)} plazas
          </Row>
        </CardContent>
      </Card>

      {event.general_instructions && (
        <div className="mt-6 rounded-md border-l-4 border-primary bg-muted/40 p-4 text-sm whitespace-pre-line">
          {event.general_instructions}
        </div>
      )}

      <div className="mt-10 flex flex-col sm:flex-row gap-3">
        {registrationOpen ? (
          <Button asChild size="lg" className="uppercase tracking-wider">
            <Link to="/e/$slug/inscripcion" params={{ slug }}>Inscribirme</Link>
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Las inscripciones para este evento están cerradas.
          </div>
        )}
      </div>
    </PublicShell>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span>{children}</span>
    </div>
  );
}