import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/incidencias")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Acceso"
        title="Incidencias"
        description="Registra y resuelve incidencias de acceso: QR usado, DNI no coincide, persona bloqueada, etc."
        
      />
      <EmptyState
        icon={<AlertTriangle className="h-12 w-12" />}
        title="Sin incidencias"
        description="Las incidencias detectadas durante el control de acceso aparecerán aquí."
      />
    </div>
  );
}
