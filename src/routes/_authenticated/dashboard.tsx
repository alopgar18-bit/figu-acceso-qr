import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Inbox, CheckCircle2, ScanLine, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadministrador",
  admin_figurarte: "Administrador FIGURARTE",
  coordinador: "Coordinador",
  validador: "Validador",
  cliente_productora: "Cliente / Productora",
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const [ev, sol, conf, chk, inc] = await Promise.all([
        supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "publicado"),
        supabase.from("event_participants").select("id", { count: "exact", head: true }).in("status", ["solicitud_recibida", "lista_espera"]),
        supabase.from("event_participants").select("id", { count: "exact", head: true }).in("status", ["confirmado", "qr_generado", "acceso_validado"]),
        supabase.from("checkins").select("id", { count: "exact", head: true }).gte("checked_in_at", startOfDay.toISOString()),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "abierta"),
      ]);
      return {
        eventos: ev.count ?? 0,
        solicitudes: sol.count ?? 0,
        confirmados: conf.count ?? 0,
        checkins: chk.count ?? 0,
        incidencias: inc.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
}

function DashboardPage() {
  const { user, roles } = useAuth();
  const rolesLabel = roles.length
    ? roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")
    : "sin rol asignado";
  const { data, isLoading } = useDashboardMetrics();

  const stats = [
    { label: "Eventos activos", value: data?.eventos, icon: CalendarDays, href: "/eventos" },
    { label: "Solicitudes pendientes", value: data?.solicitudes, icon: Inbox, href: "/solicitudes" },
    { label: "Confirmados", value: data?.confirmados, icon: CheckCircle2, href: "/solicitudes" },
    { label: "Check-ins hoy", value: data?.checkins, icon: ScanLine, href: "/control-acceso" },
    { label: "Incidencias abiertas", value: data?.incidencias, icon: AlertTriangle, href: "/incidencias" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Panel principal"
        title={`Hola, ${(user?.email?.split("@")[0] ?? "equipo").toUpperCase()}`}
        description={`Rol: ${rolesLabel}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.href} className="block group">
          <Card className="rounded-none border-l-4 border-l-primary h-full transition-colors group-hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <div className="text-3xl font-black tracking-tight">{s.value ?? 0}</div>
              )}
            </CardContent>
          </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-8 rounded-none">
        <CardHeader>
          <CardTitle className="uppercase tracking-wider text-sm">
            Accesos rápidos
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground grid sm:grid-cols-2 gap-2">
          <Link to="/eventos" className="underline-offset-4 hover:underline">Gestionar eventos y sesiones</Link>
          <Link to="/solicitudes" className="underline-offset-4 hover:underline">Revisar solicitudes pendientes</Link>
          <Link to="/comunicaciones" className="underline-offset-4 hover:underline">Enviar comunicaciones</Link>
          <Link to="/control-acceso" className="underline-offset-4 hover:underline">Abrir control de acceso</Link>
          <Link to="/informes" className="underline-offset-4 hover:underline">Ver informes</Link>
          <Link to="/incidencias" className="underline-offset-4 hover:underline">Gestionar incidencias</Link>
        </CardContent>
      </Card>
    </div>
  );
}