import { createFileRoute } from "@tanstack/react-router";
import { Clock, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/sesiones")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Sesiones"
        description="Cada evento se divide en sesiones con fecha, aforo y reglas propias."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<Clock className="h-12 w-12" />}
        title="Sin sesiones todavía"
        description="Crea un evento primero para empezar a programar sus sesiones."
      />
    </div>
  );
}
