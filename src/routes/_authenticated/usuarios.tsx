import { createFileRoute } from "@tanstack/react-router";
import { UserCog, Plus, Mail, Phone, ShieldCheck, CircleSlash, Pencil } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { createUser, updateUserRoles, updateUserClients } from "@/lib/users.functions";

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

const ROLE_OPTIONS = [
  "admin_figurarte",
  "coordinador",
  "validador",
  "cliente_productora",
  "superadmin",
] as const;

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users-with-roles"],
    queryFn: async () => {
      const [profilesRes, rolesRes, clientUsersRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, is_active, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("client_users").select("user_id, client_id"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (clientUsersRes.error) throw clientUsersRes.error;

      const rolesByUser = new Map<string, string[]>();
      for (const row of rolesRes.data ?? []) {
        rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
      }
      const clientsByUser = new Map<string, string[]>();
      for (const row of clientUsersRes.data ?? []) {
        clientsByUser.set(row.user_id, [...(clientsByUser.get(row.user_id) ?? []), row.client_id]);
      }

      return (profilesRes.data ?? []).map((profile) => ({
        ...profile,
        roles: rolesByUser.get(profile.id) ?? [],
        clientIds: clientsByUser.get(profile.id) ?? [],
      }));
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Usuarios y roles"
        description="Gestiona el equipo FIGURARTE: administradores, coordinadores, validadores y clientes."
        actions={
          <Button
            className="uppercase tracking-wider"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo
          </Button>
        }
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
                  <TableHead className="text-right">Acciones</TableHead>
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
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditingUserId(u.id)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <NewUserDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          void qc.invalidateQueries({ queryKey: ["admin-users-with-roles"] });
        }}
      />

      <EditUserDialog
        user={users.find((u) => u.id === editingUserId) ?? null}
        onOpenChange={(v) => { if (!v) setEditingUserId(null); }}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ["admin-users-with-roles"] });
          void qc.invalidateQueries({ queryKey: ["client-portal"] });
        }}
      />
    </div>
  );
}

function NewUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createUser);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(["coordinador"]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRoles(["coordinador"]);
  };

  const toggleRole = (role: string) => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 8 || roles.length === 0) {
      toast.error("Completa nombre, email, contraseña (≥8) y al menos un rol");
      return;
    }
    setSubmitting(true);
    try {
      await createFn({
        data: {
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          roles: roles as (typeof ROLE_OPTIONS)[number][],
        },
      });
      toast.success("Usuario creado");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear usuario");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Crea una cuenta y asígnale uno o varios roles operativos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Contraseña inicial</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={roles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Creando…" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
