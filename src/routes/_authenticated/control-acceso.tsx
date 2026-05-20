import { createFileRoute } from "@tanstack/react-router";
import { ScanLine, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/control-acceso")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Acceso"
        title="Control de acceso"
        description="Escanea QR o busca manualmente para validar la entrada en la puerta."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<ScanLine className="h-12 w-12" />}
        title="Sin sesión activa"
        description="Selecciona una sesión en curso para abrir el escáner y empezar a validar accesos."
      />
    </div>
  );
}
