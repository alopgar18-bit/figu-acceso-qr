import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  ArrowLeft, Pencil, Plus, MapPin, CalendarDays, Users, Tag,
  CheckCircle2, UserCheck, ScanLine, Inbox, AlertCircle, Mail,
} from "lucide-react";

import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  useEvent, useEventSessions, useSessionStats,
} from "@/lib/use-events";
import {
  EVENT_STATUS_OPTIONS, EVENT_TYPE_OPTIONS, SESSION_STATUS_OPTIONS, labelOf,
} from "@/lib/event-constants";

export const Route = createFileRoute("/_authenticated/eventos/$eventId")({
  component: Page,
});

function Page() {
  const { eventId } = Route.useParams();
  const location = useLocation();
  const { data: event, isLoading } = useEvent(eventId);
  const { data: sessions = [], isLoading: loadingSessions } = useEventSessions(eventId);
  const { data: stats } = useSessionStats(eventId);
  const isChildRoute = location.pathname !== `/eventos/${eventId}`;

  if (isChildRoute) {
    return <Outlet />;
  }

  if (isLoading || !event) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const validationWarnings: string[] = [];
  if (event.user_can_choose_session && sessions.length > 0 && !sessions.some((s) => s.user_selectable)) {
    validationWarnings.push("El evento permite al usuario elegir sesión, pero ninguna sesión está marcada como seleccionable.");
  }
  if (event.requires_image_consent && !event.requires_recording) {
    validationWarnings.push("Se requiere consentimiento de imagen pero el evento no tiene grabación marcada. Revisa la coherencia.");
  }
  if (sessions.length === 0 && event.status === "publicado") {
    validationWarnings.push("El evento está publicado pero no tiene sesiones.");
  }

  const totals = sessions.reduce(
    (acc, s) => {
      const st = stats?.get(s.id);
      acc.capacity += s.capacity;
      acc.solicitudes += st?.solicitudes ?? 0;
      acc.aprobados += st?.aprobados ?? 0;
      acc.confirmados += st?.confirmados ?? 0;
      acc.checkins += st?.checkins ?? 0;
      return acc;
    },
    { capacity: 0, solicitudes: 0, aprobados: 0, confirmados: 0, checkins: 0 },
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/eventos"><ArrowLeft className="h-4 w-4 mr-1" />Eventos</Link>
      </Button>

      <PageHeader
        eyebrow={labelOf(EVENT_TYPE_OPTIONS, event.event_type)}
        title={event.name}
        description={event.description ?? undefined}
        actions={
          <Button asChild variant="outline" className="uppercase tracking-wider">
            <Link to="/eventos/$eventId/editar" params={{ eventId }}>
              <Pencil className="h-4 w-4 mr-2" />Editar evento
            </Link>
          </Button>
        }
      />

      {validationWarnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 space-y-1">
            {validationWarnings.map((w) => (
              <div key={w} className="flex items-start gap-2 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Aforo total" value={totals.capacity} />
        <SummaryCard icon={<Inbox className="h-4 w-4" />} label="Solicitudes" value={totals.solicitudes} />
        <SummaryCard icon={<UserCheck className="h-4 w-4" />} label="Confirmados" value={totals.confirmados} />
        <SummaryCard icon={<ScanLine className="h-4 w-4" />} label="Check-ins" value={totals.checkins} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Información</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <InfoRow icon={<Tag className="h-4 w-4" />} label="Estado">
              <Badge variant="outline">{labelOf(EVENT_STATUS_OPTIONS, event.status)}</Badge>
            </InfoRow>
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Ubicación">
              {[event.location_name, event.location_address, event.city, event.province].filter(Boolean).join(" · ") || "—"}
            </InfoRow>
            <InfoRow icon={<CalendarDays className="h-4 w-4" />} label="Slug público">
              {event.slug ? <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/{event.slug}</code> : "—"}
            </InfoRow>
            <InfoRow label="Inscripción pública">{boolPill(event.public_registration_enabled)}</InfoRow>
            <InfoRow label="Usuario elige sesión">{boolPill(event.user_can_choose_session)}</InfoRow>
            <InfoRow label="Requiere aprobación">{boolPill(event.requires_approval)}</InfoRow>
            <InfoRow label="Requiere confirmación">{boolPill(event.requires_confirmation)}</InfoRow>
            <InfoRow label="Consentimiento de imagen">{boolPill(event.requires_image_consent)}</InfoRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base uppercase tracking-wider">Reglas por defecto</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <KV label="Edad mínima" value={`${event.default_min_age} años`} />
            <KV label="Lista de espera" value={event.default_waitlist_enabled ? "Sí" : "No"} />
            <KV label="Acompañantes" value={event.default_allow_companions ? `Hasta ${event.default_max_companions}` : "No"} />
            <KV label="Modo QR acomp." value={event.default_companions_qr_mode === "mismo_qr" ? "Mismo QR" : "QR propio"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base uppercase tracking-wider">Sesiones</CardTitle>
          <Button asChild size="sm" className="uppercase tracking-wider">
            <Link to="/eventos/$eventId/sesiones/nueva" params={{ eventId }}>
              <Plus className="h-4 w-4 mr-1" />Nueva sesión
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <Skeleton className="h-32" />
          ) : sessions.length === 0 ? (
            <EmptyState
              title="Sin sesiones"
              description="Crea la primera sesión para abrir inscripciones."
              action={
                <Button asChild size="sm">
                  <Link to="/eventos/$eventId/sesiones/nueva" params={{ eventId }}>
                    <Plus className="h-4 w-4 mr-1" />Crear sesión
                  </Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sesión</TableHead>
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead>Aforo</TableHead>
                  <TableHead>Confirmados / Check-in</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  const st = stats?.get(s.id);
                  const occupied = st?.confirmados ?? 0;
                  const pct = s.capacity > 0 ? Math.min(100, Math.round((occupied / s.capacity) * 100)) : 0;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link to="/eventos/$eventId/sesiones/$sessionId" params={{ eventId, sessionId: s.id }} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        {s.location_name && <div className="text-xs text-muted-foreground">{s.location_name}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{new Date(s.starts_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</TableCell>
                      <TableCell className="w-48">
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground tabular-nums">{occupied}/{s.capacity}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        <span className="text-foreground">{st?.confirmados ?? 0}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="inline-flex items-center gap-1 text-foreground"><CheckCircle2 className="h-3 w-3" />{st?.checkins ?? 0}</span>
                      </TableCell>
                      <TableCell><Badge variant="outline">{labelOf(SESSION_STATUS_OPTIONS, s.status)}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm">
                            <Link to="/comunicaciones/envio" search={{ event_id: eventId, session_id: s.id }}>
                              <Mail className="h-3.5 w-3.5 mr-1" />Enviar invitaciones
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <Link to="/eventos/$eventId/sesiones/$sessionId" params={{ eventId, sessionId: s.id }}>
                              Editar
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          {icon}{label}
        </div>
        <div className="text-3xl font-black mt-2 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground w-40 flex items-center gap-2 text-xs uppercase tracking-wider">{icon}{label}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b last:border-0 py-1.5">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function boolPill(v: boolean) {
  return <Badge variant={v ? "default" : "outline"}>{v ? "Sí" : "No"}</Badge>;
}