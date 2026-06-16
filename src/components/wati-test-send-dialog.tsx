import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Send, AlertCircle, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizarTelefonoES } from "@/lib/phone";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId?: string;
  sessionId?: string;
}

// Diálogo de admin para enviar UN mensaje de WhatsApp vía Wati a un número
// concreto, usando un participante de referencia con asiento asignado.
// Crea un communication_log con metadata.wati_test=true (y force_resend=true)
// e invoca la edge function `send-whatsapp` con `ids:[log.id]`.
export function WatiTestSendDialog({ open, onOpenChange, eventId, sessionId }: Props) {
  const { user, isAdmin } = useAuth();
  const [phone, setPhone] = useState("");
  const [participantId, setParticipantId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setPhone("");
      setParticipantId(undefined);
      setSending(false);
    }
  }, [open]);

  // Cargar participantes con asiento asignado en la sesión
  const partsQ = useQuery({
    queryKey: ["wati_test_parts", eventId, sessionId],
    enabled: open && !!eventId && !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_participants")
        .select("id, seat_zone, seat_row, seat_number, confirmation_token, people(first_name,last_name)")
        .eq("event_id", eventId!)
        .eq("session_id", sessionId!)
        .not("seat_zone", "is", null)
        .not("seat_row", "is", null)
        .not("seat_number", "is", null)
        .not("confirmation_token", "is", null)
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const normalized = useMemo(() => normalizarTelefonoES(phone), [phone]);
  const canSend = isAdmin && !!normalized && !!participantId && !sending;

  const handleSend = async () => {
    if (!normalized || !participantId || !eventId || !sessionId) return;
    setSending(true);
    try {
      // 1. Crear el log con metadata wati_test=true + force_resend=true
      const { data: logRow, error: insErr } = await supabase
        .from("communication_logs")
        .insert({
          channel: "whatsapp_business",
          status: "pendiente",
          to_address: normalized,
          body: "(plantilla Wati invitacion_grabacion_publico)",
          participant_id: participantId,
          event_id: eventId,
          session_id: sessionId,
          created_by: user?.id ?? null,
          metadata: {
            wati_test: true,
            force_resend: true,
            kind: "wati_test",
          } as never,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 2. Invocar la edge function con ids:[log.id]
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { ids: [logRow.id] },
      });
      if (error) throw error;
      const payload = data as { provider?: string; sent?: number; failed?: number; errors?: Array<{ error: string }>; configured?: boolean; message?: string } | null;
      if (payload?.configured === false) {
        toast.error(payload.message ?? "Wati no configurado");
        return;
      }
      if ((payload?.sent ?? 0) > 0) {
        toast.success(`Mensaje enviado a ${normalized}. Revisa WhatsApp.`);
        onOpenChange(false);
      } else {
        const detail = payload?.errors?.[0]?.error ?? "Sin detalle";
        toast.error(`Fallido: ${detail}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Envío de prueba Wati (1 número)
          </DialogTitle>
          <DialogDescription>
            Envío real a través de Wati con la plantilla <code>invitacion_grabacion_publico</code>. No cuenta en estadísticas (marcado como prueba).
          </DialogDescription>
        </DialogHeader>

        {!isAdmin && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Solo admin</AlertTitle>
            <AlertDescription>No tienes permisos para enviar pruebas.</AlertDescription>
          </Alert>
        )}
        {(!eventId || !sessionId) && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Selecciona evento y sesión</AlertTitle>
            <AlertDescription>Hace falta una sesión seleccionada arriba para cargar participantes con asiento.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label>Teléfono destino</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. 612345678 o +34 612 345 678"
            />
            <div className="text-xs text-muted-foreground mt-1">
              {normalized
                ? <>Normalizado: <Badge variant="secondary">{normalized}</Badge></>
                : phone
                  ? <span className="text-destructive">Número no válido para España</span>
                  : <>Solo móviles/fijos españoles (9 dígitos, 6/7/9) o ya con prefijo 34.</>}
            </div>
          </div>

          <div>
            <Label>Participante de referencia (con asiento)</Label>
            <Select value={participantId} onValueChange={setParticipantId} disabled={!partsQ.data?.length}>
              <SelectTrigger>
                <SelectValue placeholder={
                  partsQ.isLoading
                    ? "Cargando…"
                    : partsQ.data?.length === 0
                      ? "Ningún participante con asiento asignado"
                      : "Selecciona participante"
                } />
              </SelectTrigger>
              <SelectContent>
                {(partsQ.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.people?.first_name ?? ""} {p.people?.last_name ?? ""} · {p.seat_zone}/{p.seat_row}/{p.seat_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground mt-1">
              Sus datos (zona/fila/asiento/token) se usarán para rellenar las variables de la plantilla.
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Se enviará vía Wati al número indicado</AlertTitle>
            <AlertDescription className="text-xs">
              El log queda marcado con <code>wati_test=true</code> y <code>force_resend=true</code>, lo que permite repetir la prueba al mismo número tantas veces como necesites.
              Funciona aunque el flag <code>WHATSAPP_PROVIDER</code> esté todavía en <code>wassenger</code>… <strong>no</strong>: requiere que el flag esté en <code>wati</code>.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Enviando…" : "Enviar prueba"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}