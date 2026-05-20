import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/page-header";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useClientContext, useClientIncidents } from "@/lib/use-client-portal";

export const Route = createFileRoute("/portal/incidencias")({
  component: Page,
});

function Page() {
  const { data: ctx, isLoading } = useClientContext();
  const { data: incidents = [] } = useClientIncidents();

  if (isLoading) return null;
  if (!ctx?.perms.see_incidents) return <Navigate to="/portal" />;

  return (
    <div>
      <PageHeader eyebrow="Portal cliente" title="Incidencias" description="Incidencias registradas durante tus eventos." />
      {incidents.length === 0 ? (
        <EmptyState icon={<AlertTriangle className="h-12 w-12" />} title="Sin incidencias" />
      ) : (
        <ul className="divide-y border bg-background">
          {incidents.map((i) => (
            <li key={i.id} className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 mt-1 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{i.title}</span>
                  <Badge variant="outline" className="text-[10px]">{i.severity}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{i.status}</Badge>
                </div>
                {i.description && <p className="text-sm text-muted-foreground mt-1">{i.description}</p>}
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">
                  {i.events?.name ?? "—"} · {i.event_sessions?.name ?? ""} · {new Date(i.created_at).toLocaleString("es-ES")}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}