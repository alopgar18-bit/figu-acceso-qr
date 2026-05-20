import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/eventos")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Eventos"
        description="Crea y gestiona eventos: Público TV, grabaciones, castings, premieres y producciones."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<CalendarDays className="h-12 w-12" />}
        title="Aún no hay eventos"
        description="Crea tu primer evento para empezar a publicar formularios y gestionar audiencia."
      />
    </div>
  );
}
