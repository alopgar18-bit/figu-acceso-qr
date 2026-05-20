import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, BarChart3, AlertTriangle, LogOut, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useClientContext } from "@/lib/use-client-portal";
import type { ReactNode } from "react";

export function ClientPortalShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: ctx } = useClientContext();
  const perms = ctx?.perms;

  const nav = [
    { to: "/portal", label: "Resumen", icon: LayoutDashboard, show: true },
    { to: "/portal/eventos", label: "Eventos", icon: CalendarDays, show: true },
    { to: "/portal/informes", label: "Informes", icon: BarChart3, show: !!(perms?.export_data || perms?.export_pdf) },
    { to: "/portal/incidencias", label: "Incidencias", icon: AlertTriangle, show: !!perms?.see_incidents },
  ].filter((n) => n.show);

  const isActive = (to: string) => (to === "/portal" ? path === "/portal" : path.startsWith(to));

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="border-b bg-background sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
          <Link to="/portal" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground font-black text-sm">F</div>
            <div className="leading-tight">
              <div className="font-black tracking-wider text-sm">FIGURARTE</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Portal cliente</div>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link key={n.to} to={n.to}
                className={`text-xs uppercase tracking-wider px-3 py-2 transition-colors ${
                  isActive(n.to) ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}>
                {n.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[200px]">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Salir</span>
            </Button>
          </div>
        </div>
        <div className="md:hidden border-t overflow-x-auto">
          <div className="flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to}
                className={`text-[11px] uppercase tracking-wider px-3 py-2 whitespace-nowrap ${
                  isActive(n.to) ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
                }`}>
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="bg-primary/5 border-b border-primary/10">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Eye className="h-3.5 w-3.5" />
          <span>Acceso de solo consulta. Los datos visibles dependen de los permisos asignados por FIGURARTE.</span>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-6 md:py-10">{children}</main>

      <footer className="border-t mt-12">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 text-[11px] uppercase tracking-widest text-muted-foreground flex items-center justify-between">
          <span>© FIGURARTE · {ctx?.clientName ?? ""}</span>
          <span>v1 · Solo consulta</span>
        </div>
      </footer>
    </div>
  );
}