import { supabase } from "@/integrations/supabase/client";
import { notifySessionExpired, tryRefreshSession } from "./session-refresh";

export class AuthedInvokeError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "AuthedInvokeError";
    this.status = status;
    this.payload = payload;
  }
}

function readPayloadMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const m = payload as { message?: unknown; error?: unknown };
  if (typeof m.message === "string" && m.message.trim()) return m.message;
  if (typeof m.error === "string" && m.error.trim()) return m.error;
  return null;
}

/**
 * Invoca una edge function de Lovable Cloud con el bearer del usuario y
 * reintento automático si el token ha caducado. Trata 409 como éxito
 * (proceso pausado, no error).
 */
export async function authedInvoke<T = Record<string, unknown>>(
  functionName: string,
  body: unknown = {},
  opts: { retriedOn401?: boolean; treat409AsSuccess?: boolean } = {},
): Promise<T> {
  const treat409AsSuccess = opts.treat409AsSuccess ?? true;
  const { data: sessionData } = await supabase.auth.getSession();
  let accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    const ok = await tryRefreshSession();
    if (!ok) {
      notifySessionExpired();
      throw new AuthedInvokeError(401, "Sesión caducada. Vuelve a iniciar sesión.", null);
    }
    const { data: refreshed } = await supabase.auth.getSession();
    accessToken = refreshed?.session?.access_token;
    if (!accessToken) {
      notifySessionExpired();
      throw new AuthedInvokeError(401, "Sesión caducada. Vuelve a iniciar sesión.", null);
    }
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as
    | string
    | undefined;

  if (!baseUrl || !apiKey) {
    throw new Error("No se pudo conectar con el backend.");
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { message: text }; }
  }

  if (response.ok || (treat409AsSuccess && response.status === 409)) {
    return payload as T;
  }

  if (response.status === 401 && !opts.retriedOn401) {
    // Reintento silencioso una vez tras refrescar la sesión.
    const ok = await tryRefreshSession();
    if (ok) {
      return authedInvoke<T>(functionName, body, { ...opts, retriedOn401: true });
    }
    notifySessionExpired();
    throw new AuthedInvokeError(401, "Sesión caducada. Vuelve a iniciar sesión.", payload);
  }

  const msg = readPayloadMessage(payload)
    ?? (response.status === 403
          ? "No tienes permisos para esta acción."
          : `Error del servidor (${response.status}).`);
  throw new AuthedInvokeError(response.status, msg, payload);
}