import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ExternalLink, Send } from "lucide-react";
import {
  buildWhatsAppUrl,
  renderTemplate,
  SENDER_EMAIL,
  type CommChannel,
  type RenderContext,
} from "@/lib/communication-constants";
import { useTemplates, useCreateLog, useUpdateLogStatus } from "@/lib/use-communications";

interface Recipient {
  personId?: string | null;
  participantId?: string | null;
  eventId?: string | null;
  sessionId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  context?: RenderContext;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: Recipient[];
  defaultChannel?: CommChannel;
}

export function SendCommunicationDialog({ open, onOpenChange, recipients, defaultChannel = "email" }: Props) {
  const { data: templates = [] } = useTemplates();
  const [channel, setChannel] = useState<CommChannel>(defaultChannel);
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const create = useCreateLog();
  const updateStatus = useUpdateLogStatus();

  const filteredTemplates = useMemo(
    () => templates.filter((t) => t.channel === channel && t.is_active),
    [templates, channel],
  );

  useEffect(() => {
    if (!open) return;
    setChannel(defaultChannel);
    setTemplateId("");
    setSubject("");
    setBody("");
  }, [open, defaultChannel]);

  useEffect(() => {
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setSubject(t.subject ?? "");
    setBody(t.body);
  }, [templateId, templates]);

  const isBulk = recipients.length > 1;
  const isWhats = channel === "whatsapp_asistido";
  const preview = recipients[0];
  const previewBody = preview ? renderTemplate(body, { nombre: preview.name, ...preview.context }) : body;
  const previewSubject = preview ? renderTemplate(subject, { nombre: preview.name, ...preview.context }) : subject;

  const handleSendEmail = async () => {
    if (!body.trim()) {
      toast.error("Cuerpo vacío");
      return;
    }
    let ok = 0;
    for (const r of recipients) {
      if (!r.email) continue;
      const ctx: RenderContext = { nombre: r.name, ...r.context };
      await create.mutateAsync({
        channel: "email",
        status: "pendiente",
        to_address: r.email,
        subject: renderTemplate(subject, ctx),
        body: renderTemplate(body, ctx),
        template_id: templateId || null,
        participant_id: r.participantId ?? null,
        person_id: r.personId ?? null,
        event_id: r.eventId ?? null,
        session_id: r.sessionId ?? null,
        metadata: { from: SENDER_EMAIL },
      });
      ok++;
    }
    toast.success(`${ok} email(s) en cola de envío`);
    onOpenChange(false);
  };

  const handleWhatsAppOne = async (r: Recipient) => {
    if (!r.phone) {
      toast.error(`${r.name} no tiene teléfono`);
      return;
    }
    const ctx: RenderContext = { nombre: r.name, ...r.context };
    const message = renderTemplate(body, ctx);
    const log = await create.mutateAsync({
      channel: "whatsapp_asistido",
      status: "pendiente",
      to_address: r.phone,
      body: message,
      template_id: templateId || null,
      participant_id: r.participantId ?? null,
      person_id: r.personId ?? null,
      event_id: r.eventId ?? null,
      session_id: r.sessionId ?? null,
      metadata: { kind: "whatsapp_asistido" },
    });
    window.open(buildWhatsAppUrl(r.phone, message), "_blank", "noopener");
    return log;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(previewBody);
    toast.success("Mensaje copiado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isBulk ? `Enviar comunicación a ${recipients.length} personas` : `Enviar a ${recipients[0]?.name ?? ""}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as CommChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email (desde {SENDER_EMAIL})</SelectItem>
                  <SelectItem value="whatsapp_asistido">WhatsApp asistido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plantilla</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Sin plantilla" /></SelectTrigger>
                <SelectContent>
                  {filteredTemplates.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay plantillas activas para este canal</div>
                  )}
                  {filteredTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {channel === "email" && (
            <div>
              <Label>Asunto</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Mensaje</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="font-mono text-sm" />
          </div>
          {preview && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Vista previa para {preview.name}</div>
              {channel === "email" && previewSubject && <div className="font-semibold mb-1">{previewSubject}</div>}
              <div className="whitespace-pre-wrap">{previewBody}</div>
            </div>
          )}
          {isWhats && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider">Destinatarios</Label>
              <div className="space-y-1.5 max-h-48 overflow-auto">
                {recipients.map((r, i) => (
                  <div key={i} className="flex items-center justify-between border rounded p-2 text-sm">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.phone ?? "Sin teléfono"}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWhatsAppOne(r)}
                        disabled={!r.phone || !body.trim()}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />WhatsApp
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-3 w-3 mr-1" />Copiar mensaje
              </Button>
            </div>
          )}
          {channel === "email" && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Badge variant="outline">Remitente: {SENDER_EMAIL}</Badge>
              <span>Los emails entran en cola con estado “Pendiente” hasta que el backend los procese.</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {channel === "email" ? (
            <Button onClick={handleSendEmail} disabled={create.isPending}>
              <Send className="h-4 w-4 mr-2" />Encolar email{isBulk ? "s" : ""}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { Recipient as CommRecipient };