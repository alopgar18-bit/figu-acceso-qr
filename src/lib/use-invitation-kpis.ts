import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InvitationKpiFilters {
  eventId?: string;
  sessionId?: string;
}

export interface InvitationKpis {
  invitados_con_entrada: number;
  en_espera: number;
  rechazados: number;
  invitados_netos: number;
  pendientes_confirmar: number;
}

const PAGE = 1000;
const MAX_ROWS = 60000;

const REJECTED = new Set([
  "rechazado",
  "cancelado_asistente",
  "cancelado_figurarte",
  "bloqueado",
  "no_presentado",
]);

const CONFIRMED = new Set(["confirmado", "acceso_validado"]);

/**
 * KPIs de invitaciones por sesión/evento.
 * "Invitados con entrada" cuenta personas con una comunicación de email de invitación
 * preparada, exportada en .eml o ya enviada (todo excepto los fallidos).
 */
export function useInvitationKpis(filters: InvitationKpiFilters = {}) {
  return useQuery({
    queryKey: ["invitation_kpis", filters],
    enabled: Boolean(filters.eventId || filters.sessionId),
    queryFn: async (): Promise<InvitationKpis> => {
      // Personas con email de invitación (enviado, pendiente, programado o exportado .eml)
      const invitedPersons = new Set<string>();
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        let q = supabase
          .from("communication_logs")
          .select("person_id")
          .eq("channel", "email")
          .neq("status", "fallido")
          .is("archived_at", null)
          .not("person_id", "is", null)
          .range(from, from + PAGE - 1);
        if (filters.eventId) q = q.eq("event_id", filters.eventId);
        if (filters.sessionId) q = q.eq("session_id", filters.sessionId);
        const { data, error } = await q;
        if (error) throw error;
        const chunk = data ?? [];
        for (const r of chunk) if (r.person_id) invitedPersons.add(r.person_id);
        if (chunk.length < PAGE) break;
      }

      // Participantes de la sesión/evento
      const participants: { person_id: string; status: string }[] = [];
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        let q = supabase
          .from("event_participants")
          .select("person_id, status")
          .range(from, from + PAGE - 1);
        if (filters.eventId) q = q.eq("event_id", filters.eventId);
        if (filters.sessionId) q = q.eq("session_id", filters.sessionId);
        const { data, error } = await q;
        if (error) throw error;
        const chunk = (data ?? []) as { person_id: string; status: string }[];
        participants.push(...chunk);
        if (chunk.length < PAGE) break;
      }

      let en_espera = 0;
      let rechazados = 0;
      let invitados_con_entrada = 0;
      let pendientes_confirmar = 0;

      for (const p of participants) {
        if (p.status === "lista_espera") en_espera++;
        const isRejected = REJECTED.has(p.status);
        if (isRejected) rechazados++;
        const invited = p.person_id ? invitedPersons.has(p.person_id) : false;
        if (invited && !isRejected) {
          invitados_con_entrada++;
          if (!CONFIRMED.has(p.status)) pendientes_confirmar++;
        }
      }

      return {
        invitados_con_entrada,
        en_espera,
        rechazados,
        invitados_netos: invitados_con_entrada,
        pendientes_confirmar,
      };
    },
  });
}
