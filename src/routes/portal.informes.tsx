import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";
import { BarChart3, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useClientContext, useClientEvents } from "@/lib/use-client-portal";

export const Route = createFileRoute("/portal/informes")({
  component: Reports,
});

function Reports() {
  const { data: ctx } = useClientContext();
  const perms = ctx?.perms;
  const { data: events = [] } = useClientEvents(ctx?.clientIds);

  const canExport = perms?.export_data || perms?.export_pdf;

  if (!canExport) {
    return (
      <div>
        <PageHeader eyebrow="Portal cliente" title="Informes" />
        <EmptyState icon={<BarChart3 className="h-12 w-12" />} title="Sin permiso de descarga"
          description="Tu acceso no incluye la descarga de informes. Contacta con FIGURARTE para activarlo." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Portal cliente"
        title="Informes"
        description="Descarga el resumen por evento según los permisos asignados."
      />
      {events.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-12 w-12" />} title="Sin eventos disponibles" />
      ) : (
        <div className="grid gap-3">
          {events.map((e) => (
            <Card key={e.id} className="rounded-none">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wider">{e.name}</CardTitle>
                <div className="text-xs text-muted-foreground">{e.starts_at ? new Date(e.starts_at).toLocaleDateString("es-ES") : ""}</div>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/portal/eventos/$eventId" params={{ eventId: e.id }}>
                    Ver detalle
                  </Link>
                </Button>
                {perms?.export_data && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Download className="h-3 w-3" /> CSV disponible en el detalle
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}