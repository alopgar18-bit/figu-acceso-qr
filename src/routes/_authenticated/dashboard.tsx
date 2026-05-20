import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Inbox, CheckCircle2, ScanLine } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const stats = [
  { label: "Eventos activos", value: "—", icon: CalendarDays },
  { label: "Solicitudes pendientes", value: "—", icon: Inbox },
  { label: "Confirmados", value: "—", icon: CheckCircle2 },
  { label: "Check-ins hoy", value: "—", icon: ScanLine },
];

function DashboardPage() {
  const { user, roles } = useAuth();
  const rolesLabel = roles.length ? roles.join(", ") : "sin rol asignado";

  return (
    <div>
      <PageHeader
        eyebrow="Panel principal"
        title={`Hola, ${user?.email?.split("@")[0] ?? "equipo"}`}
        description={`Tu sesión está activa con los siguientes roles: ${rolesLabel}.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-none border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tight">{s.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Sin datos todavía
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8 rounded-none">
        <CardHeader>
          <CardTitle className="uppercase tracking-wider text-sm">
            Empieza por aquí
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            La plataforma está lista. Aún no hay eventos creados. El siguiente
            paso es crear las tablas de eventos, sesiones, personas y participantes
            para poder operar.
          </p>
          <p>
            Si eres administrador, asigna roles al resto del equipo desde la
            sección <strong>Usuarios</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}