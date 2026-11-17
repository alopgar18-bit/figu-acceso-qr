import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SeatStats = {
  mapa_cargado: boolean;
  butacas_mapa: number;
  butacas_ocupadas: number;
  butacas_dobles: number;
  personas_con_entrada: number;
  personas_fuera_mapa: number;
  personas_sin_butaca: number;
  butacas_libres: number;
  cancelaciones: number;
  cancelaciones_reasignadas: number;
  cancelaciones_libres: number;
  pendientes_revision: number;
  lista_espera: number;
  libres: Array<{ zona: string; fila: string; butaca: string; area: string | null }>;
};

export function useSeatStats(sessionId?: string) {
  return useQuery({
    queryKey: ["seat-stats", sessionId],
    enabled: !!sessionId && sessionId !== "all",
    staleTime: 30_000,
    throwOnError: false,
    queryFn: async (): Promise<SeatStats | null> => {
      if (!sessionId || sessionId === "all") return null;
      const { data, error } = await supabase.rpc(
        "session_seat_stats" as never,
        { _session: sessionId } as never,
      );
      if (error) throw error;
      return data as SeatStats | null;
    },
  });
}