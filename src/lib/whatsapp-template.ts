// Texto LITERAL de la plantilla aprobada (o en aprobación) en Meta:
// "invitacion_grabacion_publico". Solo se usa para la VISTA PREVIA en el
// panel. El envío real usa la plantilla por nombre en Wati.
export const INVITACION_GRABACION_PUBLICO_TEXT = `Hola {{nombre}}

¡Ya queda menos para formar parte de la grabación en directo de {{programa}}!

📅 {{fecha}}

• Hora de acceso: {{hora_acceso}}
• Hora de inicio: {{hora_inicio}}
• Hora fin aprox.: {{hora_fin}}

🎫 Su localización
• Zona: {{zona}}
• Fila: {{fila}}
• Asiento: {{asiento}}

Al tratarse de una grabación televisiva, este horario es orientativo y podría sufrir pequeños adelantos o retrasos en función del desarrollo de la producción.

📍 Lugar de grabación
{{lugar}}

Recibirá un pase de acceso personalizado con código QR que deberá presentar junto a su DNI para acceder al recinto.

🎟️ Su entrada: {{enlace_entrada}}

¡Gracias por acompañarnos y por formar parte del público!`;

export interface InvitacionVars {
  nombre?: string | null;
  programa?: string | null;
  fecha?: string | null;
  hora_acceso?: string | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  zona?: string | null;
  fila?: string | null;
  asiento?: string | null;
  lugar?: string | null;
  enlace_entrada?: string | null;
}

export function renderInvitacionPreview(vars: InvitacionVars): string {
  return INVITACION_GRABACION_PUBLICO_TEXT.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = (vars as Record<string, unknown>)[k];
    return v == null || v === "" ? `{{${k}}}` : String(v);
  });
}