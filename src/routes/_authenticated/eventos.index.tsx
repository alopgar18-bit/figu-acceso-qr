import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Plus, Search, ChevronRight } from "lucide-react";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useEvents } from "@/lib/use-events";
import {
  EVENT_STATUS_OPTIONS, EVENT_TYPE_OPTIONS, labelOf,
} from "@/lib/event-constants";

export const Route = createFileRoute("/_authenticated/eventos/")({
  component: Page,
});

function Page() {
  const { data: events, isLoading } = useEvents();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");

  const filtered = useMemo(() => {
    return (events ?? []).filter((e) => {
      if (status !== "all" && e.status !== status) return false;
      if (type !== "all" && e.event_type !== type) return false;
      if (q && !`${e.name} ${e.city ?? ""} ${e.location_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [events, q, status, type]);

  return (
    <div>
      <PageHeader
        eyebrow="Operativa"
        title="Eventos"
        description="Crea y gestiona eventos: Público TV, grabaciones, castings, premieres y producciones."
        actions={
          <Button asChild className="uppercase tracking-wider">
            <Link to="/eventos/nuevo"><Plus className="h-4 w-4 mr-2" />Nuevo evento</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-60">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, ciudad o ubicación" className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {EVENT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {EVENT_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title={events?.length ? "Sin resultados" : "Aún no hay eventos"}
          description={events?.length ? "Ajusta los filtros para ver eventos." : "Crea tu primer evento para empezar a publicar formularios y gestionar audiencia."}
          action={!events?.length && (
            <Button asChild><Link to="/eventos/nuevo"><Plus className="h-4 w-4 mr-2" />Crear evento</Link></Button>
          )}
        />
      ) : (
        <div className="border rounded-md bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id} className="cursor-pointer">
                  <TableCell>
                    <Link to="/eventos/$eventId" params={{ eventId: e.id }} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                    {e.slug && <div className="text-xs text-muted-foreground">/{e.slug}</div>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(e as any).clients?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{labelOf(EVENT_TYPE_OPTIONS, e.event_type)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[e.city, e.location_name].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={e.status} />
                  </TableCell>
                  <TableCell>
                    <Link to="/eventos/$eventId" params={{ eventId: e.id }}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    borrador: "bg-muted text-muted-foreground",
    publicado: "bg-primary text-primary-foreground",
    cerrado: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    cancelado: "bg-destructive/20 text-destructive",
    archivado: "bg-secondary text-secondary-foreground",
  };
  return (
    <Badge variant="outline" className={variants[status] ?? ""}>
      {labelOf(EVENT_STATUS_OPTIONS, status as any)}
    </Badge>
  );
}
