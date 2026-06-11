import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

import { updatePublicForm } from "@/lib/forms.functions";
import { supabase } from "@/integrations/supabase/client";

type FieldKey =
  | "dni" | "phone" | "birthDate" | "gender" | "profession"
  | "city" | "province" | "photo" | "socialMedia" | "specialNeeds" | "notes";

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "dni", label: "DNI / NIE / Pasaporte" },
  { key: "phone", label: "Teléfono" },
  { key: "birthDate", label: "Fecha de nacimiento" },
  { key: "gender", label: "Género" },
  { key: "profession", label: "Profesión" },
  { key: "city", label: "Ciudad" },
  { key: "province", label: "Provincia" },
  { key: "photo", label: "Foto" },
  { key: "socialMedia", label: "Redes sociales" },
  { key: "specialNeeds", label: "Necesidades especiales" },
  { key: "notes", label: "Observaciones" },
];

type CompanionKey = "firstName" | "lastName" | "email" | "phone";
const COMPANION_FIELDS: { key: CompanionKey; label: string }[] = [
  { key: "firstName", label: "Nombre" },
  { key: "lastName", label: "Apellidos" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Teléfono" },
];

type FormRow = {
  id: string;
  title: string;
  intro_text: string | null;
  header_image_url: string | null;
  field_config: Record<string, { visible?: boolean; required?: boolean }> | null;
  requires_image_consent?: boolean;
  offers_future_processes_consent?: boolean;
};

export function FormEditorDialog({ form, eventId }: { form: FormRow; eventId: string }) {
  const qc = useQueryClient();
  const update = useServerFn(updatePublicForm);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(form.title);
  const [intro, setIntro] = useState(form.intro_text ?? "");
  const [header, setHeader] = useState(form.header_image_url ?? "");
  const [cfg, setCfg] = useState<Record<string, { visible?: boolean; required?: boolean }>>(form.field_config ?? {});
  const [reqImage, setReqImage] = useState(!!form.requires_image_consent);
  const [offerFuture, setOfferFuture] = useState(form.offers_future_processes_consent !== false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(form.title);
      setIntro(form.intro_text ?? "");
      setHeader(form.header_image_url ?? "");
      setCfg(form.field_config ?? {});
      setReqImage(!!form.requires_image_consent);
      setOfferFuture(form.offers_future_processes_consent !== false);
    }
  }, [open, form]);

  const save = useMutation({
    mutationFn: () => update({
      data: {
        id: form.id,
        title: title.trim(),
        intro_text: intro.trim() || null,
        header_image_url: header.trim() || null,
        field_config: cfg,
        requires_image_consent: reqImage,
        offers_future_processes_consent: offerFuture,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-forms", eventId] });
      toast.success("Formulario actualizado");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
  });

  async function onUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("Máx. 5 MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `form-headers/${form.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("public-assets").getPublicUrl(path);
      setHeader(data.publicUrl);
      toast.success("Imagen subida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  }

  function setField(key: FieldKey, patch: { visible?: boolean; required?: boolean }) {
    setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Editar contenido">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar formulario</DialogTitle>
          <DialogDescription>Personaliza el contenido, la imagen de cabecera y qué campos aparecen.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>

          <div>
            <Label>Texto introductorio</Label>
            <Textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={3} maxLength={2000}
              placeholder="Aparece debajo del título en el formulario público." />
          </div>

          <div>
            <Label>Imagen de cabecera</Label>
            <div className="flex gap-2 mt-1">
              <Input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="https://..." />
              <Button asChild variant="outline" disabled={uploading}>
                <label className="cursor-pointer">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
                </label>
              </Button>
            </div>
            {header && <img src={header} alt="" className="mt-2 w-full h-32 object-cover rounded" />}
          </div>

          <div>
            <Label className="mb-2 block">Campos del formulario</Label>
            <div className="border rounded-md divide-y">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                <div>Campo</div><div>Visible</div><div>Obligatorio</div>
              </div>
              {FIELDS.map((f) => {
                const v = cfg[f.key]?.visible !== false;
                const r = cfg[f.key]?.required === true;
                return (
                  <div key={f.key} className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 items-center text-sm">
                    <div>{f.label}</div>
                    <Switch checked={v} onCheckedChange={(val) => setField(f.key, { visible: val })} />
                    <Switch checked={r} disabled={!v} onCheckedChange={(val) => setField(f.key, { required: val })} />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Nombre, apellidos y email del titular siempre son obligatorios.
            </p>
          </div>

          <div>
            <Label className="mb-2 block">Campos de acompañantes</Label>
            <div className="border rounded-md divide-y">
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                <div>Campo</div><div>Visible</div><div>Obligatorio</div>
              </div>
              {COMPANION_FIELDS.map((f) => {
                const key = `companion_${f.key}`;
                const v = cfg[key]?.visible !== false;
                const r = cfg[key]?.required === true;
                return (
                  <div key={f.key} className="grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2 items-center text-sm">
                    <div>{f.label}</div>
                    <Switch checked={v} onCheckedChange={(val) => setCfg((c) => ({ ...c, [key]: { ...c[key], visible: val } }))} />
                    <Switch checked={r} disabled={!v} onCheckedChange={(val) => setCfg((c) => ({ ...c, [key]: { ...c[key], required: val } }))} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Consentimientos</Label>
            <label className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
              <span>Pedir consentimiento de imagen</span>
              <Switch checked={reqImage} onCheckedChange={setReqImage} />
            </label>
            <label className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
              <span>Ofrecer suscripción a futuros eventos</span>
              <Switch checked={offerFuture} onCheckedChange={setOfferFuture} />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}