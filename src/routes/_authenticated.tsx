import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

// Centralised route → allowed roles map. Defence in depth on top of RLS.
// Order matters: longer prefixes first so /eventos/:id/editar matches before /eventos.
const ROUTE_ROLES: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: "/dashboard", roles: ["superadmin", "admin_figurarte", "coordinador", "validador", "cliente_productora"] },
  { prefix: "/control-acceso", roles: ["superadmin", "admin_figurarte", "coordinador", "validador"] },
  { prefix: "/incidencias", roles: ["superadmin", "admin_figurarte", "coordinador", "validador"] },
  { prefix: "/eventos", roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { prefix: "/sesiones", roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { prefix: "/solicitudes", roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { prefix: "/comunicaciones", roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { prefix: "/informes", roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { prefix: "/personas", roles: ["superadmin", "admin_figurarte"] },
  { prefix: "/importaciones", roles: ["superadmin", "admin_figurarte"] },
  { prefix: "/clientes", roles: ["superadmin", "admin_figurarte"] },
  { prefix: "/usuarios", roles: ["superadmin", "admin_figurarte"] },
  { prefix: "/branding", roles: ["superadmin", "admin_figurarte"] },
  { prefix: "/legal", roles: ["superadmin", "admin_figurarte"] },
  { prefix: "/logs", roles: ["superadmin"] },
];

function isAllowed(pathname: string, userRoles: AppRole[]): boolean {
  const match = ROUTE_ROLES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  if (!match) return true; // unmapped routes: allow (e.g. future pages)
  return match.roles.some((r) => userRoles.includes(r));
}

function AuthenticatedLayout() {
  const { session, loading, roles, isAdmin, hasRole, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" />;

  // Cliente/productora users go to their own portal, never to the admin shell.
  const onlyClient = !isAdmin && hasRole("cliente_productora") &&
    !roles.some((r) => r === "coordinador" || r === "validador");
  if (onlyClient) return <Navigate to="/portal" />;

  // Defensive: signed in but no role assigned at all.
  if (roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-black uppercase tracking-tight">
            Sin rol asignado
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu usuario no tiene rol asignado. Contacta con un administrador de
            FIGURARTE para activar tu acceso.
          </p>
          <Button variant="outline" onClick={() => signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  if (!isAllowed(pathname, roles)) {
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-muted/30">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center gap-3 border-b bg-background px-4 sticky top-0 z-10">
              <SidebarTrigger />
              <div className="h-5 w-px bg-border" />
              <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                FIGURARTE Access
              </span>
            </header>
            <main className="flex-1 p-4 md:p-8 flex items-center justify-center">
              <div className="max-w-md text-center space-y-3">
                <h1 className="text-2xl font-black uppercase tracking-tight">
                  Sin permiso
                </h1>
                <p className="text-sm text-muted-foreground">
                  Tu rol no tiene acceso a esta sección. Si crees que es un
                  error, contacta con un administrador.
                </p>
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-background px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border" />
            <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              FIGURARTE Access
            </span>
          </header>
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}