import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SessionForm } from "@/components/session-form";
import { useEvent } from "@/lib/use-events";

export const Route = createFileRoute("/_authenticated/eventos/$eventId/sesiones/nueva")({
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
      <PageHeader eyebrow={event?.name ?? "Sesión"} title="Nueva sesión" description="Define fecha, aforo y reglas operativas." />
      {isLoading || !event ? <Skeleton className="h-96" /> : <SessionForm event={event} />}
    </div>
  );
}