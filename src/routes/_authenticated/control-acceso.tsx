import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanLine, MapPin, Calendar, Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAssignedSessions } from "@/lib/use-access";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/control-acceso")({
  component: Page,
});

function Page() {
  const { data: sessions, isLoading } = useAssignedSessions();

  const now = Date.now();
  const sorted = [...(sessions ?? [])].sort((a, b) => {
    const aActive = new Date(a.starts_at).getTime() <= now && (!a.ends_at || new Date(a.ends_at).getTime() >= now);
    const bActive = new Date(b.starts_at).getTime() <= now && (!b.ends_at || new Date(b.ends_at).getTime() >= now);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  });

  return (
    <div>
      <PageHeader
        eyebrow="Acceso"
        title="Control de acceso"
        description="Selecciona una sesión asignada para abrir el escáner y validar entradas."
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando sesiones…</div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<ScanLine className="h-12 w-12" />}
          title="Sin sesiones asignadas"
          description="No tienes sesiones asignadas para validar. Habla con un coordinador."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((s) => {
            const start = new Date(s.starts_at);
            const end = s.ends_at ? new Date(s.ends_at) : null;
            const active = start.getTime() <= now && (!end || end.getTime() >= now);
            const upcoming = start.getTime() > now;
            const ev = s.events as { id: string; name: string; status: string; location_name: string | null } | null;
            return (
              <Link
                key={s.id}
                to="/control-acceso/$sessionId"
                params={{ sessionId: s.id }}
                className="block group"
              >
                <Card className="p-5 hover:border-primary transition-colors h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{ev?.name ?? "—"}</div>
                    {active ? <Badge className="bg-emerald-500 hover:bg-emerald-500">En curso</Badge> : upcoming ? <Badge variant="secondary">Próxima</Badge> : <Badge variant="outline">Finalizada</Badge>}
                  </div>
                  <h3 className="font-semibold text-lg leading-tight">{s.name}</h3>
                  <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />{format(start, "PPpp", { locale: es })}</div>
                    {(s.location_name || ev?.location_name) && (
                      <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{s.location_name ?? ev?.location_name}</div>
                    )}
                    <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5" />Aforo {s.capacity}</div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
