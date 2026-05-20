import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { EventForm } from "@/components/event-form";

export const Route = createFileRoute("/_authenticated/eventos/nuevo")({
  component: Page,
});

function Page() {
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/eventos"><ArrowLeft className="h-4 w-4 mr-1" />Eventos</Link>
      </Button>
      <PageHeader eyebrow="Operativa" title="Nuevo evento" description="Define la identidad, ubicación y las reglas operativas del evento." />
      <EventForm />
    </div>
  );
}