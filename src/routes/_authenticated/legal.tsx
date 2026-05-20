import { createFileRoute } from "@tanstack/react-router";
import { Shield, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/legal")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Legal / RGPD"
        description="Textos legales, versiones, política de privacidad, consentimientos y exportación RGPD."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<Shield className="h-12 w-12" />}
        title="Sin versiones publicadas"
        description="Publica la primera versión del texto legal para empezar a registrar consentimientos."
      />
    </div>
  );
}
