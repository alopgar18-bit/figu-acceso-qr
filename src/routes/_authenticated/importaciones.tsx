import { createFileRoute, Link } from "@tanstack/react-router";
import { Upload, Plus, FileSpreadsheet } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useImportBatches } from "@/lib/use-imports";

export const Route = createFileRoute("/_authenticated/importaciones")({
  component: Page,
});

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completada: "secondary",
  completada_con_errores: "outline",
  fallida: "destructive",
  procesando: "default",
  pendiente: "outline",
};

function Page() {
  const { data: batches = [], isLoading } = useImportBatches();

  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Importaciones"
        description="Importa personas o participantes desde Excel/CSV con mapeo de columnas y detección de duplicados."
        actions={
          <Button asChild className="uppercase tracking-wider">
            <Link to="/importaciones/nueva"><Plus className="h-4 w-4 mr-2" />Nueva importación</Link>
          </Button>
        }
      />

      {!isLoading && batches.length === 0 ? (
        <EmptyState
          icon={<Upload className="h-12 w-12" />}
          title="Sin importaciones recientes"
          description="Sube un archivo Excel o CSV para añadir personas en bloque."
          action={
            <Button asChild>
              <Link to="/importaciones/nueva"><Plus className="h-4 w-4 mr-2" />Nueva importación</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Evento / Sesión</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Filas</TableHead>
                  <TableHead className="text-right">Importadas</TableHead>
                  <TableHead className="text-right">Errores</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const ev = (b as unknown as { events: { name: string } | null }).events;
                  const ss = (b as unknown as { event_sessions: { name: string } | null }).event_sessions;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                          {b.filename}
                        </div>
                        {b.source && <div className="text-xs text-muted-foreground ml-6">{b.source}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {ev?.name ?? "—"}
                        {ss && <div className="text-xs text-muted-foreground">{ss.name}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_TONE[b.status] ?? "outline"}>{b.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.total_rows}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.imported_rows}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.error_rows}</TableCell>
                      <TableCell className="text-xs">{new Date(b.created_at).toLocaleString("es-ES")}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/importaciones/$batchId" params={{ batchId: b.id }}>Ver</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
