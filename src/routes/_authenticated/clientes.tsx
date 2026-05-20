import { createFileRoute } from "@tanstack/react-router";
import { Building2, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Clientes / Productoras"
        description="Gestiona clientes y productoras, sus eventos asignados y los permisos de visualización de datos."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<Building2 className="h-12 w-12" />}
        title="Sin clientes registrados"
        description="Da de alta un cliente o productora para asignarle eventos y permisos."
      />
    </div>
  );
}
