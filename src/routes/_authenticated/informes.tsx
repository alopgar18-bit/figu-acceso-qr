import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { BarChart3, ArrowRight } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { useEvents } from "@/lib/use-events";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { labelOf, EVENT_STATUS_OPTIONS } from "@/lib/event-constants";

export const Route = createFileRoute("/_authenticated/informes")({
  component: Page,
});

function Page() {
  const { data: events = [], isLoading } = useEvents();
  const matches = useMatches();
  const hasChild = matches.some((m) => m.routeId === "/_authenticated/informes/$eventId");
  if (hasChild) return <Outlet />;

  return (
    <div>
      <PageHeader
        eyebrow="Análisis"
        title="Informes"
        description="Informes previos, en tiempo real y finales por evento y sesión. Exportables a Excel y PDF."
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-12 w-12" />}
          title="Sin eventos disponibles"
          description="Crea un evento para empezar a generar informes."
        />
      ) : (
        <div className="grid gap-3">
          {events.map((e) => (
            <Link
              key={e.id}
              to="/informes/$eventId"
              params={{ eventId: e.id }}
              className="block group cursor-pointer"
            >
              <Card className="rounded-none border-l-4 border-l-primary hover:bg-muted/30 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {(e.clients as { name?: string } | null)?.name ?? "—"}
                    </div>
                    <div className="font-bold uppercase tracking-tight truncate">{e.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {e.starts_at ? new Date(e.starts_at).toLocaleDateString("es-ES") : "Sin fecha"}
                      {e.city ? ` · ${e.city}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="outline">{labelOf(EVENT_STATUS_OPTIONS, e.status)}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
