import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingStep {
  id: number;
  title: string;
  href: string;
  cta: string;
  completed: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  demoEvent: { id: string; name: string; slug: string } | null;
  isAllComplete: boolean;
}

export function useOnboardingState() {
  return useQuery({
    queryKey: ["admin-onboarding"],
    queryFn: async (): Promise<OnboardingState> => {
      // Parallel checks for all onboarding conditions
      const [
        clientsRes,
        eventsRes,
        sessionsRes,
        publishedEventRes,
        requestsRes,
        approvedRes,
        commsRes,
        checkinsRes,
        demoEventRes,
      ] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("events").select("id", { count: "exact", head: true }),
        supabase.from("event_sessions").select("id", { count: "exact", head: true }),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "publicado").not("slug", "is", null),
        supabase.from("event_participants").select("id", { count: "exact", head: true }).eq("status", "solicitud_recibida"),
        supabase.from("event_participants").select("id", { count: "exact", head: true }).in("status", ["aprobado", "invitacion_enviada", "pendiente_confirmacion", "confirmado", "qr_generado", "acceso_validado"]),
        supabase.from("communication_logs").select("id", { count: "exact", head: true }),
        supabase.from("checkins").select("id", { count: "exact", head: true }),
        supabase
          .from("events")
          .select("id, name, slug")
          .ilike("name", "%El Perro Andaluz%")
          .limit(1)
          .maybeSingle(),
      ]);

      const hasClients = (clientsRes.count ?? 0) > 0;
      const hasEvents = (eventsRes.count ?? 0) > 0;
      const hasSessions = (sessionsRes.count ?? 0) > 0;
      const hasPublished = (publishedEventRes.count ?? 0) > 0;
      const hasRequests = (requestsRes.count ?? 0) > 0;
      const hasApproved = (approvedRes.count ?? 0) > 0;
      const hasComms = (commsRes.count ?? 0) > 0;
      const hasCheckins = (checkinsRes.count ?? 0) > 0;
      const hasReports = hasEvents;

      const steps: OnboardingStep[] = [
        {
          id: 1,
          title: "Crea o selecciona una productora",
          href: "/clientes",
          cta: "Gestionar clientes",
          completed: hasClients,
        },
        {
          id: 2,
          title: "Crea un evento",
          href: "/eventos/nuevo",
          cta: "Crear evento",
          completed: hasEvents,
        },
        {
          id: 3,
          title: "Añade sesiones con aforo",
          href: "/eventos",
          cta: "Gestionar sesiones",
          completed: hasSessions,
        },
        {
          id: 4,
          title: "Activa el formulario público",
          href: "/eventos",
          cta: "Publicar evento",
          completed: hasPublished,
        },
        {
          id: 5,
          title: "Revisa solicitudes",
          href: "/solicitudes",
          cta: "Ver solicitudes",
          completed: hasRequests,
        },
        {
          id: 6,
          title: "Aprueba asistentes",
          href: "/solicitudes",
          cta: "Aprobar",
          completed: hasApproved,
        },
        {
          id: 7,
          title: "Envía confirmación",
          href: "/comunicaciones",
          cta: "Enviar comunicación",
          completed: hasComms,
        },
        {
          id: 8,
          title: "Valida accesos con QR",
          href: "/control-acceso",
          cta: "Ir a control",
          completed: hasCheckins,
        },
        {
          id: 9,
          title: "Consulta informes",
          href: "/informes",
          cta: "Ver informes",
          completed: hasReports,
        },
      ];

      const completedCount = steps.filter((s) => s.completed).length;

      return {
        steps,
        completedCount,
        totalCount: steps.length,
        demoEvent: demoEventRes.data
          ? {
              id: demoEventRes.data.id,
              name: demoEventRes.data.name,
              slug: demoEventRes.data.slug ?? "",
            }
          : null,
        isAllComplete: completedCount === steps.length,
      };
    },
    refetchInterval: 60_000,
    enabled: true,
  });
}
