import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SessionForm } from "@/components/session-form";
import { useEvent, useSession, useDeleteSession } from "@/lib/use-events";

export const Route = createFileRoute("/_authenticated/eventos/$eventId/sesiones/$sessionId")({
  component: Page,
});

function Page() {
  const { eventId, sessionId } = Route.useParams();
  const navigate = useNavigate();
  const { data: event } = useEvent(eventId);
  const { data: session, isLoading } = useSession(sessionId);
  const del = useDeleteSession();

  const onDelete = async () => {
    try {
      await del.mutateAsync(sessionId);
      toast.success("Sesión eliminada");
      navigate({ to: "/eventos/$eventId", params: { eventId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/eventos/$eventId" params={{ eventId }}>
          <ArrowLeft className="h-4 w-4 mr-1" />Volver al evento
        </Link>
      </Button>
      <PageHeader
        eyebrow={event?.name ?? "Sesión"}
        title={session?.name ?? "Cargando…"}
        description="Edita los datos operativos de la sesión."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/sesiones/$sessionId/plano" params={{ sessionId }}>
                Ver plano
              </Link>
            </Button>
            <Button asChild>
              <Link
                to="/comunicaciones/envio"
                search={{ event_id: eventId, session_id: sessionId }}
              >
                Enviar invitaciones
              </Link>
            </Button>
            <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar esta sesión?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer. Se eliminarán también los participantes asociados si las reglas lo permiten.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />
      {isLoading || !event || !session ? <Skeleton className="h-96" /> : <SessionForm event={event} session={session} />}
    </div>
  );
}