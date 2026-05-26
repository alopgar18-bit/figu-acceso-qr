import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { ClientPortalShell } from "@/components/client-portal-shell";
import { useClientContext } from "@/lib/use-client-portal";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

function PortalLayout() {
  const { session, loading, isAdmin, hasRole } = useAuth();
  const { data: ctx, isLoading } = useClientContext();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" />;

  // Allow admins to preview; otherwise require cliente_productora + a client_users mapping.
  const isClient = hasRole("cliente_productora");
  if (!isAdmin && !isClient) return <Navigate to="/dashboard" />;

  if (!isAdmin && !isLoading && (!ctx || ctx.clientIds.length === 0)) {
    return (
      <ClientPortalShell>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold uppercase">Sin productora asignada</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
            Tu cuenta no tiene ninguna productora asignada. Contacta con el administrador de FIGURARTE.
          </p>
        </div>
      </ClientPortalShell>
    );
  }

  return (
    <ClientPortalShell>
      <Outlet />
    </ClientPortalShell>
  );
}