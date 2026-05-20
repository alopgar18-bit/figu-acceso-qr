import { createFileRoute } from "@tanstack/react-router";
import { Upload, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/importaciones")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Importaciones"
        description="Importa personas o participantes desde Excel/CSV con mapeo de columnas y detección de duplicados."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<Upload className="h-12 w-12" />}
        title="Sin importaciones recientes"
        description="Sube un archivo Excel o CSV para añadir personas en bloque."
      />
    </div>
  );
}
