## Acción inmediata (ahora)

1. Devolver a `pendiente` los 43 WhatsApp marcados como `failed` con error `401` del lote `manual_2026-06-30T20:46…/20:47…` para la sesión del 2 de julio.
2. Lanzar la cola Wati ya con el token nuevo y verificar que los primeros envíos responden `200` en los logs.
3. Si todo va bien, dejar que termine sin tocar nada más.

## Mejoras anti-token-caducado

1. **Detectar 401 como caso especial** en `send-whatsapp`: al primer `401` se aborta el lote, los mensajes que aún no se han enviado vuelven a `pendiente` y se marca el motivo como `wati_unauthorized`. Así no se "queman" los 900 con el mismo error.
2. **Mensaje claro en la UI de la cola**: cuando el motivo del fallo sea `wati_unauthorized`, mostrar arriba un aviso rojo: *"Token de Wati caducado o inválido. Renueva WATI_ACCESS_TOKEN antes de reintentar"*, en lugar del genérico actual.
3. **Botón "Probar conexión Wati"** en la cabecera de `comunicaciones.cola`: hace una llamada barata a Wati (`/api/v1/getMessageTemplates?pageSize=1`) y muestra al instante ✅ token válido / ❌ token caducado, antes de lanzar cientos de mensajes.

## Detalles técnicos

- `supabase/functions/send-whatsapp/index.ts`: añadir rama `if (response.status === 401)` que rompe el bucle y devuelve los pendientes a estado `pending` con `error_message = 'wati_unauthorized'`.
- `src/routes/_authenticated/comunicaciones.cola.tsx`: banner condicional + botón "Probar conexión Wati" que invoca una nueva server function `testWatiConnection` en `src/lib/wati.functions.ts`.
- No se toca lógica de envío masivo ni el "drain lock" actuales.

¿Procedo con todo esto?
