import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCommunicationLogs } from "@/lib/use-communications";
import { COMM_STATUS_OPTIONS, type CommStatus } from "@/lib/communication-constants";
import { retryCommunication } from "@/lib/bulk-send.functions";

export const Route = createFileRoute("/_authenticated/comunicaciones/cola")({
  component: QueuePage,
});

function QueuePage() {
  const [status, setStatus] = useState<CommStatus | "all">("pendiente");
  const [search, setSearch] = useState("");
  const { data: logs = [], refetch, isLoading } = useCommunicationLogs({
    status: status === "all" ? undefined : status,
  });
  const retryFn = useServerFn(retryCommunication);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) =>
      (l.to_address ?? "").toLowerCase().includes(q) ||
      (l.subject ?? "").toLowerCase().includes(q) ||
      `${l.people?.first_name ?? ""} ${l.people?.last_name ?? ""}`.toLowerCase().includes(q),
    );
  }, [logs, search]);

  const exportCsv = () => {
    const header = ["nombre", "apellidos", "email", "asunto", "estado", "fecha", "cuerpo"];
    const rows = filtered.map((l) => [
      l.people?.first_name ?? "",
      l.people?.last_name ?? "",
      l.to_address ?? "",
      l.subject ?? "",
      l.status,
      l.created_at,
      (l.body ?? "").replace(/\n/g, " "),
    ]);
    const csv =
      [header, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cola-comunicaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Comunicaciones"
        title="Cola de envíos"
        description="Comunicaciones renderizadas pendientes de envío. Mientras Gmail no esté conectado, quedan en cola y se pueden exportar."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
            <Button variant="outline" asChild>
              <Link to="/comunicaciones"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Buscar nombre, email o asunto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={status} onValueChange={(v) => setStatus(v as CommStatus | "all")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {COMM_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Asunto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Error</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin registros</TableCell></TableRow>
              )}
              {filtered.map((l) => {
                const tone = COMM_STATUS_OPTIONS.find((o) => o.value === l.status)?.tone ?? "outline";
                const name = l.people ? `${l.people.first_name} ${l.people.last_name ?? ""}`.trim() : "—";
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("es-ES")}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">{l.to_address ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm max-w-md truncate">{l.subject ?? "—"}</TableCell>
                    <TableCell><Badge variant={tone}>{l.status}</Badge></TableCell>
                    <TableCell className="text-xs text-destructive">{l.error_message ?? ""}</TableCell>
                    <TableCell className="text-right">
                      {(l.status === "fallido" || l.status === "cancelado") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await retryFn({ data: { log_id: l.id } });
                              toast.success("Marcado para reintento");
                              refetch();
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
