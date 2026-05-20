import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/informes")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Análisis"
        title="Informes"
        description="Dashboards y exportaciones por evento y por sesión. Datos descargables en Excel y PDF."
        
      />
      <EmptyState
        icon={<BarChart3 className="h-12 w-12" />}
        title="Sin datos para informar"
        description="Cuando haya eventos finalizados, podrás generar informes detallados."
      />
    </div>
  );
}
