## Objetivo
Botón único "Enviar TODA la cola" en `/comunicaciones/cola` que drena todos los pendientes en el servidor, con pausas anti-saturación de Resend, sin que el usuario tenga que ir clic a clic ni dejar el navegador abierto.

## Cambios

### 1. `supabase/functions/send-email/index.ts`
- Acepta `background?: boolean` (+ opcionales `event_id`, `session_id`, `batch_id`).
- Sin `ids`: resuelve TODOS los pendientes paginando 1000 en 1000 (sin tope de 100).
- Si hay >20 logs o `background=true`: responde 202 con `{ background, queued, queued_ids }` y procesa con `EdgeRuntime.waitUntil`.
- Mismas pausas anti-spam dentro del background: `delay_ms` (def. 500 ms) entre emails, pausa doble cada `batch_size` (def. 100).
- Resend 429: respeta `Retry-After` y deja el resto `pendiente` para la próxima invocación.
- ≤20 logs sin background: comportamiento síncrono actual.

### 2. `src/routes/_authenticated/comunicaciones.cola.tsx`
- "Enviar TODA la cola" (primario): invoca `send-email` con `{ background: true }` sin `ids`.
- "Enviar N seleccionados" (si hay selección): igual + `ids`.
- Respuesta `background: true` → toast + `startBatchTracking(queued_ids)` (barra de progreso y polling ya existen, agnósticos del canal).
- Contador real de pendientes junto al botón (consulta `count`, no limitada a 500).
- "Cancelar seguimiento" limpia `bgBatch` (no aborta server).

### 3. `src/lib/bulk-send.functions.ts`
- `queueBulkInvitations` devuelve también `inserted_log_ids: string[]` para que la pantalla de importación pueda lanzar el envío en background con esos ids.

## Verificación
1. 5 pendientes → síncrono.
2. >500 pendientes → respuesta inmediata, barra sube, cerrar pestaña no detiene el envío.
3. 429 simulado → tanda se pausa, resto queda pendiente, próxima invocación los retoma.
4. Selección de N filas → "Enviar N seleccionados" con mismas pausas.
