import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useEvents, useEventSessions } from "@/lib/use-events";
import { useCommSummary, type CommSummaryRow } from "@/lib/use-comm-summary";
import { useInvitationKpis } from "@/lib/use-invitation-kpis";
import { CommBatchDetailDialog } from "./comm-batch-detail-dialog";

export function CommSummaryPanel() {
  const [eventId, setEventId] = useState<string>("all");
  const [sessionId, setSessionId] = useState<string>("all");
  const [activeRow, setActiveRow] = useState<CommSummaryRow | null>(null);
  const { data: events = [] } = useEvents();
  const { data: sessions = [] } = useEventSessions(eventId === "all" ? undefined : eventId);
  const { data, isLoading } = useCommSummary({
    eventId: eventId === "all" ? undefined : eventId,
    sessionId: sessionId === "all" ? undefined : sessionId,
  });

  const stats = useMemo(
    () => [
      { label: "Total destinatarios", value: data?.total ?? 0, tone: "default" as const },
      { label: "Enviados · Email", value: data?.enviados_email ?? 0, tone: "secondary" as const },
      { label: "Email · Confirmados Resend", value: data?.email_confirmados_resend ?? 0, tone: "secondary" as const },
      { label: "Email · Sin confirmación", value: data?.email_sin_confirmacion ?? 0, tone: "outline" as const },
      { label: "Enviados · WhatsApp", value: data?.enviados_whatsapp ?? 0, tone: "secondary" as const },
      { label: "WhatsApp · Confirmados Wassenger", value: data?.whatsapp_confirmados_wassenger ?? 0, tone: "secondary" as const },
      { label: "Fallidos · Email", value: data?.fallidos_email ?? 0, tone: "destructive" as const },
      { label: "Fallidos · WhatsApp", value: data?.fallidos_whatsapp ?? 0, tone: "destructive" as const },
      { label: "Sin email", value: data?.sin_email ?? 0, tone: "outline" as const },
      { label: "Sin teléfono", value: data?.sin_telefono ?? 0, tone: "outline" as const },
      { label: "Pendientes", value: data?.pendientes ?? 0, tone: "outline" as const },
    ],
    [data],
  );

  const senderRows = useMemo(() => {
    const entries = Object.entries(data?.email_por_remitente ?? {});
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
  }, [data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2">
          <Select value={eventId} onValueChange={(v) => { setEventId(v); setSessionId("all"); }}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los eventos</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sessionId} onValueChange={setSessionId} disabled={eventId === "all"}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Sesión" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las sesiones</SelectItem>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name ?? s.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold">{s.value}</span>
                <Badge variant={s.tone}>&nbsp;</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-medium">Emails enviados por remitente</div>
          {senderRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sin envíos de email en el filtro seleccionado.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {senderRows.map(([from, count]) => (
                <Badge key={from} variant="outline" className="text-sm">
                  <span className="font-mono mr-2">{from}</span>
                  <span className="font-semibold">{count}</span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote / campaña</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Sesión</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">✉ Env</TableHead>
                <TableHead className="text-right">✉ Err</TableHead>
                <TableHead className="text-right">WA Env</TableHead>
                <TableHead className="text-right">WA Err</TableHead>
                <TableHead className="text-right">Sin email</TableHead>
                <TableHead className="text-right">Sin tel.</TableHead>
                <TableHead className="text-right">Pend.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && (data?.rows.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">Sin envíos en el filtro seleccionado</TableCell></TableRow>
              )}
              {data?.rows.map((r: CommSummaryRow) => (
                <TableRow key={r.batch_id ?? "none"} className="cursor-pointer" onClick={() => setActiveRow(r)}>
                  <TableCell className="text-sm">
                    <div className="font-medium">{r.batch_label}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleString("es-ES") : "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.event_name ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.session_name ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{r.total}</TableCell>
                  <TableCell className="text-right">{r.enviados_email}</TableCell>
                  <TableCell className="text-right text-destructive">{r.fallidos_email}</TableCell>
                  <TableCell className="text-right">{r.enviados_whatsapp}</TableCell>
                  <TableCell className="text-right text-destructive">{r.fallidos_whatsapp}</TableCell>
                  <TableCell className="text-right">{r.sin_email}</TableCell>
                  <TableCell className="text-right">{r.sin_telefono}</TableCell>
                  <TableCell className="text-right">{r.pendientes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <CommBatchDetailDialog row={activeRow} open={!!activeRow} onOpenChange={(o) => !o && setActiveRow(null)} />
    </div>
  );
}