import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { COMM_CHANNEL_OPTIONS, COMM_STATUS_OPTIONS, type CommChannel, type CommStatus } from "@/lib/communication-constants";

export interface CommLogDetail {
  id: string;
  channel: CommChannel;
  status: CommStatus;
  to_address: string | null;
  subject: string | null;
  body: string | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  metadata: Record<string, unknown> | null;
  people?: { first_name: string; last_name: string | null; email: string | null; phone: string | null } | null;
}

export function CommLogDetailDialog({
  log,
  open,
  onOpenChange,
}: {
  log: CommLogDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!log) return null;
  const channelLabel = COMM_CHANNEL_OPTIONS.find((o) => o.value === log.channel)?.label ?? log.channel;
  const statusOpt = COMM_STATUS_OPTIONS.find((o) => o.value === log.status);
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const wassengerId = typeof meta.wassenger_id === "string" ? meta.wassenger_id : null;
  const messageId = typeof meta.message_id === "string" ? meta.message_id : null;
  const provider = typeof meta.provider === "string" ? meta.provider : null;
  const name = log.people ? `${log.people.first_name} ${log.people.last_name ?? ""}`.trim() : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle de comunicación</DialogTitle>
          <DialogDescription>{name} · {log.to_address ?? "Sin destinatario"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{channelLabel}</Badge>
            <Badge variant={statusOpt?.tone ?? "outline"}>{statusOpt?.label ?? log.status}</Badge>
          </div>

          <Field label="Asunto" value={log.subject ?? "—"} />
          <Field label="Creado" value={new Date(log.created_at).toLocaleString("es-ES")} />
          <Field label="Enviado" value={log.sent_at ? new Date(log.sent_at).toLocaleString("es-ES") : "—"} />

          {provider && <Field label="Proveedor" value={provider} />}
          {wassengerId && (
            <Field
              label="Wassenger ID"
              value={<code className="text-xs bg-muted px-1.5 py-0.5 rounded">{wassengerId}</code>}
            />
          )}
          {messageId && (
            <Field
              label="Message ID"
              value={<code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{messageId}</code>}
            />
          )}

          {log.error_message && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Error</div>
              <div className="text-destructive text-sm whitespace-pre-wrap">{log.error_message}</div>
            </div>
          )}

          {log.body && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Cuerpo</div>
              <div className="border rounded-md p-3 bg-muted/30 max-h-72 overflow-y-auto">
                {/<\/?[a-z][\s\S]*>/i.test(log.body) ? (
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: log.body }} />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm font-sans">{log.body}</pre>
                )}
              </div>
            </div>
          )}

          {Object.keys(meta).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Metadata completa</div>
              <pre className="text-xs bg-muted/40 border rounded-md p-3 overflow-x-auto">
                {JSON.stringify(meta, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground w-32 shrink-0">{label}</div>
      <div className="flex-1">{value}</div>
    </div>
  );
}