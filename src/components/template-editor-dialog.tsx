import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  COMM_CHANNEL_OPTIONS,
  COMM_VARIABLES,
  buildQrImageUrl,
  renderTemplate,
  type CommChannel,
  type RenderContext,
} from "@/lib/communication-constants";
import { useUpsertTemplate, type TemplateRow } from "@/lib/use-communications";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: TemplateRow | null;
}

export function TemplateEditorDialog({ open, onOpenChange, template }: Props) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CommChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const upsert = useUpsertTemplate();

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setChannel((template?.channel as CommChannel) ?? "email");
      setSubject(template?.subject ?? "");
      setBody(template?.body ?? "");
      setIsActive(template?.is_active ?? true);
    }
  }, [open, template]);

  const insertVar = (token: string) => setBody((prev) => prev + token);

  const QR_BLOCK = `\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 0;">
  <img src="{{qr_image}}" alt="Código QR" width="240" height="240" style="display:block;border:1px solid #ececec;border-radius:8px;background:#fff;" />
  <div style="font-size:12px;color:#666;margin-top:8px;">Presenta este QR en el acceso.</div>
</td></tr></table>\n`;
  const BUTTON_BLOCK = `\n<p style="text-align:center;margin:24px 0;"><a href="{{enlace_entrada}}" style="background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Abrir entrada</a></p>\n`;
  const TIME_BLOCK = `\nFecha: {{fecha}}\nHora de acceso: {{hora_acceso}}\nHora de inicio: {{hora_inicio}}\nHora fin aprox.: {{hora_fin}}\n`;
  const HEADER_BLOCK = `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
<tr><td style="background:#111;padding:28px 32px;color:#fff;">
  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:.7;">FIGURARTE Casting</div>
  <div style="font-size:22px;font-weight:700;margin-top:6px;">{{evento}}</div>
</td></tr><tr><td style="padding:32px;">
<p>Hola <strong>{{nombre}}</strong>,</p>
<p>Escribe aquí tu mensaje…</p>
</td></tr></table></td></tr></table></body></html>`;

  const isHtml = /<\/?[a-z][\s\S]*>/i.test(body);
  const sampleCtx: RenderContext = {
    nombre: "Rocío",
    apellidos: "Choquera",
    evento: "El Perro Andaluz by Manu Sánchez",
    sesion: "Sesión tarde",
    fecha: "21/05/2026",
    hora_acceso: "19:30",
    hora_inicio: "20:00",
    hora_fin: "22:30",
    ubicacion: "Teatro Alameda, Sevilla",
    enlace_entrada: "https://figurarte.app/c/demo-token/entrada",
    enlace_confirmacion: "https://figurarte.app/c/demo-token/entrada",
    qr: "demo-token",
    qr_image: buildQrImageUrl("https://figurarte.app/c/demo-token/entrada"),
    instrucciones: "Recuerda llevar el DNI en vigor.",
    telefono: "",
  };
  const renderedBody = renderTemplate(body || "", sampleCtx);
  const renderedSubject = renderTemplate(subject || "", sampleCtx);

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      toast.error("Nombre y cuerpo son obligatorios");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: template?.id,
        name: name.trim(),
        channel,
        subject: channel === "email" ? subject.trim() || null : null,
        body,
        is_active: isActive,
      });
      toast.success("Plantilla guardada");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Confirmación de aprobación" />
            </div>
            <div>
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as CommChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMM_CHANNEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {channel === "email" && (
            <div>
              <Label>Asunto</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del email" />
            </div>
          )}
          {channel === "email" && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setBody(HEADER_BLOCK)}>Plantilla HTML base</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setBody((p) => p + TIME_BLOCK)}>+ Fecha y horarios</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setBody((p) => p + QR_BLOCK)}>+ Bloque QR</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setBody((p) => p + BUTTON_BLOCK)}>+ Botón entrada</Button>
            </div>
          )}
          <div>
            <Label>Cuerpo {isHtml && <Badge variant="secondary" className="ml-2">HTML</Badge>}</Label>
            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">Editar</TabsTrigger>
                <TabsTrigger value="preview">Vista previa</TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className="font-mono text-xs" />
                <p className="text-xs text-muted-foreground mt-1">Puedes pegar HTML directamente. Para texto plano, escribe sin etiquetas.</p>
              </TabsContent>
              <TabsContent value="preview">
                {channel === "email" && renderedSubject && (
                  <div className="mb-2 text-sm"><span className="text-muted-foreground">Asunto: </span><strong>{renderedSubject}</strong></div>
                )}
                <div className="rounded-md border bg-muted/40 overflow-hidden" style={{ minHeight: 320 }}>
                  {isHtml ? (
                    <iframe
                      title="preview"
                      srcDoc={renderedBody}
                      className="w-full"
                      style={{ height: 520, border: 0, background: "#fff" }}
                      sandbox=""
                    />
                  ) : (
                    <pre className="p-4 whitespace-pre-wrap text-sm font-sans">{renderedBody || "(vacío)"}</pre>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider">Variables disponibles</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {COMM_VARIABLES.map((v) => (
                <Badge
                  key={v.token}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => insertVar(v.token)}
                  title={v.description}
                >
                  {v.token}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="active" />
            <Label htmlFor="active">Plantilla activa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>{upsert.isPending ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}