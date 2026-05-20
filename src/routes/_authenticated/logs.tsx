import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/logs")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Logs de auditoría"
        description="Registro de acciones sensibles: cambios de estado, accesos, envíos, exportaciones y validaciones."
        
      />
      <EmptyState
        icon={<ScrollText className="h-12 w-12" />}
        title="Sin registros aún"
        description="Las acciones de la plataforma quedarán registradas aquí."
      />
    </div>
  );
}
