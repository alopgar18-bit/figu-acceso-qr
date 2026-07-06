import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

let refreshPromise: Promise<boolean> | null = null;
let expiredToastShown = false;

/**
 * Intenta refrescar la sesión de Supabase de forma silenciosa.
 * - Devuelve `true` si tras la operación hay sesión válida.
 * - Devuelve `false` si el refresh token también ha expirado.
 * - Deduplica llamadas concurrentes.
 */
export async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn("[session] refresh failed", error);
        return false;
      }
      return !!data?.session;
    } catch (err) {
      console.warn("[session] refresh threw", err);
      return false;
    } finally {
      // Liberar tras el ciclo de eventos para que reintentos posteriores puedan pedir uno nuevo.
      setTimeout(() => { refreshPromise = null; }, 0);
    }
  })();
  return refreshPromise;
}

/**
 * Muestra un toast persistente (no destructivo) cuando la sesión
 * ha caducado de verdad. Evita redirigir a /login para no perder
 * el estado del proceso en curso.
 */
export function notifySessionExpired(message = "Tu sesión ha caducado. Vuelve a iniciar sesión sin perder este proceso.") {
  if (expiredToastShown) return;
  expiredToastShown = true;
  toast.error(message, {
    id: "session-expired",
    duration: Infinity,
    action: {
      label: "Iniciar sesión",
      onClick: () => {
        // Abre login en pestaña nueva; la sesión se propaga al volver.
        window.open("/login", "_blank", "noopener");
        expiredToastShown = false;
      },
    },
  });
}

export function resetSessionExpiredToast() {
  expiredToastShown = false;
}