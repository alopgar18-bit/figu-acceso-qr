import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, Activity, User, CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/logs")({
  component: Page,
});

const ACTION_LABELS: Record<string, string> = {
  "event.create": "Evento creado",
  "import.complete": "Importación completada",
  "participant.create": "Solicitud recibida",
  "participant.approve": "Participante aprobado",
  "ticket.create": "Ticket QR creado",
  "checkin.create": "Check-in registrado",
  "incident.create": "Incidencia creada",
  "incident.resolve": "Incidencia resuelta",
  "report.export": "Informe exportado",
};

function Page() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, actor_email, event_id, session_id, created_at, changes")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        title="Logs de auditoría"
        description="Registro de acciones sensibles: cambios de estado, accesos, envíos, exportaciones y validaciones."
      />

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-12 w-12" />}
          title="Sin registros aún"
          description="Las acciones de la plataforma quedarán registradas aquí."
        />
      ) : (
        <Card className="rounded-none">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acción</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-semibold">{ACTION_LABELS[log.action] ?? log.action}</div>
                          <div className="text-xs text-muted-foreground">{log.action}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{log.entity_type}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{log.actor_email ?? "Sistema"}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                      {log.changes ? JSON.stringify(log.changes) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(log.created_at).toLocaleString("es-ES")}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
