import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getImportDuplicateReport } from "@/lib/imports.functions";
import { exportImportDuplicateReport } from "@/lib/import-duplicates-export";

export function ImportDuplicateSummary({ batchId, filename }: { batchId: string; filename: string }) {
  const fetchReport = useServerFn(getImportDuplicateReport);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["import-duplicate-report", batchId],
    queryFn: () => fetchReport({ data: { batchId } }), staleTime: 30_000,
  });
  return (
    <section className="space-y-3" aria-labelledby="import-duplicates-title">
      <h2 id="import-duplicates-title" className="text-lg font-semibold">Posibles duplicados de personas</h2>
      {isPending ? <p className="text-sm text-muted-foreground">Preparando informe…</p> : isError ? (
        <div className="flex items-center gap-3"><span className="text-sm">No se pudo obtener el informe.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button></div>
      ) : data ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">{data.groups} grupos · {data.possibleDuplicateRows} filas para revisar · {data.dniWarnings.length} DNI compartidos</p>
          <Button variant="outline" size="sm" onClick={() => exportImportDuplicateReport(data, filename)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Informe de posibles duplicados (Excel)
          </Button>
        </div>
      ) : null}
    </section>
  );
}