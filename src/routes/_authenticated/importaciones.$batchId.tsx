import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileSpreadsheet, Send, Eraser, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useImportBatch } from "@/lib/use-imports";
import { cleanDniTimestamps } from "@/lib/bulk-send.functions";
import { useDeleteImportBatch } from "@/lib/use-admin-delete";
import { DangerousActionDialog } from "@/components/dangerous-action-dialog";

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
    </div>
  );
}