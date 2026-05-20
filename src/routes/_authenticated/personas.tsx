import { createFileRoute } from "@tanstack/react-router";
import { Users, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/personas")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Base de datos"
        title="Personas"
        description="Base de datos global de personas que han participado o pueden participar en eventos FIGURARTE."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<Users className="h-12 w-12" />}
        title="Base de datos vacía"
        description="Las personas se añaden automáticamente al enviar el formulario o por importación."
      />
    </div>
  );
}
