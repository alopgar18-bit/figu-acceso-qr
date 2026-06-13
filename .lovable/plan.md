## Diagnóstico

- **Página de entrada** (`/c/$token/entrada` y `/t/$qrToken`): el código ya pinta tres líneas (Acceso / Inicio / Fin aprox.) leyendo `session.doors_open_at`, `session.starts_at` y `session.ends_at`. La consulta `event_sessions(*)` devuelve los tres campos y los datos en BD existen. No requiere cambios; al volver a abrir la entrada se mostrarán.
- **Email**: el motor de plantillas sí inyecta `{{hora_inicio}}` y `{{hora_fin}}` en el contexto (lo añadimos en `bulk-send.functions.ts` y `communication-constants.ts`), pero **las plantillas guardadas en la base de datos no contienen esos tokens** — solo `{{hora_acceso}}` — así que nunca se renderizan. Hay que añadir las líneas a las plantillas existentes y a las plantillas/sugerencias por defecto.

## Cambios

1. **Migración SQL** que actualiza `communication_templates` activas de canal `email`: para cada fila cuyo `body` contenga `Hora de acceso: {{hora_acceso}}`, insertar inmediatamente después dos líneas:
   ```
   Hora de inicio: {{hora_inicio}}
   Hora fin aprox.: {{hora_fin}}
   ```
   Solo se aplica si todavía no contiene `{{hora_inicio}}`, para no duplicar en plantillas ya editadas manualmente. Para la plantilla HTML «Invitación El Perro Andaluz» se hace una sustitución equivalente sobre el bloque `<div><strong>Fecha:</strong> {{fecha}} · {{hora_acceso}}</div>` añadiendo dos líneas debajo.

2. **`src/communication-constants.ts`**: actualizar las plantillas por defecto (`solicitud_aprobada`, `entrada_qr` texto, `entrada_qr` HTML y `recordatorio` WhatsApp) para incluir las dos nuevas líneas / tokens. Así las plantillas semilla nuevas ya vienen completas.

3. **`src/routes/_authenticated/comunicaciones.envio.tsx`**: en `handleCreateSuggestedTemplate`, añadir al body sugerido las líneas `Hora de inicio: {{hora_inicio}}` y `Hora fin aprox.: {{hora_fin}}`. Añadir también `hora_inicio` y `hora_fin` al `previewSample` para que la vista previa los muestre.

4. **`src/components/template-editor-dialog.tsx`**: añadir `hora_inicio: "20:00"` y `hora_fin: "22:30"` al `sampleCtx` para que la previsualización del editor renderice los nuevos tokens.

5. **Entrada (`c.$token.entrada.tsx` y `t.$qrToken.tsx`)**: sin cambios — ya muestran Acceso / Inicio / Fin aprox. Verificar visualmente tras desplegar abriendo una entrada existente.

## Aviso al usuario

Las plantillas que ya hayas editado manualmente y que no contengan exactamente `Hora de acceso: {{hora_acceso}}` no se tocan para no romper tu maquetación. Si tienes alguna así, dímelo y la actualizo a mano o te indico dónde añadir los dos tokens nuevos.
