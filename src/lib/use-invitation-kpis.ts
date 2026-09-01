import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InvitationKpiFilters {
  eventId?: string;
  sessionId?: string;
}

export interface DuplicateSeat {
  seat: string;
  participants: { id: string; nombre: string; status: string }[];
}

export interface InvitationKpis {
  invitados_brutos: number;
  invitados_con_entrada: number;
  en_espera: number;
  rechazados: number;
  invitados_netos: number;
  pendientes_confirmar: number;
  asientos_duplicados: number;
  duplicados: DuplicateSeat[];
}

const PAGE = 1000;
const MAX_ROWS = 60000;

/** Estados que suponen invitación con entrada emitida (o lista para enviar). */
const INVITED_LIKE = new Set([
  "aprobado",
  "aceptado_pendiente_envio",
  "invitacion_enviada",
  "pendiente_confirmacion",
  "confirmado",
  "qr_generado",
  "acceso_validado",
  "incidencia",
]);

/** Bajas: se descuentan del total de invitados. */
const REJECTED = new Set([
  "rechazado",
  "cancelado_asistente",
  "cancelado_figurarte",
  "bloqueado",
  "no_presentado",
]);

const CONFIRMED = new Set(["confirmado", "acceso_validado"]);

type Row = {
  id: string;
  person_id: string | null;
  status: string;
  seat_zone: string | null;
  seat_row: string | null;
  seat_number: string | null;
  people: { first_name: string | null; last_name: string | null } | null;
};

/**
 * KPIs de invitaciones por sesión/evento, calculados sobre los participantes
 * (no sobre los logs de comunicación): un invitado con entrada es una persona
 * cuyo estado indica invitación/entrada emitida, independientemente del canal
 * (email, WhatsApp o exportación .eml).
 */
export function useInvitationKpis(filters: InvitationKpiFilters = {}) {
  return useQuery({
    queryKey: ["invitation_kpis_v2", filters],
    enabled: Boolean(filters.eventId || filters.sessionId),
    queryFn: async (): Promise<InvitationKpis> => {
      const participants: Row[] = [];
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        let q = supabase
          .from("event_participants")
          .select("id, person_id, status, seat_zone, seat_row, seat_number, people(first_name, last_name)")
          .range(from, from + PAGE - 1);
        if (filters.eventId) q = q.eq("event_id", filters.eventId);
        if (filters.sessionId) q = q.eq("session_id", filters.sessionId);
        const { data, error } = await q;
        if (error) throw error;
        const chunk = (data ?? []) as unknown as Row[];
        participants.push(...chunk);
        if (chunk.length < PAGE) break;
      }

      let en_espera = 0;
      let rechazados = 0;
      let invitados_con_entrada = 0;
      let pendientes_confirmar = 0;

      const seatMap = new Map<string, { id: string; nombre: string; status: string }[]>();

      for (const p of participants) {
        if (p.status === "lista_espera") en_espera++;
        if (REJECTED.has(p.status)) {
          rechazados++;
          continue;
        }
        if (!INVITED_LIKE.has(p.status)) continue;

        invitados_con_entrada++;
        if (!CONFIRMED.has(p.status)) pendientes_confirmar++;

        const num = (p.seat_number ?? "").trim();
        if (num) {
          const key = [p.seat_zone ?? "", p.seat_row ?? "", num]
            .map((s) => s.trim().toUpperCase())
            .join(" · ");
          const nombre = [p.people?.first_name, p.people?.last_name].filter(Boolean).join(" ") || "(sin nombre)";
          const list = seatMap.get(key) ?? [];
          list.push({ id: p.id, nombre, status: p.status });
          seatMap.set(key, list);
        }
      }

      const duplicados: DuplicateSeat[] = [];
      for (const [seat, list] of seatMap) {
        if (list.length > 1) duplicados.push({ seat, participants: list });
      }
      duplicados.sort((a, b) => b.participants.length - a.participants.length);

      return {
        invitados_brutos: invitados_con_entrada + rechazados,
        invitados_con_entrada,
        en_espera,
        rechazados,
        invitados_netos: invitados_con_entrada,
        pendientes_confirmar,
        asientos_duplicados: duplicados.reduce((acc, d) => acc + d.participants.length, 0),
        duplicados,
      };
    },
  });
}
