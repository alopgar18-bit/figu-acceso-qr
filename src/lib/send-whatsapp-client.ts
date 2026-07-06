import { supabase } from "@/integrations/supabase/client";

export class SendWhatsappError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "SendWhatsappError";
    this.status = status;
    this.payload = payload;
  }
}

type SendWhatsappBody = {
  ids?: string[];
  action?: "test";
};

function readPayloadMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as { message?: unknown; error?: unknown };
  if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;
  if (typeof maybe.error === "string" && maybe.error.trim()) return maybe.error;
  return null;
}

export async function invokeSendWhatsapp<T = Record<string, unknown>>(body: SendWhatsappBody = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new SendWhatsappError(
      401,
      "Sesión caducada, vuelve a iniciar sesión para reanudar la cola.",
      null,
    );
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apiKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as
    | string
    | undefined;

  if (!baseUrl || !apiKey) {
    throw new Error("No se pudo conectar con el backend de envíos.");
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/functions/v1/send-whatsapp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      readPayloadMessage(payload) ??
      (response.status === 401 || response.status === 403
        ? "Sesión caducada o sin permisos. Vuelve a iniciar sesión como admin y reintenta."
        : `No se pudo reanudar la cola (${response.status}).`);
    throw new SendWhatsappError(response.status, message, payload);
  }

  return payload as T;
}