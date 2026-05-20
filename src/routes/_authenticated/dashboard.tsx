import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminOnboardingBlock } from "@/components/admin-onboarding";
import {
  CalendarDays, Inbox, CheckCircle2, ScanLine, AlertTriangle, Users,
  Plus, ExternalLink, ArrowRight, Mail, Upload, BarChart3, Building2,
  ClipboardList, Clock, MapPin, Ticket, FileText, Activity, Sparkles,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadministrador",
  admin_figurarte: "Administrador FIGURARTE",
  coordinador: "Coordinador",
  validador: "Validador",
  cliente_productora: "Cliente / Productora",
};

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  publicado: "Inscripciones abiertas",
  cerrado: "Cerrado",
  archivado: "Archivado",
  programada: "Programada",
  abierta: "Abierta",
  en_curso: "En curso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard-admin-v2"],
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [evCount, solCount, confCount, chkCount, incCount, capAgg] = await Promise.all([
        supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "publicado"),
        supabase.from("event_participants").select("id", { count: "exact", head: true }).in("status", ["solicitud_recibida", "lista_espera"]),
        supabase.from("event_participants").select("id", { count: "exact", head: true }).in("status", ["confirmado", "qr_generado", "acceso_validado"]),
        supabase.from("checkins").select("id", { count: "exact", head: true }).gte("checked_in_at", startOfDay.toISOString()),
        supabase.from("incidents").select("id", { count: "exact", head: true }).eq("status", "abierta"),
        supabase
          .from("event_sessions")
          .select("capacity, event:events!inner(status)")
          .eq("event.status", "publicado"),
      ]);

      const totalCapacity = (capAgg.data ?? []).reduce((s, r: any) => s + (r.capacity ?? 0), 0);

      // Featured event = most recent published
      const { data: featured } = await supabase
        .from("events")
        .select("id, name, slug, status, city, starts_at, ends_at, cover_image_url, brand_color, client:clients(name)")
        .eq("status", "publicado")
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let featuredStats = { solicitudes: 0, confirmados: 0, checkins: 0, incidencias: 0, ocupacion: 0, capacidad: 0 };
      let sessions: any[] = [];

      if (featured?.id) {
        const [s, c, ci, inc, ses] = await Promise.all([
          supabase.from("event_participants").select("id", { count: "exact", head: true }).eq("event_id", featured.id),
          supabase.from("event_participants").select("id", { count: "exact", head: true }).eq("event_id", featured.id).in("status", ["confirmado", "qr_generado", "acceso_validado"]),
          supabase.from("checkins").select("id", { count: "exact", head: true }).eq("event_id", featured.id),
          supabase.from("incidents").select("id", { count: "exact", head: true }).eq("event_id", featured.id).eq("status", "abierta"),
          supabase.from("event_sessions").select("id, name, starts_at, doors_open_at, capacity, status").eq("event_id", featured.id).order("starts_at"),
        ]);
        sessions = ses.data ?? [];
        const capacidad = sessions.reduce((sum, x) => sum + (x.capacity ?? 0), 0);
        featuredStats = {
          solicitudes: s.count ?? 0,
          confirmados: c.count ?? 0,
          checkins: ci.count ?? 0,
          incidencias: inc.count ?? 0,
          capacidad,
          ocupacion: capacidad > 0 ? Math.round(((ci.count ?? 0) / capacidad) * 100) : 0,
        };

        // Per-session stats
        const sessionsWithStats = await Promise.all(
          sessions.map(async (sess) => {
            const [sp, sc, scn] = await Promise.all([
              supabase.from("event_participants").select("id", { count: "exact", head: true }).eq("session_id", sess.id),
              supabase.from("event_participants").select("id", { count: "exact", head: true }).eq("session_id", sess.id).in("status", ["confirmado", "qr_generado", "acceso_validado"]),
              supabase.from("checkins").select("id", { count: "exact", head: true }).eq("session_id", sess.id),
            ]);
            return {
              ...sess,
              solicitudes: sp.count ?? 0,
              confirmados: sc.count ?? 0,
              checkins: scn.count ?? 0,
            };
          })
        );
        sessions = sessionsWithStats;
      }

      const { data: recent } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, created_at, actor_email")
        .order("created_at", { ascending: false })
        .limit(8);

      return {
        metrics: {
          eventos: evCount.count ?? 0,
          solicitudes: solCount.count ?? 0,
          confirmados: confCount.count ?? 0,
          checkins: chkCount.count ?? 0,
          incidencias: incCount.count ?? 0,
          aforo: totalCapacity > 0 ? Math.round(((chkCount.count ?? 0) / totalCapacity) * 100) : 0,
        },
        featured,
        featuredStats,
        sessions,
        recent: recent ?? [],
      };
    },
    refetchInterval: 60_000,
  });
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace instantes";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

