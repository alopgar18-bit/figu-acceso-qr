import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { SESSION_STATUS_OPTIONS, labelOf } from "@/lib/event-constants";

export const Route = createFileRoute("/_authenticated/sesiones")({
  component: Page,
});

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["all-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_sessions")
        .select("*, events(id, name)")
        .order("starts_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Sesiones"
        description="Vista cronológica de todas las sesiones programadas."
      />
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-12 w-12" />}
          title="Sin sesiones todavía"
          description="Crea un evento y añade su primera sesión para empezar."
        />
      ) : (
        <div className="border rounded-md bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha y hora</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Sesión</TableHead>
                <TableHead>Aforo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{new Date(s.starts_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                  <TableCell>
                    <Link to="/eventos/$eventId" params={{ eventId: s.event_id }} className="hover:underline">
                      {(s as any).events?.name ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to="/eventos/$eventId/sesiones/$sessionId" params={{ eventId: s.event_id, sessionId: s.id }} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{s.capacity}</TableCell>
                  <TableCell><Badge variant="outline">{labelOf(SESSION_STATUS_OPTIONS, s.status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
