## Objetivo
Encolar y enviar por email la entrada con QR a los 55 titulares de la sesión "Grabación 15 de julio" (`d7ef865e-151a-4fbd-82e2-08e47554cf17`) que están en `aceptado_pendiente_envio` con ticket emitido y email válido.

## Pasos

1. **Verificar destinatarios en BD** (SELECT sobre `event_participants` + `people` + `tickets`) para la sesión indicada:
   - status en `aceptado_pendiente_envio`, `invitacion_enviada` sin log de email enviado, o `qr_generado` sin email previo
   - con `qr_token` activo (no revoked)
   - con email válido
   - excluir a los que ya tengan `communication_logs` con `status='enviado'` y `channel='email'` para esta sesión y plantilla de invitación

2. **Insertar `communication_logs`** (canal `email`, status `pendiente`) uno por destinatario, con:
   - `to_address` = email de la persona
   - `subject` = asunto de la plantilla de invitación (leído de `communication_templates`)
   - `body` = HTML de la plantilla con variables rellenadas (nombre, evento, fecha, hora_acceso/inicio/fin, ubicación, enlace_entrada = `https://figurarte.app/t/{qr_token}`)
   - `session_id`, `event_id`, `participant_id`
   - `template_id` de la plantilla usada
   - `metadata.from` = remitente por defecto

3. **Encolar `background_job`** de tipo `send_email` con `payload = { ids: [<log_ids>] }`. El tick público (pg_cron cada minuto) lo procesa contra la edge function `send-email`, que respeta throttling y 429 de Resend.

4. **Reportar** al usuario el número encolado, y confirmar que puede seguir su progreso desde Comunicaciones → Cola.

## Detalles técnicos

- Ejecución vía `psql` (SELECT para validar) + `supabase--insert` para `communication_logs` y `background_jobs` (no requiere migración).
- Plantilla a usar: la de invitación con entrada del evento. Si hay varias, leer la marcada como default para canal `email` del evento; si no hay, avisar y parar antes de insertar.
- Idempotencia: filtramos previamente por ausencia de log `enviado` para esta sesión + participante + plantilla, evitando duplicar envíos.
- Sin cambios de código.

## Riesgo controlado
Si algún destinatario no tiene email o token, se excluye y se reporta el conteo aparte. No se degrada ningún estado.