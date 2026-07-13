import { useState, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileSpreadsheet, Send, Eraser, Trash2, Inbox, Download, Upload, Wrench } from "lucide-react";
import { toast } from "sonner";
import { read, utils, write } from "xlsx";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useImportBatch } from "@/lib/use-imports";
import { cleanDniTimestamps } from "@/lib/bulk-send.functions";
import { getImportBatchRowResults, backfillBatchRowResults, repairImportBatch } from "@/lib/imports.functions";
import { useDeleteImportBatch } from "@/lib/use-admin-delete";
import { DangerousActionDialog } from "@/components/dangerous-action-dialog";
import { BulkProgressCard } from "@/components/bulk-progress-card";

export const Route = createFileRoute("/_authenticated/importaciones/$batchId")({
  component: BatchDetailPage,
});

function BatchDetailPage() {
  const { batchId } = Route.useParams();
  const navigate = useNavigate();
  const { data: batch, isLoading } = useImportBatch(batchId);
  const cleanFn = useServerFn(cleanDniTimestamps);
  const deleteBatch = useDeleteImportBatch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [includeParticipants, setIncludeParticipants] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [backfilling, setBackfilling] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const fetchRows = useServerFn(getImportBatchRowResults);
  const backfillFn = useServerFn(backfillBatchRowResults);
  const repairFn = useServerFn(repairImportBatch);
  const { data: rowResults = [] } = useQuery({
    queryKey: ["import_row_results", batchId],
    queryFn: () => fetchRows({ data: { batchId } }),
    enabled: !!batchId,
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Cargando lote...</div>;
  if (!batch) return <div className="p-8 text-sm text-muted-foreground">Lote no encontrado.</div>;

  const events = (batch as unknown as { events: { name: string } | null }).events;
  const session = (batch as unknown as { event_sessions: { name: string } | null }).event_sessions;
  const mappings = (batch as unknown as { import_mappings: Array<{ id: string; source_column: string; target_field: string }> }).import_mappings ?? [];
  const errors = Array.isArray(batch.errors) ? (batch.errors as Array<{ row: number; reason: string }>) : [];
  const suspiciousDniMapping = mappings.some(
    (m) =>
      m.target_field === "dni" &&
      /marca|timestamp|hora|fecha/i.test(m.source_column),
  );

  const counts = rowResults.reduce(
    (acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const filteredRows = outcomeFilter === "all"
    ? rowResults
    : rowResults.filter((r) => r.outcome === outcomeFilter);

  const exportToExcel = () => {
    const rows = filteredRows.map((r) => {
      const p = (r as unknown as { event_participants?: { people?: { first_name?: string; last_name?: string; email?: string; phone?: string } } }).event_participants;
      return {
        Fila: r.row_number,
        Resultado: r.outcome,
        Nombre: p?.people?.first_name ?? (r.raw_row as Record<string, unknown>)?.first_name ?? "",
        Apellido: p?.people?.last_name ?? (r.raw_row as Record<string, unknown>)?.last_name ?? "",
        Email: p?.people?.email ?? "",
        Teléfono: p?.people?.phone ?? "",
        Motivo: r.match_reason ?? "",
        Error: r.error_message ?? "",
        ParticipanteId: r.participant_id ?? "",
      };
    });
    const wb = utils.book_new();
    utils.book_append_sheet(wb, utils.json_to_sheet(rows), "Filas");
    const wbout = write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-${batch.filename}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBackfillUpload = async (file: File) => {
    setBackfilling(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      // Heuristic column detection
      const firstKeys = Object.keys(json[0] ?? {});
      const nameCol = firstKeys.find((k) => /nombre|first.?name|name/i.test(k));
      const lastCol = firstKeys.find((k) => /apellid|last.?name|surname/i.test(k));
      if (!nameCol) throw new Error("No se encontró columna de nombre en el Excel");
      const rows = json
        .map((r, idx) => ({
          rowIndex: idx + 2,
          first_name: String(r[nameCol] ?? "").trim(),
          last_name: lastCol ? String(r[lastCol] ?? "").trim() : null,
          raw: r,
        }))
        .filter((r) => r.first_name);
      if (rows.length === 0) throw new Error("El Excel no contiene filas válidas");
      const res = await backfillFn({ data: { batchId, rows } });
      toast.success(
        `Auditoría: ${res.inserted} nuevos · ${res.updated_in_session} actualizados en la sesión · ${res.updated_in_other_session} en otra sesión · ${res.person_exists_no_participation} sin participación · ${res.not_found} no encontrados`,
      );
      // Si hay filas "perdidas" en otra sesión, las dejamos pre-filtradas.
      if (res.updated_in_other_session > 0) setOutcomeFilter("updated_in_other_session");
      qc.invalidateQueries({ queryKey: ["import_row_results", batchId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBackfilling(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Importación"
        title={batch.filename}
        description={batch.source ?? "Sin origen indicado"}
        actions={
          <div className="flex gap-2">
            <Button asChild>
              <Link
                to="/comunicaciones/envio"
                search={{ batch_id: batchId, event_id: batch.event_id ?? undefined, session_id: batch.session_id ?? undefined }}
              >
                <Send className="h-4 w-4 mr-2" />Enviar invitaciones a esta importación
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                to="/solicitudes"
                search={{ eventId: batch.event_id ?? undefined, sessionId: batch.session_id ?? undefined, importBatchId: batchId }}
              >
                <Inbox className="h-4 w-4 mr-2" />Ver solicitudes
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setRepairOpen(true)}
              disabled={repairing}
            >
              <Wrench className="h-4 w-4 mr-2" />Reparar lote
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => { setIncludeParticipants(false); setConfirmOpen(true); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />Eliminar solo el lote
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setIncludeParticipants(true); setConfirmOpen(true); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />Eliminar lote + participantes
            </Button>
            <Button variant="outline" asChild>
              <Link to="/importaciones"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Link>
            </Button>
          </div>
        }
      />

      <DangerousActionDialog
        open={repairOpen}
        onOpenChange={setRepairOpen}
        title="Reparar lote de importación"
        affectedCount={batch.total_rows ?? 0}
        loading={repairing}
        destructiveLabel="Reparar ahora"
        description={
          <>
            <p>Esta acción es <strong>segura e idempotente</strong>. Sobre este lote:</p>
            <ul className="list-disc pl-5">
              <li>Recupera filas que quedaron fusionadas por email/teléfono en el algoritmo antiguo (se crearán participaciones independientes con VIS si hace falta).</li>
              <li>Vuelve a etiquetar todas las participaciones con este lote para que aparezcan en «Envío masivo» y «Ver solicitudes».</li>
              <li>Emite QR pendientes para los que estén en un estado con entrada (regla de no-degradación: nunca borra QR ni baja el estado).</li>
            </ul>
            <p className="text-muted-foreground">No es necesario volver a subir el Excel: se usa la auditoría guardada del lote.</p>
          </>
        }
        onConfirm={async () => {
          setRepairing(true);
          try {
            const res = await repairFn({ data: { batchId } });
            toast.success(
              `Reparado: ${res.recovered} recuperados · ${res.tagged} re-etiquetados · ${res.ticketsCreated} QR emitidos · ${res.rowResultsFixed} filas corregidas · total vinculado: ${res.linkedCount ?? "?"}`,
            );
            qc.invalidateQueries({ queryKey: ["import_row_results", batchId] });
            qc.invalidateQueries({ queryKey: ["import_batch", batchId] });
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setRepairing(false);
          }
        }}
      />

      <DangerousActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={includeParticipants ? "Eliminar lote y participantes" : "Eliminar lote de importación"}
        affectedCount={includeParticipants ? batch.imported_rows ?? 0 : 1}
        loading={deleteBatch.isPending}
        destructiveLabel="Eliminar definitivamente"
        description={
          includeParticipants ? (
            <>
              <p>Se eliminarán de forma <strong>permanente</strong>:</p>
              <ul className="list-disc pl-5">
                <li>El lote de importación y su mapeo.</li>
                <li>Los <strong>{batch.imported_rows ?? 0} participantes</strong> creados por esta importación.</li>
                <li>Sus QR, check-ins, acompañantes, consentimientos y comunicaciones asociadas.</li>
              </ul>
              <p className="text-destructive">Esta acción no se puede deshacer.</p>
            </>
          ) : (
            <p>Se eliminará el registro del lote y su mapeo. Los participantes creados se mantienen.</p>
          )
        }
        onConfirm={async () => {
          try {
            await deleteBatch.mutateAsync({ batchId, deleteParticipants: includeParticipants });
            toast.success("Lote eliminado");
            navigate({ to: "/importaciones" });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      {suspiciousDniMapping && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Mapeo sospechoso</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              Se detectó una columna tipo "Marca temporal" mapeada a DNI. Esto suele estropear los DNI con fechas.
              Puedes limpiar los DNI que parezcan fechas (no se borra ningún registro).
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const res = await cleanFn({ data: { batch_id: batchId } });
                  toast.success(`DNI limpiados: ${res.cleaned}`);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Eraser className="h-4 w-4 mr-2" />Limpiar DNI con marcas temporales
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {(batch.status === "procesando" || batch.status === "pendiente") && (
        <div className="mb-6">
          <BulkProgressCard
            title="Importación en curso…"
            current={batch.imported_rows ?? 0}
            total={batch.total_rows ?? 0}
            stats={[
              { label: "Importadas", value: batch.imported_rows ?? 0, tone: "ok" },
              { label: "Errores", value: batch.error_rows ?? 0, tone: (batch.error_rows ?? 0) > 0 ? "warn" : undefined },
            ]}
          />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader><CardDescription>Evento / Sesión</CardDescription><CardTitle className="text-lg">{events?.name ?? "—"}</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{session?.name ?? "Sin sesión"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Estado</CardDescription><CardTitle><Badge>{batch.status.replace(/_/g, " ")}</Badge></CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="flex justify-between"><span>Total</span><strong>{batch.total_rows}</strong></div>
            <div className="flex justify-between"><span>Importadas</span><strong>{batch.imported_rows}</strong></div>
            <div className="flex justify-between"><span>Errores</span><strong>{batch.error_rows}</strong></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardDescription>Fechas</CardDescription><CardTitle className="text-lg flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /></CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Creado</span><span>{new Date(batch.created_at).toLocaleString("es-ES")}</span></div>
            {batch.completed_at && <div className="flex justify-between"><span className="text-muted-foreground">Finalizado</span><span>{new Date(batch.completed_at).toLocaleString("es-ES")}</span></div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Mapeo de columnas</CardTitle></CardHeader>
          <CardContent>
            {mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se guardó mapeo.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Columna origen</TableHead><TableHead>Campo destino</TableHead></TableRow></TableHeader>
                <TableBody>
                  {mappings.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.source_column}</TableCell>
                      <TableCell>{m.target_field}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Errores ({errors.length})</CardTitle></CardHeader>
          <CardContent>
            {errors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin errores.</p>
            ) : (
              <ScrollArea className="h-72">
                <ul className="text-sm space-y-1">
                  {errors.map((e, i) => (
                    <li key={i}><Badge variant="outline" className="mr-2">Fila {e.row}</Badge>{e.reason}</li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Auditoría por fila</CardTitle>
            <CardDescription>
              {rowResults.length === 0
                ? "Esta importación no tiene auditoría guardada. Sube el Excel original para reconstruirla (sólo lectura: no toca participantes ni QR)."
                : `${rowResults.length} filas · Nuevos: ${(counts.inserted_in_session ?? 0) + (counts.inserted ?? 0)} · Actualizadas en la sesión: ${(counts.updated_in_session ?? 0) + (counts.updated ?? 0)} · En otra sesión: ${counts.updated_in_other_session ?? 0} · Sin participación: ${counts.person_exists_no_participation ?? 0} · No encontradas: ${counts.not_found ?? 0} · Errores: ${counts.errored ?? 0}`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleBackfillUpload(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={backfilling}
            >
              <Upload className="h-4 w-4 mr-2" />
              {rowResults.length === 0 ? "Subir Excel original" : "Re-cargar auditoría"}
            </Button>
            {rowResults.length > 0 && (
              <>
                <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
                  <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="inserted_in_session">Nuevos en la sesión</SelectItem>
                    <SelectItem value="updated_in_session">Actualizados en la sesión</SelectItem>
                    <SelectItem value="updated_in_other_session">En otra sesión</SelectItem>
                    <SelectItem value="person_exists_no_participation">Sin participación</SelectItem>
                    <SelectItem value="not_found">No encontradas</SelectItem>
                    <SelectItem value="errored">Errores</SelectItem>
                    <SelectItem value="inserted">Nuevos (legacy)</SelectItem>
                    <SelectItem value="updated">Actualizados (legacy)</SelectItem>
                    <SelectItem value="skipped">Omitidos (legacy)</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={exportToExcel}>
                  <Download className="h-4 w-4 mr-2" />Exportar
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        {rowResults.length > 0 && (
          <CardContent>
            <ScrollArea className="h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Fila</TableHead>
                    <TableHead className="w-28">Resultado</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => {
                    const p = (r as unknown as { event_participants?: { id: string; people?: { first_name?: string; last_name?: string } } }).event_participants;
                    const raw = r.raw_row as Record<string, unknown> | null;
                    const name = p?.people
                      ? `${p.people.first_name ?? ""} ${p.people.last_name ?? ""}`.trim()
                      : `${(raw?.first_name as string) ?? ""} ${(raw?.last_name as string) ?? ""}`.trim();
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="tabular-nums">{r.row_number}</TableCell>
                        <TableCell>
                          <Badge variant={
                            r.outcome === "inserted_in_session" || r.outcome === "inserted" ? "default"
                            : r.outcome === "updated_in_session" || r.outcome === "updated" ? "secondary"
                            : r.outcome === "updated_in_other_session" ? "destructive"
                            : r.outcome === "not_found" || r.outcome === "errored" ? "destructive"
                            : "outline"
                          }>{r.outcome}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.error_message ?? r.match_reason ?? ""}
                        </TableCell>
                        <TableCell>
                          {r.participant_id && (
                            <Button variant="ghost" size="sm" asChild>
                              <Link
                                to="/solicitudes/$participantId"
                                params={{ participantId: r.participant_id }}
                              >Ver ficha</Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        )}
      </Card>
    </div>
  );
}