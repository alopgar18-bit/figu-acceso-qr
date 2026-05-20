import { createFileRoute } from "@tanstack/react-router";
import { UserCog, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: Page,
});

function Page() {
  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios y roles"
        description="Gestiona el equipo FIGURARTE: administradores, coordinadores, validadores y clientes."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      <EmptyState
        icon={<UserCog className="h-12 w-12" />}
        title="Solo tu usuario por ahora"
        description="Invita a más miembros del equipo y asígnales un rol."
      />
    </div>
  );
}
