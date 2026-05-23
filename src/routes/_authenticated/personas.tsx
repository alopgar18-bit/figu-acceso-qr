import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useParticipants } from "@/lib/use-participants";

export const Route = createFileRoute("/_authenticated/personas")({
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const { data: participants = [], isLoading } = useParticipants({});
  const peopleById = new Map<string, (typeof participants)[number]>();
  for (const participant of participants) {
    if (participant.person_id && !peopleById.has(participant.person_id)) peopleById.set(participant.person_id, participant);
  }
  const rows = Array.from(peopleById.values());

  return (
    <div>
      <PageHeader
        eyebrow="Base de datos"
        title="Personas"
        description="Base de datos global de personas que han participado o pueden participar en eventos FIGURARTE."
        actions={<Button className="uppercase tracking-wider"><Plus className="h-4 w-4 mr-2" />Nuevo</Button>}
      />
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="Base de datos vacía"
          description="Las personas se añaden automáticamente al enviar el formulario o por importación."
        />
      ) : (
        <div className="border rounded-md bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.person_id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/solicitudes/$participantId", params: { participantId: row.id } })}
                >
                  <TableCell className="font-medium">
                    {[row.people?.first_name, row.people?.last_name].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.people?.email ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.people?.phone ?? "—"}</TableCell>
                  <TableCell className="text-sm">{row.events?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
