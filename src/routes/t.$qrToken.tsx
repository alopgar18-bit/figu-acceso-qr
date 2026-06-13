import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { CalendarDays, MapPin, Clock, Loader2, IdCard, Armchair, Download, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getTicketByQr } from "@/lib/confirmation.functions";
import { zoneTone, zoneToneClasses } from "@/lib/event-constants";
import { parseTicketDesign, DEFAULT_TICKET_NOTICES, NOTICE_ICON_MAP, type TicketNoticeIcon } from "@/lib/ticket-design";

export const Route = createFileRoute("/t/$qrToken")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Tu entrada" },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
});

function Page() {
  const { qrToken } = Route.useParams();
  const fetch = useServerFn(getTicketByQr);
  const { data, isLoading } = useQuery({
    queryKey: ["ticket", qrToken],
    queryFn: () => fetch({ data: { qrToken } }),
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-muted/30 p-4">
        <Skeleton className="h-[80vh] w-full max-w-md mx-auto" />
      </div>
    );
  }
  if (!data.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <h1 className="text-lg font-semibold">Entrada no disponible</h1>
          <p className="text-sm text-muted-foreground mt-2">El enlace no es válido o el evento ya no está activo.</p>
        </Card>
      </div>
    );
  }

  const { event, session, ticket, holderName, dni, seat, kind } = data;
  const startsAt = new Date(session.starts_at);
  const doorsAt = session.doors_open_at ? new Date(session.doors_open_at) : null;
  const tone = zoneTone(seat.zone);
  const toneClass = zoneToneClasses(tone);
  const design = parseTicketDesign(event.ticket_design);
  const headerBg = design.header_bg || event.brand_color || null;
  const headerColor = design.header_text_color || "#ffffff";
  const notices = design.notices && design.notices.length > 0 ? design.notices : DEFAULT_TICKET_NOTICES;
  const footerNote = design.footer_note ?? "Conserva este enlace para volver a ver tu entrada.";
  const instructionsText = design.instructions_override ?? session.specific_instructions ?? event.general_instructions ?? null;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 sm:py-10">
      <div className="max-w-md mx-auto">
        <Card className="overflow-hidden shadow-xl border-2" style={headerBg ? { borderColor: headerBg } : undefined}>
          <div className="px-6 py-6 text-center" style={{ background: headerBg ?? "hsl(var(--primary))", color: headerColor }}>
            <h1 className="text-xl font-black uppercase tracking-tight leading-tight">{event.name}</h1>
            <div className="mt-1 text-sm opacity-90">{session.name}</div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.25em] opacity-80">
              {kind === "acompanante" ? "Entrada de acompañante" : "Entrada"}
            </div>
          </div>

          <CardContent className="p-6 space-y-5">
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
              <div className="font-semibold text-base">{holderName || "—"}</div>
              {dni && (
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <IdCard className="h-3 w-3" /> DNI: {dni}
                </div>
              )}
            </div>

            {seat.zone && (
              <div className={`rounded-md border-2 p-3 ${toneClass}`}>
                <div className="text-[10px] uppercase tracking-[0.25em] opacity-80 flex items-center gap-1">
                  <Armchair className="h-3 w-3" /> Zona
                </div>
                <div className="text-lg font-black uppercase">{seat.zone}</div>
                {(seat.row || seat.number) && (
                  <div className="text-sm mt-1">
                    {seat.row && <span>Fila <strong>{seat.row}</strong></span>}
                    {seat.row && seat.number && <span> · </span>}
                    {seat.number && <span>Asiento <strong>{seat.number}</strong></span>}
                  </div>
                )}
              </div>
            )}

            <QrBlock token={ticket.qr_token} />

            <Separator />

            <div className="space-y-3 text-xs">
              {notices.map((n, i) => {
                const Icon = NOTICE_ICON_MAP[n.icon as TicketNoticeIcon] ?? AlertCircle;
                return (
                  <Notice key={i} icon={<Icon className="h-3.5 w-3.5" />}>
                    <span dangerouslySetInnerHTML={{ __html: n.text }} />
                  </Notice>
                );
              })}
              {instructionsText && (
                <div className="text-muted-foreground whitespace-pre-line bg-muted/50 p-3 rounded-md">
                  {instructionsText}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-5 flex">
          <Button onClick={() => window.print()} variant="outline" className="flex-1 uppercase tracking-wider text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> Guardar / imprimir
          </Button>
        </div>

        <p className="mt-4 text-[10px] text-center text-muted-foreground">{footerNote}</p>
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

function QrBlock({ token }: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token, {
      width: 260, margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" },
    }).then(() => setReady(true)).catch(() => setReady(false));
  }, [token]);
  return (
    <div className="flex flex-col items-center">
      <div className="p-3 bg-white rounded-lg border-2 border-foreground/10 inline-block">
        <canvas ref={canvasRef} className="block" />
        {!ready && <div className="w-[260px] h-[260px] flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      </div>
      <code className="text-[10px] text-muted-foreground mt-2 break-all max-w-[260px] text-center">{token.slice(0, 16)}…</code>
    </div>
  );
}