import { createFileRoute } from "@tanstack/react-router";
import { Mail, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/comunicaciones")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Comunicaciones"
        description="Plantillas, envíos por email (casting@figurarte.es) y WhatsApp asistido, con cola e historial."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<Mail className="h-12 w-12" />}
        title="Sin envíos todavía"
        description="Configura plantillas y envía confirmaciones, recordatorios y entradas a tus asistentes."
      />
    </div>
  );
}
