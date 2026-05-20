import { createFileRoute } from "@tanstack/react-router";
import { Palette, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/branding")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Branding"
        description="Personaliza logo, colores y firma de emails para cada evento o cliente."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<Palette className="h-12 w-12" />}
        title="Branding por defecto activo"
        description="Sube assets personalizados para clientes/productoras o eventos específicos."
      />
    </div>
  );
}
