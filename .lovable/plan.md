
# Plan: integración WhatsApp con Wati (revisión final — precedencia de estados ajustada)

Aprobado el plan anterior con UN ajuste en la lógica del webhook (punto 6). Resto idéntico.

## 1. Secrets

- `WATI_API_ENDPOINT` = `https://eu-api.wati.io/1117829`
- `WATI_ACCESS_TOKEN` = token Bearer (sin "Bearer")
- `WATI_WEBHOOK_SECRET` = cadena aleatoria
- `WHATSAPP_PROVIDER` = `wassenger` (default)
- `WASSENGER_API_KEY` intacto

Los pediré con `add_secret` al entrar en build mode.

## 2. Migración Supabase

`communication_logs`: `wati_local_message_id text` (+ índice), `whatsapp_estado text`, `whatsapp_failed_code text`, `whatsapp_failed_detail text`, `whatsapp_last_event_at timestamptz`.

`event_sessions`: `access_time text`, `end_time_estimate text`, `venue_address text`.

`fecha`/`hora_inicio` se derivan de `starts_at` (TZ Europe/Madrid, locale es-ES).

## 3. Archivos nuevos

- `src/lib/phone.ts` — `normalizarTelefonoES`.
- `src/lib/whatsapp-template.ts` — `INVITACION_GRABACION_PUBLICO_TEXT` + `renderInvitacionPreview`.
- `supabase/functions/_shared/phone.ts` — copia Deno.
- `supabase/functions/_shared/wati-format.ts` — formateo `fecha`/`hora_inicio` con `Intl.DateTimeFormat('es-ES',{ timeZone:'Europe/Madrid' })`, construcción de las 11 variables.
- `supabase/functions/wati-webhook/index.ts`.

## 4. Archivos a editar

- `supabase/functions/send-whatsapp/index.ts` — branch por `WHATSAPP_PROVIDER`; Wassenger intacto.
- `supabase/config.toml` — `[functions.wati-webhook] verify_jwt = false`.
- `src/components/send-communication-dialog.tsx` — vista previa de plantilla en canal WhatsApp.
- `src/routes/_authenticated/comunicaciones.envio.tsx` — botón admin "Envío de prueba (1 número)" + mini-dialog (teléfono + participante con asiento) → crea 1 log con `metadata.wati_test=true` + `metadata.force_resend=true` e invoca `send-whatsapp` con `{ ids:[log.id] }`.
- Hooks de estadísticas (`use-reports.ts`, `use-comm-summary.ts`) — filtrar `metadata->>'wati_test' is distinct from 'true'`.

## 5. `sendViaWati`

Idéntico al plan anterior:
- Cargar invitado + sesión + evento.
- Formatear `fecha`/`hora_inicio` con TZ Europe/Madrid (capitalizar weekday).
- Validaciones previas sin pegar a Wati: `pendiente_asiento`, `telefono_invalido`.
- **Idempotencia con excepción de test**: omitir si `whatsapp_estado='sent'` o `wati_local_message_id` no nulo, SALVO que el log tenga `metadata.force_resend=true` o `metadata.wati_test=true` → se permite reenvío (esto cubre el punto 3 del usuario: reenvío de tests).
- **Endpoint del modo prueba**: el botón de "envío de prueba" siempre invoca el endpoint INDIVIDUAL `sendTemplateMessage?whatsappNumber=...` aunque `ids` tenga 1 elemento (cubre el punto 4). El endpoint de lotes `sendTemplateMessages` solo se usa para envíos masivos reales.
- Respuesta: guardar `localMessageId`, marcar `whatsapp_estado='sent'`, `status='enviado'`, `sent_at=now()`. Errores → `whatsapp_estado='failed'`.

## 6. Webhook — precedencia de estados (REVISADO)

Reglas (no jerarquía única):

1. **`failed` es terminal**. Si `whatsapp_estado='failed'`, NINGÚN evento posterior lo sobrescribe. (Excepción: si llega un nuevo `failed`, se actualizan `failed_code`/`failed_detail` y `last_event_at` por si añade detalle.)

2. **Cadena de entrega protegida** (`sent` → `delivered`): nunca retroceder a `sent`. Si el estado guardado ya es `delivered`/`read`/`replied`, ignorar un `sent` tardío (solo refrescar `last_event_at`).

3. **Entrega normal**: `sent` puede pasar a `delivered`. `delivered` puede llegar tarde y debe registrarse aunque ya haya `read`/`replied` (refrescar `last_event_at`, no degradar el estado actual a `delivered` si el actual es más informativo).

4. **`read` y `replied` son señales de interacción independientes**:
   - Pueden registrarse aunque el estado actual sea `delivered`.
   - No se bloquean entre sí: si llega `replied` antes que `read`, un `read` posterior se registra; y al revés.
   - Para no perder esa información, además del campo `whatsapp_estado` se guardará en `metadata` un objeto `wati_events: { sent_at, delivered_at, read_at, replied_at }` con timestamps por evento (campo aditivo, nunca se borra).
   - `whatsapp_estado` avanza hacia el más informativo entre `read`/`replied` (el último que llegue queda como estado mostrado), pero ambos quedan registrados en `metadata.wati_events`.

5. `whatsapp_last_event_at` se actualiza SIEMPRE con la hora del evento entrante (salvo si el evento es más antiguo que el guardado, en cuyo caso se ignora).

6. Eventos sin `localMessageId` conocido → 200 + log interno.

7. SIEMPRE responder 200.

Implementación: la edge function lee el log actual, aplica las reglas arriba en código (no en SQL), y hace UN update con el estado resultante + `metadata` mergeado + `last_event_at`.

## 7. Datos sesión 17 junio

Tras migración, actualizar la sesión con `access_time`, `end_time_estimate`, `venue_address`.

## 8. Acompañantes

Código preparado para iterar; envío individual por acompañante queda pendiente del trabajo de QR por acompañante.

## 9. Wassenger

Sin tocar. Flag en `wassenger`. Activación = cambiar secret `WHATSAPP_PROVIDER` a `wati` (las edge functions leen `Deno.env` en cada invocación, no requiere redeploy).

## 10. Verificaciones que confirmaré al implementar (avisaré solo si fallan)

1. `PUBLIC_SITE_URL` = `https://figurarte.app`.
2. `events.name` de la sesión = `"EL PERRO ANDALUZ by Manu Sánchez"` exacto.
3. Botón de test permite reenvío repetido (vía `force_resend=true`/`wati_test=true` en metadata).
4. Modo test usa endpoint individual `sendTemplateMessage`.

## 11. Entregables al terminar

- URL final del webhook con `?key=` ya formada:  
  `https://oryjxtqfvciwgcjfgxho.supabase.co/functions/v1/wati-webhook?key=<WATI_WEBHOOK_SECRET>`  
  (te paso el valor final sustituido con el secret real).
- Instrucción exacta para activar el flag (cambiar el valor de `WHATSAPP_PROVIDER` a `wati` en Secrets; surte efecto en la siguiente invocación).
- Botón "envío de prueba a 1 número" operativo, con `wati_test=true`, fuera de estadísticas, y reusable.

¿Lo lanzo?
