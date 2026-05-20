import { createFileRoute } from "@tanstack/react-router";
import { UserCog, Plus, Mail, Phone, ShieldCheck, CircleSlash } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: Page,
});

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin_figurarte: "Admin",
  coordinador: "Coordinador",
  validador: "Validador",
  cliente_productora: "Cliente/Productora",
};

function Page() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users-with-roles"],
    queryFn: async () => {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, is_active, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const rolesByUser = new Map<string, string[]>();
      for (const row of rolesRes.data ?? []) {
        rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
      }

      return (profilesRes.data ?? []).map((profile) => ({
        ...profile,
        roles: rolesByUser.get(profile.id) ?? [],
      }));
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios y roles"
        description="Gestiona el equipo FIGURARTE: administradores, coordinadores, validadores y clientes."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UserCog className="h-12 w-12" />}
          title="Sin usuarios registrados"
          description="Cuando se creen cuentas, aparecerán aquí con su rol operativo."
        />
      ) : (
        <Card className="rounded-none">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Alta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-semibold">{u.full_name || u.email || "Usuario sin nombre"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{u.id.slice(0, 8)}…</div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {u.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{u.email}</div>}
                        {u.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{u.phone}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {u.roles.length ? u.roles.map((role) => (
                          <Badge key={role} variant="secondary" className="gap-1">
                            <ShieldCheck className="h-3 w-3" />{ROLE_LABELS[role] ?? role}
                          </Badge>
                        )) : (
                          <Badge variant="destructive" className="gap-1">
                            <CircleSlash className="h-3 w-3" />Sin rol
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "default" : "outline"}>{u.is_active ? "Activo" : "Inactivo"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("es-ES")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
