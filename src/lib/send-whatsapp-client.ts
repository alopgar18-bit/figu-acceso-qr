import { AuthedInvokeError, authedInvoke } from "./authed-invoke";

// Re-exportado como SendWhatsappError para no romper llamadas existentes.
export class SendWhatsappError extends AuthedInvokeError {
  constructor(status: number, message: string, payload: unknown) {
    super(status, message, payload);
    this.name = "SendWhatsappError";
  }
}

type SendWhatsappBody = {
  ids?: string[];
  action?: "test";
};

/**
 * Invoca la edge function send-whatsapp con reintento automático si el
 * token del usuario ha caducado (evita 401 tras procesos largos).
 */
export async function invokeSendWhatsapp<T = Record<string, unknown>>(
  body: SendWhatsappBody = {},
): Promise<T> {
  try {
    return await authedInvoke<T>("send-whatsapp", body, { treat409AsSuccess: true });
  } catch (e) {
    if (e instanceof AuthedInvokeError) {
      throw new SendWhatsappError(e.status, e.message, e.payload);
    }
    throw e;
  }
}