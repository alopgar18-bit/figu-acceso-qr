import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EventForm } from "@/components/event-form";
import { useEvent } from "@/lib/use-events";

export const Route = createFileRoute("/_authenticated/eventos/$eventId/editar")({
  component: Page,
});

function Page() {
  const { eventId } = Route.useParams();
  const { data: event, isLoading } = useEvent(eventId);

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/eventos/$eventId" params={{ eventId }}>
          <ArrowLeft className="h-4 w-4 mr-1" />Volver al evento
        </Link>
      </Button>
      <PageHeader eyebrow="Editar" title={event?.name ?? "Cargando…"} description="Modifica la configuración del evento." />
      {isLoading || !event ? <Skeleton className="h-96" /> : <EventForm event={event} />}
    </div>
  );
}