import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/solicitudes")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Solicitudes"
        description="Revisa, aprueba, rechaza o pon en lista de espera las inscripciones recibidas."
        
      />
      <EmptyState
        icon={<Inbox className="h-12 w-12" />}
        title="No hay solicitudes"
        description="Cuando publiques un formulario público, las solicitudes aparecerán aquí."
      />
    </div>
  );
}
