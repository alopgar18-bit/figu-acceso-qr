import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { CalendarDays, MapPin, Clock, AlertCircle, Download, Loader2, IdCard, Users, Armchair } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getConfirmation } from "@/lib/confirmation.functions";
import { zoneTone, zoneToneClasses } from "@/lib/event-constants";
import { parseTicketDesign, DEFAULT_TICKET_NOTICES, NOTICE_ICON_MAP, type TicketNoticeIcon } from "@/lib/ticket-design";

const FALLBACK_OG_IMAGE = "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/4bcdb372-0e17-41c3-bfed-2e3aa64605e7";

export const Route = createFileRoute("/c/$token/entrada")({
  component: Page,
  loader: async ({ params }) => {
    try {
      const res = await getConfirmation({ data: { token: params.token } });
      if (!res.ok) return { meta: null };
      const { event, session } = res;
      const startsAt = new Date(session.starts_at);
      const dateStr = startsAt.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
      const location = session.location_name ?? event.location_name ?? null;
      return {
        meta: {
          title: event.name,
          description: `Tu invitación para ${session.name} · ${dateStr}${location ? ` · ${location}` : ""}`,
          image: event.cover_image_url || FALLBACK_OG_IMAGE,
        },
      };
    } catch {
      return { meta: null };
    }
  },
  head: ({ loaderData, params }) => {
    const m = loaderData?.meta;
    const url = `https://figurarte.app/c/${params.token}/entrada`;
    const title = m?.title ? `${m.title} — Tu entrada` : "Tu entrada";
    const description = m?.description ?? "Tu invitación de FIGURARTE";
    const image = m?.image ?? FALLBACK_OG_IMAGE;
    return {
      meta: [
        { title },
        { name: "robots", content: "noindex" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image },
      ],
    };
  },
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
  const design = parseTicketDesign(event.ticket_design);
  const headerBg = design.header_bg || event.brand_color || null;
  const headerColor = design.header_text_color || "#ffffff";
  const notices = design.notices && design.notices.length > 0 ? design.notices : DEFAULT_TICKET_NOTICES;
  const footerNote = design.footer_note ?? "Conserva este enlace para volver a ver tu entrada.";
  const instructionsText = design.instructions_override ?? session.specific_instructions ?? event.general_instructions ?? null;
  const startsAt = new Date(session.starts_at);
  const doorsAt = session.doors_open_at ? new Date(session.doors_open_at) : null;
  const main = tickets[0];

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6 sm:py-10">
      <div className="max-w-md mx-auto">
        <Card className="overflow-hidden shadow-xl border-2" style={headerBg ? { borderColor: headerBg } : undefined}>
          {/* Header */}
          <div
            className="px-6 py-6 text-center"
            style={{ background: headerBg ?? "hsl(var(--primary))", color: headerColor }}
          >
            <h1 className="text-xl font-black uppercase tracking-tight leading-tight">{event.name}</h1>
            <div className="mt-1 text-sm opacity-90">{session.name}</div>
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

            <SeatBlock zone={participant.seat_zone} row={participant.seat_row} number={participant.seat_number} />

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
                    <div key={t.id} className="space-y-3">
                      <SeatBlock
                        zone={c?.seat_zone}
                        row={c?.seat_row}
                        number={c?.seat_number}
                      />
                      <QrBlock
                        token={t.qr_token}
                        title={c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || `Acompañante ${idx + 1}` : `Acompañante ${idx + 1}`}
                        subtitle={c?.dni ? `DNI: ${c.dni}` : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            )}

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

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <Button asChild variant="outline" className="flex-1 uppercase tracking-wider text-xs">
            <Link to="/c/$token/cancelar" params={{ token }}>Cancelar asistencia</Link>
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="flex-1 uppercase tracking-wider text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> Guardar / imprimir
          </Button>
        </div>

        <p className="mt-4 text-[10px] text-center text-muted-foreground">
          {footerNote}
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

function SeatBlock({ zone, row, number }: { zone?: string | null; row?: string | null; number?: string | null }) {
  if (!zone) return null;
  const tone = zoneTone(zone);
  const toneClass = zoneToneClasses(tone);
  return (
    <div className={`rounded-md border-2 p-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] opacity-80 flex items-center gap-1">
        <Armchair className="h-3 w-3" /> Zona
      </div>
      <div className="text-lg font-black uppercase">{zone}</div>
      {(row || number) && (
        <div className="text-sm mt-1">
          {row && <span>Fila <strong>{row}</strong></span>}
          {row && number && <span> · </span>}
          {number && <span>Asiento <strong>{number}</strong></span>}
        </div>
      )}
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