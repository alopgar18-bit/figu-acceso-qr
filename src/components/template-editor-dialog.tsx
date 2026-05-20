import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { COMM_CHANNEL_OPTIONS, COMM_VARIABLES, type CommChannel } from "@/lib/communication-constants";
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
      <DialogContent className="max-w-2xl">
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
          <div>
            <Label>Cuerpo</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="font-mono text-sm" />
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