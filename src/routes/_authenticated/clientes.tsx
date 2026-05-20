import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Mail, Phone, User } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: Page,
});

const schema = z.object({
  name: z.string().trim().min(1, "Obligatorio").max(150),
  contact_name: z.string().trim().max(150).optional(),
  contact_email: z.string().trim().email("Email inválido").max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

type Permissions = {
  see_email: boolean;
  see_phone: boolean;
  see_dni: boolean;
  see_companions: boolean;
  see_checkin_status: boolean;
  see_personal_notes: boolean;
  export_data: boolean;
};

const DEFAULT_PERMS: Permissions = {
  see_email: false,
  see_phone: false,
  see_dni: false,
  see_companions: true,
  see_checkin_status: true,
  see_personal_notes: false,
  export_data: false,
};

function Page() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Clientes / Productoras"
        description="Gestiona clientes y productoras, sus eventos asignados y los permisos de visualización de datos."
        actions={
          <Button className="uppercase tracking-wider" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Nuevo
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : !clients?.length ? (
        <EmptyState
          icon={<Building2 className="h-12 w-12" />}
          title="Sin clientes registrados"
          description="Da de alta un cliente o productora para asignarle eventos y permisos."
          action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Crear cliente</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {clients.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{c.name}</div>
                  {c.legal_name && <div className="text-xs text-muted-foreground">{c.legal_name}</div>}
                </div>
                <Badge variant={c.is_active ? "default" : "outline"}>
                  {c.is_active ? "Activo" : "Inactivo"}
                </Badge>
              </div>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {c.contact_email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{c.contact_email}</div>}
                {c.contact_phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{c.contact_phone}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateClientDialog open={open} onOpenChange={setOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["clients"] })} />
    </div>
  );
}

function CreateClientDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [perms, setPerms] = useState<Permissions>(DEFAULT_PERMS);

  const reset = () => {
    setName(""); setContactName(""); setContactEmail("");
    setContactPhone(""); setNotes(""); setPerms(DEFAULT_PERMS);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({
        name, contact_name: contactName, contact_email: contactEmail,
        contact_phone: contactPhone, notes,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos");

      const contactNotes = contactName
        ? `Contacto: ${contactName}${notes ? `\n\n${notes}` : ""}`
        : (notes || null);

      const { data, error } = await supabase.from("clients").insert({
        name: parsed.data.name,
        contact_email: parsed.data.contact_email || null,
        contact_phone: parsed.data.contact_phone || null,
        notes: contactNotes,
        is_active: true,
        visibility_permissions: perms,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Cliente creado");
      reset();
      onOpenChange(false);
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cliente / productora</DialogTitle>
          <DialogDescription>Da de alta una entidad para asignarle eventos y permisos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="16 Escalones Producciones" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact">Persona de contacto</Label>
            <div className="relative">
              <User className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input id="contact" className="pl-9" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={150} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={40} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium mb-1">Permisos de visualización</div>
            {[
              { k: "see_email", label: "Ver email de asistentes" },
              { k: "see_phone", label: "Ver teléfono de asistentes" },
              { k: "see_dni", label: "Ver DNI de asistentes" },
              { k: "see_companions", label: "Ver acompañantes" },
              { k: "see_checkin_status", label: "Ver estado de check-in" },
              { k: "see_personal_notes", label: "Ver notas personales" },
              { k: "export_data", label: "Exportar datos" },
            ].map(({ k, label }) => (
              <div key={k} className="flex items-center justify-between">
                <Label htmlFor={k} className="font-normal text-sm">{label}</Label>
                <Switch
                  id={k}
                  checked={perms[k as keyof Permissions]}
                  onCheckedChange={(v) => setPerms((p) => ({ ...p, [k]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()}>
            {mutation.isPending ? "Creando..." : "Crear cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
