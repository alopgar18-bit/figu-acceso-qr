import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAllIncidents } from "@/lib/use-access";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/incidencias")({
  component: Page,
});

function Page() {
  const { data, isLoading } = useAllIncidents();
  return (
    <div>
      <PageHeader
        eyebrow="Acceso"
        title="Incidencias"
        description="Incidencias registradas durante el control de acceso a las sesiones."
      />
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-12 w-12" />}
          title="Sin incidencias"
          description="Cuando un validador o coordinador registre una incidencia aparecerá aquí."
        />
      ) : (
        <Card className="divide-y">
          {data.map((i) => {
            const ev = i.events as { name: string } | null;
            const ss = i.event_sessions as { name: string } | null;
            return (
              <div key={i.id} className="p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{i.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {ev?.name ?? "—"}{ss ? ` · ${ss.name}` : ""}
                  </div>
                  {i.description && <p className="text-sm text-muted-foreground mt-1">{i.description}</p>}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <Badge variant={i.severity === "critica" || i.severity === "alta" ? "destructive" : "secondary"}>{i.severity}</Badge>
                  <Badge variant="outline" className="block">{i.status}</Badge>
                  <div className="text-xs text-muted-foreground">{format(new Date(i.created_at), "PPp", { locale: es })}</div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