const ACTION_LABELS: Record<string, { label: string; icon: any }> = {
  "participant.create": { label: "Solicitud recibida", icon: Inbox },
  "participant.approve": { label: "Solicitud aprobada", icon: CheckCircle2 },
  "ticket.create": { label: "QR generado", icon: Ticket },
  "checkin.create": { label: "Check-in realizado", icon: ScanLine },
  "incident.create": { label: "Incidencia creada", icon: AlertTriangle },
  "incident.resolve": { label: "Incidencia resuelta", icon: CheckCircle2 },
};

function toTitleCase(str: string) {
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function DashboardPage() {
  const { user, roles } = useAuth();
  const rolesLabel = roles.length ? roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ") : "Sin rol asignado";
  const { data, isLoading } = useDashboardData();
  const m = data?.metrics;
  const f = data?.featured;
  const fs = data?.featuredStats;

  const rawName = (user?.user_metadata as Record<string, string>)?.full_name ?? "";
  const emailPrefix = user?.email?.split("@")[0] ?? "";
  const greetingName = rawName
    ? toTitleCase(rawName)
    : emailPrefix
      ? toTitleCase(emailPrefix)
      : "Equipo";

  const statCards = [
    { label: "Eventos activos", value: m?.eventos, icon: CalendarDays, href: "/eventos", tone: "primary" },
    { label: "Solicitudes pendientes", value: m?.solicitudes, icon: Inbox, href: "/solicitudes", tone: "warning" },
    { label: "Confirmados", value: m?.confirmados, icon: CheckCircle2, href: "/solicitudes", tone: "success" },
    { label: "Check-ins hoy", value: m?.checkins, icon: ScanLine, href: "/control-acceso", tone: "info" },
    { label: "Incidencias abiertas", value: m?.incidencias, icon: AlertTriangle, href: "/incidencias", tone: "danger" },
    { label: "Aforo ocupado", value: m ? `${m.aforo}%` : undefined, icon: BarChart3, href: "/informes", tone: "muted" },
  ];

  const tasks = [
    { count: m?.solicitudes ?? 0, title: "Revisar solicitudes pendientes", description: "Aprueba o rechaza inscripciones recibidas.", href: "/solicitudes", icon: Inbox, cta: "Revisar" },
    { count: m?.confirmados ?? 0, title: "Enviar comunicaciones a aprobados", description: "Notifica email o WhatsApp a participantes aprobados.", href: "/comunicaciones", icon: Mail, cta: "Enviar" },
    { count: fs?.solicitudes ?? 0, title: "Confirmar asistentes pendientes", description: "Verifica confirmaciones de asistencia y QRs.", href: "/solicitudes", icon: CheckCircle2, cta: "Ver" },
    { count: m?.incidencias ?? 0, title: "Revisar incidencias abiertas", description: "Resuelve incidencias del equipo en sala.", href: "/incidencias", icon: AlertTriangle, cta: "Atender" },
    { count: 0, title: "Validar permisos del cliente/productora", description: "Confirma visibilidad y exportación para clientes.", href: "/clientes", icon: Building2, cta: "Configurar" },
  ];

  const quickActions = [
    { label: "Gestionar eventos", icon: CalendarDays, href: "/eventos" },
    { label: "Revisar solicitudes", icon: Inbox, href: "/solicitudes" },
    { label: "Importar invitados", icon: Upload, href: "/importaciones" },
    { label: "Enviar comunicaciones", icon: Mail, href: "/comunicaciones" },
    { label: "Control de acceso", icon: ScanLine, href: "/control-acceso" },
    { label: "Informes", icon: BarChart3, href: "/informes" },
    { label: "Clientes / Productoras", icon: Building2, href: "/clientes" },
  ];

  const greetingName = user?.email?.split("@")[0]?.toUpperCase() ?? "EQUIPO";

  return (
    <div className="space-y-10">
      {/* CABECERA */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 pb-6 border-b">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-primary font-semibold mb-2">
            Panel principal · Centro de mando
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight uppercase">
            Hola, {greetingName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Rol: <span className="font-semibold text-foreground">{rolesLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg" className="font-semibold">
            <Link to="/eventos/nuevo"><Plus className="h-4 w-4 mr-1" /> Crear evento</Link>
          </Button>
          {f?.slug && (
            <Button asChild variant="outline" size="lg">
              <a href={`/e/${f.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" /> Ver formulario público
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="lg">
            <Link to="/control-acceso"><ScanLine className="h-4 w-4 mr-1" /> Control de acceso</Link>
          </Button>
        </div>
      </div>

      {/* BLOQUE ONBOARDING — Solo para admin_figurarte */}
      {roles.includes("admin_figurarte") && (
        <section>
          <AdminOnboardingBlock />
        </section>
      )}

      {/* BLOQUE 1 — Resumen operativo */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold mb-3">
          Resumen operativo
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map((s) => (
            <Link key={s.label} to={s.href} className="block group">
              <Card className="h-full rounded-none border-l-4 border-l-primary transition-all group-hover:bg-muted/50 group-hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3">
                  <CardTitle className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </CardTitle>
                  <s.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </CardHeader>
                <CardContent className="pb-3">
                  {isLoading ? (
                    <Skeleton className="h-8 w-14" />
                  ) : (
                    <div className="text-2xl md:text-3xl font-black tracking-tight">{s.value ?? 0}</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* BLOQUE 2 — Evento destacado */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold">
            Evento destacado
          </h2>
          <Link to="/eventos" className="text-xs uppercase tracking-wider font-semibold text-primary hover:underline">
            Ver todos →
          </Link>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : f ? (
          <Card className="rounded-none overflow-hidden border-2">
            <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
              <div
                className="bg-secondary text-secondary-foreground flex items-center justify-center min-h-[200px] relative"
                style={f.cover_image_url ? { backgroundImage: `url(${f.cover_image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: f.brand_color || undefined }}
              >
                {!f.cover_image_url && (
                  <Sparkles className="h-16 w-16 opacity-30" />
                )}
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <Badge variant="default" className="mb-2">{STATUS_LABELS[f.status] ?? f.status}</Badge>
                  <h3 className="text-2xl font-black tracking-tight uppercase">{f.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {(f as any).client?.name && (
                      <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {(f as any).client.name}</span>
                    )}
                    {f.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {f.city}</span>}
                    <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(f.starts_at)}{f.ends_at && ` – ${formatDate(f.ends_at)}`}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 border-y">
                  <Stat label="Solicitudes" value={fs?.solicitudes ?? 0} />
                  <Stat label="Confirmados" value={fs?.confirmados ?? 0} />
                  <Stat label="Check-ins" value={fs?.checkins ?? 0} />
                  <Stat label="Incidencias" value={fs?.incidencias ?? 0} tone={fs && fs.incidencias > 0 ? "danger" : undefined} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm"><Link to="/eventos/$eventId" params={{ eventId: f.id }}>Gestionar evento</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/solicitudes">Ver solicitudes</Link></Button>
                  {f.slug && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/e/${f.slug}`} target="_blank" rel="noreferrer">Formulario público</a>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline"><Link to="/control-acceso">Control de acceso</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/informes/$eventId" params={{ eventId: f.id }}>Ver informes</Link></Button>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <EmptyBlock
            icon={<CalendarDays className="h-10 w-10" />}
            title="No hay eventos publicados"
            description="Crea tu primer evento para empezar a recibir solicitudes."
            actionLabel="Crear evento"
            actionHref="/eventos/nuevo"
          />
        )}
      </section>

      {/* BLOQUE 3 — Sesiones próximas */}
      {f && data?.sessions && data.sessions.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold mb-3">
            Sesiones próximas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.sessions.map((s: any) => {
              const ocup = s.capacity > 0 ? Math.round((s.checkins / s.capacity) * 100) : 0;
              return (
                <Card key={s.id} className="rounded-none">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold uppercase tracking-tight">{s.name}</div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {formatDate(s.starts_at)}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Acceso {formatTime(s.doors_open_at ?? s.starts_at)}</span>
                        </div>
                      </div>
                      <Badge variant="secondary">{STATUS_LABELS[s.status] ?? s.status}</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center py-2 border-y">
                      <Stat small label="Aforo" value={s.capacity} />
                      <Stat small label="Solicit." value={s.solicitudes} />
                      <Stat small label="Confirm." value={s.confirmados} />
                      <Stat small label="Check-in" value={`${ocup}%`} />
                    </div>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link to="/eventos/$eventId/sesiones/$sessionId" params={{ eventId: f.id, sessionId: s.id }}>
                        Gestionar sesión <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* BLOQUE 4 — Tareas pendientes */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold mb-3">
          Tareas pendientes
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <Card key={t.title} className="rounded-none hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`shrink-0 h-10 w-10 flex items-center justify-center ${t.count > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-sm">{t.title}</div>
                    {t.count > 0 && <Badge variant="default" className="text-[10px] h-4 px-1">{t.count}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 mb-2">{t.description}</div>
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 -ml-2">
                    <Link to={t.href}>{t.cta} <ArrowRight className="h-3 w-3 ml-1" /></Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* BLOQUE 5 — Actividad reciente */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold mb-3">
            Actividad reciente
          </h2>
          <Card className="rounded-none">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : data?.recent && data.recent.length > 0 ? (
                <ul className="divide-y">
                  {data.recent.map((r: any) => {
                    const meta = ACTION_LABELS[r.action] ?? { label: r.action, icon: Activity };
                    const Icon = meta.icon;
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-8 w-8 flex items-center justify-center bg-muted shrink-0">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{meta.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.actor_email ?? "Sistema"} · {r.entity_type}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">{relTime(r.created_at)}</div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-10 text-center">
                  <Activity className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <div className="font-semibold">Sin actividad reciente</div>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Aquí verás solicitudes, check-ins e incidencias en tiempo real.
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/eventos/nuevo">Crear primer evento</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ACCESOS RÁPIDOS */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold mb-3">
            Accesos rápidos
          </h2>
          <Card className="rounded-none">
            <CardContent className="p-3 grid grid-cols-1 gap-1">
              {quickActions.map((a) => (
                <Button key={a.href} asChild variant="ghost" className="justify-start font-medium">
                  <Link to={a.href}>
                    <a.icon className="h-4 w-4 mr-2" /> {a.label}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: number | string; tone?: "danger" | "success"; small?: boolean }) {
  const color = tone === "danger" ? "text-primary" : tone === "success" ? "text-foreground" : "text-foreground";
  return (
    <div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-black tracking-tight ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
    </div>
  );
}

function EmptyBlock({ icon, title, description, actionLabel, actionHref }: { icon: React.ReactNode; title: string; description: string; actionLabel: string; actionHref: string }) {
  return (
    <Card className="rounded-none border-2 border-dashed">
      <CardContent className="p-10 text-center flex flex-col items-center">
        <div className="text-muted-foreground mb-3">{icon}</div>
        <div className="font-semibold">{title}</div>
        <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md">{description}</p>
        <Button asChild>
          <Link to={actionHref}>{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
