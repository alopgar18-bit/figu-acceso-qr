import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, RotateCw, Archive, Trash2, Mail, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useCommunicationLogs } from "@/lib/use-communications";
import { COMM_STATUS_OPTIONS, COMM_CHANNEL_OPTIONS, type CommStatus, type CommChannel, SENDER_OPTIONS, DEFAULT_SENDER } from "@/lib/communication-constants";
import { retryCommunication } from "@/lib/bulk-send.functions";
import { useArchiveCommunicationLogs, useDeleteCommunicationLogs } from "@/lib/use-admin-delete";
import { DangerousActionDialog } from "@/components/dangerous-action-dialog";
import { CommLogDetailDialog, type CommLogDetail } from "@/components/comm-log-detail-dialog";

export const Route = createFileRoute("/_authenticated/comunicaciones/cola")({
  component: QueuePage,
});

function QueuePage() {
  const [status, setStatus] = useState<CommStatus | "all">("pendiente");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data: logs = [], refetch, isLoading } = useCommunicationLogs({
    status: status === "all" ? undefined : status,
    includeArchived,
  });
  const retryFn = useServerFn(retryCommunication);
  const archiveLogs = useArchiveCommunicationLogs();
  const deleteLogs = useDeleteCommunicationLogs();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [senderValue, setSenderValue] = useState<string>(DEFAULT_SENDER.value);
  const [detailLog, setDetailLog] = useState<CommLogDetail | null>(null);
  const [bgBatch, setBgBatch] = useState<{
    ids: string[];
    total: number;
    sent: number;
    failed: number;
    pending: number;
    startedAt: number;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingEmailCount, setPendingEmailCount] = useState<number | null>(null);

  const refreshPendingCount = async () => {
    const { count } = await supabase
      .from("communication_logs")
      .select("id", { count: "exact", head: true })
      .eq("channel", "email")
      .eq("status", "pendiente");
    setPendingEmailCount(count ?? 0);
  };

  useEffect(() => { void refreshPendingCount(); }, [logs]);

  const pollBatchProgress = async (ids: string[]) => {
    const { data, error } = await supabase
      .from("communication_logs")
      .select("id, status")
      .in("id", ids);
    if (error) return;
    let sent = 0, failed = 0, pending = 0;
    for (const r of data ?? []) {
      if (r.status === "enviado") sent++;
      else if (r.status === "fallido") failed++;
      else pending++;
    }
    setBgBatch((prev) => prev ? { ...prev, sent, failed, pending } : prev);
    if (pending === 0 && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      toast.success(`Lote completado: ${sent} enviados · ${failed} fallidos`);
      await refetch();
    }
  };

  const startBatchTracking = (ids: string[]) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setBgBatch({
      ids,
      total: ids.length,
      sent: 0,
      failed: 0,
      pending: ids.length,
      startedAt: Date.now(),
    });
    void pollBatchProgress(ids);
    pollRef.current = setInterval(() => { void pollBatchProgress(ids); }, 2500);
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const sendPendingEmails = async () => {
    setSending(true);
    try {
      const ids = selectedIds.length > 0 ? selectedIds : undefined;
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: ids
          ? { ids, from: senderValue, background: true }
          : { from: senderValue, background: true },
      });
      if (error) throw error;
      if (data?.configured === false) {
        toast.message(data.message ?? "Servicio de email no configurado");
      } else if (data?.background === true) {
        toast.success(
          data.message ?? `Procesando ${data.queued ?? ""} envíos en segundo plano.`,
          { duration: 12000 },
        );
        const queuedIds: string[] = Array.isArray(data.queued_ids) ? data.queued_ids : [];
        if (queuedIds.length > 0) startBatchTracking(queuedIds);
      } else {
        toast.success(`Enviados: ${data?.sent ?? 0} · Fallidos: ${data?.failed ?? 0}`);
      }
      setSelected(new Set());
      await refetch();
      await refreshPendingCount();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sendPendingWhatsapps = async () => {
    setSendingWa(true);
    try {
      const ids = selectedIds.length > 0 ? selectedIds : undefined;
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: ids ? { ids } : {},
      });
      if (error) throw error;
      if (data?.configured === false) {
        toast.message(data.message ?? "Wassenger no configurado");
      } else if (data?.background === true) {
        toast.success(
          data.message ??
            `Procesando ${data.queued ?? ""} envíos en segundo plano. Refresca en 1–2 minutos.`,
          { duration: 12000 },
        );
        const ids: string[] = Array.isArray(data.queued_ids) ? data.queued_ids : [];
        if (ids.length > 0) startBatchTracking(ids);
      } else if (data?.error_code === "WATI_NO_CREDITS") {
        toast.error(
          data.message ??
            "Wati ha rechazado los envíos por falta de créditos. Recarga tu cuenta de Wati y vuelve a intentarlo.",
          { duration: 15000 },
        );
      } else {
        toast.success(`WhatsApps enviados: ${data?.sent ?? 0} · Fallidos: ${data?.failed ?? 0}`);
      }
      setSelected(new Set());
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSendingWa(false);
    }
  };

  const retryNoCreditsFailures = async () => {
    try {
      const { data, error } = await supabase
        .from("communication_logs")
        .select("id")
        .in("channel", ["whatsapp_business", "whatsapp_asistido"])
        .eq("status", "fallido")
        .contains("metadata", { wati_error_code: "WATI_NO_CREDITS" });
      if (error) throw error;
      const rows = (data ?? []) as Array<{ id: string }>;
      if (rows.length === 0) {
        toast.message("No hay envíos de WhatsApp fallidos por falta de créditos.");
        return;
      }
      let ok = 0;
      let ko = 0;
      for (const r of rows) {
        try {
          await retryFn({ data: { log_id: r.id } });
          ok++;
        } catch {
          ko++;
        }
      }
      toast.success(`${ok} reencolados${ko ? ` · ${ko} con error` : ""}`);
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const q = search.toLowerCase();
    return logs.filter((l) =>
      (l.to_address ?? "").toLowerCase().includes(q) ||
      (l.subject ?? "").toLowerCase().includes(q) ||
      `${l.people?.first_name ?? ""} ${l.people?.last_name ?? ""}`.toLowerCase().includes(q),
    );
  }, [logs, search]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((l) => l.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const selectedIds = Array.from(selected);

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

  const FROM_ADDRESS = "Figurarte Casting <casting@figurarte.es>";

  // RFC 2047 encoded-word for non-ASCII headers
  const encodeHeader = (value: string) => {
    if (/^[\x20-\x7E]*$/.test(value)) return value;
    const b64 = typeof window === "undefined"
      ? Buffer.from(value, "utf-8").toString("base64")
      : btoa(unescape(encodeURIComponent(value)));
    return `=?UTF-8?B?${b64}?=`;
  };

  const sanitizeFilename = (s: string) =>
    s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "mensaje";

  const buildEml = (l: (typeof filtered)[number]) => {
    const to = l.to_address ?? "";
    const subject = l.subject ?? "(sin asunto)";
    const body = l.body ?? "";
    const isHtml = /<\/?[a-z][\s\S]*>/i.test(body);
    const date = new Date(l.created_at).toUTCString();
    const headers = [
      `From: ${FROM_ADDRESS}`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${date}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
    ].join("\r\n");
    return `${headers}\r\n\r\n${body.replace(/\r?\n/g, "\r\n")}`;
  };

  const exportEmlZip = async () => {
    const target = selectedIds.length > 0
      ? filtered.filter((l) => selected.has(l.id))
      : filtered;
    const ready = target.filter((l) => l.to_address && l.body);
    if (ready.length === 0) {
      toast.error("No hay comunicaciones con destinatario y cuerpo listas para exportar");
      return;
    }
    const zip = new JSZip();
    ready.forEach((l, i) => {
      const name = `${String(i + 1).padStart(4, "0")}_${sanitizeFilename(
        `${l.people?.first_name ?? ""}_${l.people?.last_name ?? ""}_${l.to_address ?? ""}`,
      )}.eml`;
      zip.file(name, buildEml(l));
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gmail-cola-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${ready.length} mensajes exportados (.eml)`);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Comunicaciones"
        title="Cola de envíos"
        description="Comunicaciones renderizadas pendientes de envío. Exporta como .eml para abrir y enviar desde Gmail (casting@figurarte.es)."
        actions={
          <div className="flex gap-2">
            <Select value={senderValue} onValueChange={setSenderValue}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Remitente" /></SelectTrigger>
              <SelectContent>
                {SENDER_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={sendPendingEmails} disabled={sending}>
              <Send className="h-4 w-4 mr-2" />
              {sending
                ? "Enviando…"
                : selectedIds.length > 0
                  ? `Enviar ${selectedIds.length} seleccionados`
                  : `Enviar TODA la cola${pendingEmailCount != null ? ` (${pendingEmailCount})` : ""}`}
            </Button>
            <Button onClick={sendPendingWhatsapps} disabled={sendingWa} variant="secondary">
              <MessageCircle className="h-4 w-4 mr-2" />
              {sendingWa ? "Enviando WhatsApps…" : "Enviar WhatsApps pendientes"}
            </Button>
            <Button onClick={retryNoCreditsFailures} variant="outline" title="Vuelve a poner en cola los WhatsApps fallidos por falta de créditos de Wati. Úsalo tras recargar saldo en Wati.">
              <RotateCw className="h-4 w-4 mr-2" />
              Reintentar fallidos sin créditos
            </Button>
            <Button onClick={exportEmlZip}>
              <Mail className="h-4 w-4 mr-2" />Descargar .eml para Gmail
            </Button>
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
            <Button variant="outline" asChild>
              <Link to="/comunicaciones"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Link>
            </Button>
          </div>
        }
      />

      {bgBatch && (
        <Card className="mb-4 border-primary/40">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">
                Envío en segundo plano · {bgBatch.total - bgBatch.pending}/{bgBatch.total} procesados
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-emerald-600">{bgBatch.sent} enviados</span>
                <span className="text-red-600">{bgBatch.failed} fallidos</span>
                <span className="text-muted-foreground">{bgBatch.pending} pendientes</span>
                {bgBatch.pending === 0 && (
                  <button
                    className="underline text-muted-foreground"
                    onClick={() => setBgBatch(null)}
                  >
                    Cerrar
                  </button>
                )}
              </div>
            </div>
            <Progress
              value={bgBatch.total > 0 ? ((bgBatch.total - bgBatch.pending) / bgBatch.total) * 100 : 0}
            />
          </CardContent>
        </Card>
      )}

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
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={includeArchived} onCheckedChange={(v) => setIncludeArchived(Boolean(v))} />
              Mostrar archivadas
            </label>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{selectedIds.length} seleccionadas</span>
              <Button
                size="sm"
                variant="outline"
                disabled={archiveLogs.isPending}
                onClick={async () => {
                  try {
                    await archiveLogs.mutateAsync(selectedIds);
                    toast.success("Comunicaciones archivadas");
                    setSelected(new Set());
                  } catch (e) { toast.error((e as Error).message); }
                }}
              >
                <Archive className="h-4 w-4 mr-1" />Archivar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />Eliminar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpiar selección</Button>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Seleccionar todo" />
                </TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Asunto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Error</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Cargando…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Sin registros</TableCell></TableRow>
              )}
              {filtered.map((l) => {
                const tone = COMM_STATUS_OPTIONS.find((o) => o.value === l.status)?.tone ?? "outline";
                const name = l.people ? `${l.people.first_name} ${l.people.last_name ?? ""}`.trim() : "—";
                const subject = l.subject?.trim() || "Sin asunto";
                const channelLabel = COMM_CHANNEL_OPTIONS.find((o) => o.value === l.channel)?.label ?? l.channel;
                const statusLabel = COMM_STATUS_OPTIONS.find((o) => o.value === l.status)?.label ?? l.status;
                const hasWassenger = (l.metadata as Record<string, unknown> | null)?.wassenger_id != null;
                return (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDetailLog(l as unknown as CommLogDetail)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(l.id)}
                        onCheckedChange={() => toggleOne(l.id)}
                        aria-label="Seleccionar"
                      />
                    </TableCell>
                    <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("es-ES")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="whitespace-nowrap">{channelLabel}</Badge>
                      {hasWassenger && (
                        <div className="text-[10px] text-muted-foreground mt-1">Wassenger ✓</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">{l.to_address ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm max-w-md truncate" title={subject}>{subject}</TableCell>
                    <TableCell><Badge variant={tone}>{statusLabel}</Badge></TableCell>
                    <TableCell className="text-xs text-destructive">{l.error_message ?? ""}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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

      <CommLogDetailDialog
        log={detailLog}
        open={!!detailLog}
        onOpenChange={(o) => !o && setDetailLog(null)}
      />

      <DangerousActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar comunicaciones"
        affectedCount={selectedIds.length}
        loading={deleteLogs.isPending}
        destructiveLabel="Eliminar definitivamente"
        description={
          <>
            <p>Se eliminarán <strong>{selectedIds.length}</strong> registros de comunicación de forma permanente.</p>
            <p className="text-muted-foreground">Si solo quieres ocultarlos de la cola sin perder el historial, usa <em>Archivar</em>.</p>
          </>
        }
        onConfirm={async () => {
          try {
            await deleteLogs.mutateAsync(selectedIds);
            toast.success("Comunicaciones eliminadas");
            setSelected(new Set());
          } catch (e) { toast.error((e as Error).message); }
        }}
      />
    </div>
  );
}
