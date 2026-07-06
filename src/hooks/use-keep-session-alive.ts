import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mantiene viva la sesión de Supabase mientras un proceso largo está en
 * curso (envíos masivos, importaciones, exportaciones). Refresca el token
 * cada 4 minutos, incluso si el navegador ha congelado el auto-refresh
 * por tener la pestaña en segundo plano.
 *
 * Uso:
 *   useKeepSessionAlive(hasActiveJob);
 */
export function useKeepSessionAlive(active: boolean, intervalMs = 4 * 60 * 1000) {
  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;
        if (!session) return;
        const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
        // Refrescar si queda menos de 10 minutos.
        if (expiresAt && expiresAt - Date.now() < 10 * 60 * 1000) {
          await supabase.auth.refreshSession();
        } else {
          // Forzar validación server-side para mantener el refresh token vivo.
          await supabase.auth.getUser();
        }
      } catch (err) {
        if (!cancelled) console.warn("[useKeepSessionAlive] refresh failed", err);
      }
    };

    void refresh();
    const id = setInterval(() => { void refresh(); }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, intervalMs]);
}