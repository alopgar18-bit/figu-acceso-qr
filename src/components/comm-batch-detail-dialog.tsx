import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CommSummaryRow, PersonDetail } from "@/lib/use-comm-summary";
import { COMM_STATUS_OPTIONS } from "@/lib/communication-constants";
import { Download, AlertTriangle } from "lucide-react";

function statusBadge(status: PersonDetail["email_status"]) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const opt = COMM_STATUS_OPTIONS.find((o) => o.value === status);
  return <Badge variant={opt?.tone ?? "outline"}>{opt?.label ?? status}</Badge>;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(filename: string, rows: PersonDetail[]) {
  const header = [
    "Nombre", "Apellidos", "Email", "Teléfono",
    "Estado email", "Confirmado Resend", "Error email",
    "Estado WhatsApp", "Confirmado Wassenger", "Error WhatsApp",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.first_name, r.last_name, r.email, r.phone,
      r.email_status ?? "", r.email_confirmed_resend ? "sí" : "no", r.email_error ?? "",
      r.whatsapp_status ?? "", r.whatsapp_confirmed_wassenger ? "sí" : "no", r.whatsapp_error ?? "",
    ].map(csvEscape).join(","));
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CommBatchDetailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: CommSummaryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const details = row?.details ?? [];
  const failed = useMemo(() => details.filter((d) => d.has_failure), [details]);
  if (!row) return null;
  const base = (row.batch_label || "lote").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row.batch_label}</DialogTitle>
          <DialogDescription>
            {row.event_name ?? "—"} · {row.session_name ?? "—"} · {details.length} destinatario{details.length === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={() => downloadCSV(`${base}-destinatarios.csv`, details)}>
            <Download /> Exportar CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={failed.length === 0}
            onClick={() => downloadCSV(`${base}-fallidos.csv`, failed)}
          >
            <AlertTriangle /> Exportar fallidos ({failed.length})
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Resend</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Wassenger</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">Sin destinatarios</TableCell></TableRow>
            )}
            {details.map((d) => (
              <TableRow key={d.key}>
                <TableCell className="text-sm font-medium">{`${d.first_name} ${d.last_name}`.trim() || "—"}</TableCell>
                <TableCell className="text-sm">{d.email || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm">{d.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>{statusBadge(d.email_status)}</TableCell>
                <TableCell>
                  {d.email_status
                    ? d.email_confirmed_resend
                      ? <Badge variant="secondary">Sí</Badge>
                      : <Badge variant="outline">No</Badge>
                    : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell>{statusBadge(d.whatsapp_status)}</TableCell>
                <TableCell>
                  {d.whatsapp_status
                    ? d.whatsapp_confirmed_wassenger
                      ? <Badge variant="secondary">Sí</Badge>
                      : <Badge variant="outline">No</Badge>
                    : <span className="text-muted-foreground text-xs">—</span>}
                </TableCell>
                <TableCell className="text-xs text-destructive max-w-xs truncate" title={d.email_error ?? d.whatsapp_error ?? undefined}>
                  {d.email_error || d.whatsapp_error || ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}