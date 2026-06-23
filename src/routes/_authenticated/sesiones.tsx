import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { Clock, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { SESSION_STATUS_OPTIONS, labelOf } from "@/lib/event-constants";

export const Route = createFileRoute("/_authenticated/sesiones")({
  component: Page,
});

function Page() {
  const [searchText, setSearchText] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const matches = useMatches();

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

  const eventOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of data ?? []) {
      const ev = (s as any).events as { id: string; name: string } | null;
      if (ev?.id && ev?.name) map.set(ev.id, ev.name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = searchText.trim().toLowerCase();
    return data.filter((s) => {
      const ev = (s as any).events as { id: string; name: string } | null;
      if (selectedEventId !== "all" && ev?.id !== selectedEventId) return false;
      if (!q) return true;
      const haystack = [
        s.name,
        ev?.name,
        s.location_name,
        labelOf(SESSION_STATUS_OPTIONS, s.status),
        new Date(s.starts_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, searchText, selectedEventId]);

  const hasFilters = searchText || selectedEventId !== "all";
  const hasChild = matches.some((m) => m.routeId === "/_authenticated/sesiones/$sessionId/plano");

  if (hasChild) return <Outlet />;

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
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar sesiones, eventos, ubicación…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Filtrar por evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los eventos</SelectItem>
                {eventOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters && (
              <button
                onClick={() => { setSearchText(""); setSelectedEventId("all"); }}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 self-center"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="border rounded-md bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Sesión</TableHead>
                  <TableHead>Aforo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Ninguna sesión coincide con los filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((s) => {
                    const ev = (s as any).events as { id: string; name: string } | null;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{new Date(s.starts_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                        <TableCell>
                          <Link to="/eventos/$eventId" params={{ eventId: s.event_id }} className="hover:underline">
                            {ev?.name ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link to="/eventos/$eventId/sesiones/$sessionId" params={{ eventId: s.event_id, sessionId: s.id }} className="font-medium hover:underline">
                            {s.name}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular-nums">{s.capacity}</TableCell>
                        <TableCell><Badge variant="outline">{labelOf(SESSION_STATUS_OPTIONS, s.status)}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Link
                            to="/sesiones/$sessionId/plano"
                            params={{ sessionId: s.id }}
                            className="text-xs text-primary hover:underline"
                          >
                            Ver plano
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {data.length} sesiones
          </div>
        </div>
      )}
    </div>
  );
}
