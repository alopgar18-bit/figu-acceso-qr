import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";
import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useClientContext, useClientEvents } from "@/lib/use-client-portal";
import { labelOf, EVENT_STATUS_OPTIONS, EVENT_TYPE_OPTIONS } from "@/lib/event-constants";

export const Route = createFileRoute("/portal/eventos/")({
  component: EventsList,
});

function EventsList() {
  const { data: ctx } = useClientContext();
  const { data: events = [], isLoading } = useClientEvents(ctx?.clientIds);

  return (
    <div>
      <PageHeader
        eyebrow="Portal cliente"
        title="Eventos asignados"
        description="Eventos en los que tu cliente / productora tiene visibilidad."
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title="Sin eventos asignados"
          description="Aún no tienes eventos vinculados."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((e) => (
            <Link
              key={e.id}
              to="/portal/eventos/$eventId"
              params={{ eventId: e.id }}
              className="block cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary rounded-none"
            >
              <Card className="rounded-none p-5 hover:border-primary hover:shadow-md hover:bg-muted/30 transition-all h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {labelOf(EVENT_TYPE_OPTIONS, e.event_type)}
                    </div>
                    <h3 className="font-black text-lg uppercase tracking-tight mt-1 truncate">
                      {e.name}
                    </h3>
                    <div className="text-xs text-muted-foreground mt-2">
                      {e.starts_at ? new Date(e.starts_at).toLocaleString("es-ES") : "Sin fecha"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[e.location_name, e.city].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <Badge variant="outline">{labelOf(EVENT_STATUS_OPTIONS, e.status)}</Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}