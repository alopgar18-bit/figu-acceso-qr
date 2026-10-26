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
  formatSessionDate,
  formatSessionLongDate,
  formatSessionTime,
} from "@/lib/communication-constants";
import { useUpsertTemplate, type TemplateRow } from "@/lib/use-communications";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sortSessionsUpcomingFirst } from "@/lib/session-sort";
import { buildEntryUrl } from "@/lib/communication-constants";

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

  const [insertTarget, setInsertTarget] = useState<"body" | "subject">("body");
  const insertVar = (token: string) =>
    insertTarget === "subject" ? setSubject((prev) => prev + token) : setBody((prev) => prev + token);
  const [previewSessionId, setPreviewSessionId] = useState<string>("demo");

  const sessionsQ = useQuery({
    queryKey: ["template-preview-sessions"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("id, name, starts_at, ends_at, doors_open_at, live_start_time, location_name, location_address, specific_instructions, events(name, location_name, location_address)")
        .order("starts_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return sortSessionsUpcomingFirst(data);
    },
  });
  const sampleQ = useQuery({
    queryKey: ["template-preview-sample", previewSessionId],
    enabled: open && previewSessionId !== "demo",
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_participants")
        .select("confirmation_token, seat_zone, seat_row, seat_number, people(first_name, last_name, phone)")
        .eq("session_id", previewSessionId)
        .not("seat_number", "is", null)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const QR_BLOCK = `\n<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 0;">
  <img src="{{qr_image}}" alt="Código QR" width="240" height="240" style="display:block;border:1px solid #ececec;border-radius:8px;background:#fff;" />
  <div style="font-size:12px;color:#666;margin-top:8px;">Presenta este QR en el acceso.</div>
</td></tr></table>\n`;
  const BUTTON_BLOCK = `\n<p style="text-align:center;margin:24px 0;"><a href="{{enlace_entrada}}" style="background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Abrir entrada</a></p>\n`;
  const TIME_BLOCK = `\nFecha: {{fecha}}\nHora de acceso: {{hora_acceso}}\nHora de inicio: {{hora_inicio}}\nInicio del directo: {{hora_directo}}\nHora fin aprox.: {{hora_fin}}\n`;
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
  const demoCtx: RenderContext = {
    nombre: "Rocío",
    apellidos: "Choquera",
    evento: "El Perro Andaluz by Manu Sánchez",
    sesion: "Sesión tarde",
    fecha: "21/05/2026",
    fecha_larga: "jueves 21 de mayo",
    hora_acceso: "19:30",
    hora_inicio: "20:00",
    hora_directo: "20:30",
    hora_fin: "22:30",
    ubicacion: "Teatro Alameda, Sevilla",
    enlace_entrada: "https://figurarte.app/c/demo-token/entrada",
    enlace_confirmacion: "https://figurarte.app/c/demo-token/entrada",
    qr: "demo-token",
    qr_image: buildQrImageUrl("https://figurarte.app/c/demo-token/entrada"),
    instrucciones: "Recuerda llevar el DNI en vigor.",
    telefono: "",
  };
  const selSession = (sessionsQ.data ?? []).find((x) => x.id === previewSessionId);
  const MISSING = (k: string) => `[falta ${k}]`;
  const sampleCtx: RenderContext = selSession
    ? (() => {
        const ev = selSession.events as { name?: string; location_name?: string | null; location_address?: string | null } | null;
        const sm = sampleQ.data as { confirmation_token?: string | null; seat_zone?: string | null; seat_row?: string | null; seat_number?: string | null; people?: { first_name?: string; last_name?: string | null; phone?: string | null } | null } | null | undefined;
        const enlace = buildEntryUrl(sm?.confirmation_token ?? null);
        const ubic = selSession.location_name ?? ev?.location_name ?? selSession.location_address ?? ev?.location_address ?? "";
        return {
          nombre: sm?.people?.first_name ?? "Rocío",
          apellidos: sm?.people?.last_name ?? "",
          evento: ev?.name || MISSING("evento"),
          sesion: selSession.name,
          fecha: formatSessionDate(selSession.starts_at) || MISSING("fecha"),
          fecha_larga: formatSessionLongDate(selSession.starts_at) || MISSING("fecha"),
          hora_acceso: formatSessionTime(selSession.doors_open_at ?? selSession.starts_at) || MISSING("hora de acceso"),
          hora_inicio: formatSessionTime(selSession.starts_at) || MISSING("hora de inicio"),
          hora_directo: selSession.live_start_time || MISSING("hora de directo"),
          hora_fin: formatSessionTime(selSession.ends_at) || MISSING("hora de fin"),
          ubicacion: ubic || MISSING("ubicación"),
          direccion: selSession.location_address ?? ev?.location_address ?? "",
          zona: sm?.seat_zone ?? "",
          fila: sm?.seat_row ?? "",
          asiento: sm?.seat_number ?? "",
          enlace_entrada: enlace || MISSING("enlace"),
          enlace_confirmacion: enlace || MISSING("enlace"),
          qr: sm?.confirmation_token ?? "",
          qr_image: enlace ? buildQrImageUrl(enlace) : "",
          instrucciones: selSession.specific_instructions ?? "",
          telefono: sm?.people?.phone ?? "",
        };
      })()
    : demoCtx;
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
              {/\{\{\s*\w+\s*\}\}/.test(subject) && (
                <p className="mt-1 rounded-md border bg-muted/40 px-2 py-1 text-xs">
                  <span className="text-muted-foreground">
                    Así se verá{selSession ? ` (${selSession.name})` : " (datos de ejemplo)"}:{" "}
                  </span>
                  <strong>{renderedSubject}</strong>
                </p>
              )}
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
                <div className="mb-3">
                  <Label className="text-xs">Previsualizar con sesión</Label>
                  <Select value={previewSessionId} onValueChange={setPreviewSessionId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="demo">Datos de ejemplo</SelectItem>
                      {(sessionsQ.data ?? []).map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {(x.events as { name?: string } | null)?.name ?? ""} · {x.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selSession && (
                    <p className="text-xs text-muted-foreground mt-1">Los datos que falten en la sesión aparecen como [falta …].</p>
                  )}
                </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs uppercase tracking-wider">Variables disponibles</Label>
              {channel === "email" && (
                <div className="flex gap-1 text-xs">
                  <span className="text-muted-foreground self-center">Insertar en:</span>
                  <Button type="button" size="sm" variant={insertTarget === "subject" ? "default" : "outline"} onClick={() => setInsertTarget("subject")}>Asunto</Button>
                  <Button type="button" size="sm" variant={insertTarget === "body" ? "default" : "outline"} onClick={() => setInsertTarget("body")}>Cuerpo</Button>
                </div>
              )}
            </div>
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