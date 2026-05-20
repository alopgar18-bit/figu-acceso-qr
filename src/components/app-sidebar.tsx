import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  Clock,
  Inbox,
  Users,
  Upload,
  Mail,
  ScanLine,
  AlertTriangle,
  BarChart3,
  Building2,
  UserCog,
  Palette,
  Shield,
  ScrollText,
  Eye,
  LogOut,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/hooks/use-auth";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles?: AppRole[]; // if omitted, visible to all authenticated
};

const operationalItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Eventos", url: "/eventos", icon: CalendarDays, roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { title: "Sesiones", url: "/sesiones", icon: Clock, roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { title: "Solicitudes", url: "/solicitudes", icon: Inbox, roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { title: "Personas", url: "/personas", icon: Users, roles: ["superadmin", "admin_figurarte"] },
  { title: "Importaciones", url: "/importaciones", icon: Upload, roles: ["superadmin", "admin_figurarte"] },
  { title: "Comunicaciones", url: "/comunicaciones", icon: Mail, roles: ["superadmin", "admin_figurarte", "coordinador"] },
  { title: "Control de acceso", url: "/control-acceso", icon: ScanLine, roles: ["superadmin", "admin_figurarte", "coordinador", "validador"] },
  { title: "Incidencias", url: "/incidencias", icon: AlertTriangle, roles: ["superadmin", "admin_figurarte", "coordinador", "validador"] },
  { title: "Informes", url: "/informes", icon: BarChart3, roles: ["superadmin", "admin_figurarte", "coordinador"] },
];

const adminItems: NavItem[] = [
  { title: "Clientes / Productoras", url: "/clientes", icon: Building2, roles: ["superadmin", "admin_figurarte"] },
  { title: "Usuarios", url: "/usuarios", icon: UserCog, roles: ["superadmin", "admin_figurarte"] },
  { title: "Branding", url: "/branding", icon: Palette, roles: ["superadmin", "admin_figurarte"] },
  { title: "Legal / RGPD", url: "/legal", icon: Shield, roles: ["superadmin", "admin_figurarte"] },
  { title: "Logs", url: "/logs", icon: ScrollText, roles: ["superadmin"] },
  { title: "Portal cliente", url: "/portal", icon: Eye, roles: ["superadmin", "admin_figurarte"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { user, roles, hasAnyRole, signOut } = useAuth();

  const isActive = (url: string) =>
    currentPath === url || currentPath.startsWith(url + "/");

  const filter = (items: NavItem[]) =>
    items.filter((i) => !i.roles || hasAnyRole(i.roles));

  const renderGroup = (label: string, items: NavItem[]) => {
    const visible = filter(items);
    if (visible.length === 0) return null;
    return (
      <SidebarGroup>
        {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                  <Link to={item.url} className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.title}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground font-black text-sm shrink-0">
            F
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-black tracking-wider text-sidebar-foreground text-sm">
                FIGURARTE
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60">
                Access
              </span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Operativa", operationalItems)}
        {renderGroup("Administración", adminItems)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="px-2 py-2 text-xs text-sidebar-foreground/70">
            <div className="truncate font-medium text-sidebar-foreground">
              {user.email}
            </div>
            <div className="truncate uppercase tracking-wider text-[10px] mt-0.5">
              {roles.length ? roles.join(" · ") : "sin rol asignado"}
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Cerrar sesión">
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Cerrar sesión</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}