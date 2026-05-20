import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, CheckCircle2, ScanLine, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useClientContext, useClientEvents } from "@/lib/use-client-portal";
import { Badge } from "@/components/ui/badge";
import { labelOf, EVENT_STATUS_OPTIONS, EVENT_TYPE_OPTIONS } from "@/lib/event-constants";

export const Route = createFileRoute("/portal/")({
  component: PortalDashboard,
});

function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function PortalDashboard() {
  const { user } = useAuth();
  const { data: ctx } = useClientContext();
  const { data: events = [], isLoading } = useClientEvents(ctx?.clientId);

  const rawClientName = ctx?.clientName;
  const hasClientName = rawClientName && rawClientName !== "—" && rawClientName.trim().length > 1;
  const userFallback = (user?.user_metadata?.full_name as string | undefined) || user?.email?.split("@")[1] || "";
  const greetingName = hasClientName
    ? toTitleCase(rawClientName)
    : userFallback
      ? toTitleCase(userFallback)
      : "bienvenido";

  const active = events.filter((e) => e.status === "publicado").length;
  const upcoming = events
    .filter((e) => e.starts_at && new Date(e.starts_at) >= new Date())
    .slice(0, 5);

  const stats = [
    { label: "Eventos asignados", value: events.length, icon: CalendarDays },
    { label: "Activos", value: active, icon: CheckCircle2 },
    { label: "Próximos", value: upcoming.length, icon: Users },
    { label: "Cliente", value: hasClientName ? rawClientName : "Sin cliente", icon: ScanLine, small: true },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Portal cliente"
        title={`Hola, ${greetingName}`}
        description="Consulta tus eventos, sesiones, estadísticas e informes."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-none border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={s.small ? "text-base font-bold truncate" : "text-3xl font-black tracking-tight"}>
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-none">
        <CardHeader>
          <CardTitle className="uppercase tracking-wider text-sm">Próximos eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay eventos próximos.</p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link to="/portal/eventos/$eventId" params={{ eventId: e.id }}
                    className="flex items-center justify-between py-3 hover:bg-muted/40 px-2 -mx-2">
                    <div>
                      <div className="font-semibold">{e.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {labelOf(EVENT_TYPE_OPTIONS, e.event_type)} ·{" "}
                        {e.starts_at ? new Date(e.starts_at).toLocaleString("es-ES") : "Sin fecha"}{" "}
                        {e.city ? `· ${e.city}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline">{labelOf(EVENT_STATUS_OPTIONS, e.status)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}