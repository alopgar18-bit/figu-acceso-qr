import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { CalendarDays, MapPin, Clock, AlertCircle, Ticket, Download, Loader2, IdCard, Users } from "lucide-react";

import { FigurarteLogo } from "@/components/figurarte-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getConfirmation } from "@/lib/confirmation.functions";

export const Route = createFileRoute("/c/$token/entrada")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Tu entrada · FIGURARTE" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
});

function Page() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const fetch = useServerFn(getConfirmation);

  const { data, isLoading } = useQuery({
    queryKey: ["confirmation", token],
    queryFn: () => fetch({ data: { token } }),
  });

  useEffect(() => {
    if (!data) return;
    if (!data.ok) navigate({ to: "/c/$token", params: { token } });
    else if (
      (data.tickets?.length ?? 0) === 0 &&
      data.participant.status !== "qr_generado" &&
      data.participant.status !== "confirmado" &&
      data.participant.status !== "acceso_validado"
    ) {
      navigate({ to: "/c/$token", params: { token } });
    }
  }, [data, navigate, token]);

  if (isLoading || !data || !data.ok) {
    return (
      <div className="min-h-screen bg-muted/30 p-4">
        <Skeleton className="h-[80vh] w-full max-w-md mx-auto" />
      </div>
    );
  }

  const { event, session, person, tickets, participant, companions } = data;
  const brandColor = event.brand_color ?? null;
  const startsAt = new Date(session.starts_at);
  const doorsAt = session.doors_open_at ? new Date(session.doors_open_at) : null;
  const main = tickets[0];

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 sm:py-10">
      <div className="max-w-md mx-auto">
        <Card className="overflow-hidden shadow-xl border-2" style={brandColor ? { borderColor: brandColor } : undefined}>
          {/* Header */}
          <div
            className="px-6 py-5 text-center"
            style={{ background: brandColor ?? "hsl(var(--primary))", color: "white" }}
          >
            <div className="flex justify-center mb-3 bg-white/95 rounded-md inline-flex px-3 py-2 mx-auto">
              <FigurarteLogo />
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] opacity-90 flex items-center justify-center gap-1">
              <Ticket className="h-3 w-3" /> Entrada digital
            </div>
          </div>

          <CardContent className="p-6 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Evento</div>
              <h1 className="text-2xl font-black uppercase tracking-tight leading-tight">{event.name}</h1>
              <div className="mt-1 text-sm text-muted-foreground">{session.name}</div>
            </div>

            <div className="space-y-2 text-sm">
              <InfoLine icon={<CalendarDays className="h-4 w-4" />}>
                {startsAt.toLocaleString("es-ES", { dateStyle: "full" })}
              </InfoLine>
              <InfoLine icon={<Clock className="h-4 w-4" />}>
                Acceso: {(doorsAt ?? startsAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </InfoLine>
              {(session.location_name || event.location_name) && (
                <InfoLine icon={<MapPin className="h-4 w-4" />}>
                  <div>
                    <div className="font-medium">{session.location_name ?? event.location_name}</div>
                    {(session.location_address || event.location_address) && (
                      <div className="text-xs text-muted-foreground">{session.location_address ?? event.location_address}</div>
                    )}
                  </div>
                </InfoLine>
              )}
            </div>

            <Separator />

            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Asistente</div>
              <div className="font-semibold text-base">
                {person?.first_name} {person?.last_name}
              </div>
              {person?.dni && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <IdCard className="h-3 w-3" /> DNI: {person.dni}
                </div>
              )}
              {participant.companions_count > 0 && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Users className="h-3 w-3" /> {participant.companions_count} acompañante(s)
                </div>
              )}
            </div>

            {main && (
              <QrBlock
                token={main.qr_token}
                title={tickets.length > 1 ? `${person?.first_name ?? "Titular"}` : undefined}
                subtitle={
                  (main.qr_payload as { kind?: string; includes?: number } | null)?.kind === "grupo"
                    ? `Válido para ${(main.qr_payload as { includes?: number }).includes ?? 1} persona(s)`
                    : undefined
                }
              />
            )}

            {tickets.length > 1 && (
              <div className="space-y-4">
                <Separator />
                <div className="text-xs uppercase tracking-wider text-muted-foreground text-center">
                  Entradas de acompañantes
                </div>
                {tickets.slice(1).map((t, idx) => {
                  const c = companions[idx];
                  return (
                    <QrBlock
                      key={t.id}
                      token={t.qr_token}
                      title={c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || `Acompañante ${idx + 1}` : `Acompañante ${idx + 1}`}
                      subtitle={c?.dni ? `DNI: ${c.dni}` : undefined}
                    />
                  );
                })}
              </div>
            )}

            <Separator />

            <div className="space-y-3 text-xs">
              <Notice icon={<IdCard className="h-3.5 w-3.5" />}>
                <strong>DNI obligatorio</strong> en el acceso para verificar tu identidad.
              </Notice>
              <Notice icon={<Clock className="h-3.5 w-3.5" />}>
                <strong>Puntualidad:</strong> llega con al menos 30 minutos de antelación. No se garantiza el acceso fuera del horario indicado.
              </Notice>
              <Notice icon={<AlertCircle className="h-3.5 w-3.5" />}>
                Este QR es <strong>personal e intransferible</strong> y de un solo uso. No lo compartas.
              </Notice>
              {(session.specific_instructions || event.general_instructions) && (
                <div className="text-muted-foreground whitespace-pre-line bg-muted/50 p-3 rounded-md">
                  {session.specific_instructions ?? event.general_instructions}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <Button asChild variant="outline" className="flex-1 uppercase tracking-wider text-xs">
            <Link to="/c/$token/cancelar" params={{ token }}>Cancelar asistencia</Link>
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="flex-1 uppercase tracking-wider text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> Guardar / imprimir
          </Button>
        </div>

        <p className="mt-4 text-[10px] text-center text-muted-foreground">
          © FIGURARTE Casting & Producción · Conserva este enlace para volver a ver tu entrada.
        </p>
      </div>
    </div>
  );
}

function InfoLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Notice({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-muted-foreground">
      <div className="mt-0.5 text-foreground">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

function QrBlock({ token, title, subtitle }: { token: string; title?: string; subtitle?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, [token]);

  return (
    <div className="flex flex-col items-center">
      {title && <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>}
      <div className="p-3 bg-white rounded-lg border-2 border-foreground/10 inline-block">
        <canvas ref={canvasRef} className="block" />
        {!ready && <div className="w-[260px] h-[260px] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      </div>
      {subtitle && <div className="text-xs text-muted-foreground mt-2">{subtitle}</div>}
      <code className="text-[10px] text-muted-foreground mt-1 break-all max-w-[260px] text-center">{token.slice(0, 16)}…</code>
    </div>
  );
}