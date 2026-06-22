## Objetivo

Conseguir que el envío de invitaciones por WhatsApp con Wati funcione de extremo a extremo: prueba a 1 número → envío masivo a la sesión del 24 → recepción de estados (delivered/read/failed) por webhook.

## Estado actual (verificado)

- Edge function `send-whatsapp` con rama Wati: implementada, con logs de diagnóstico, idempotencia, validaciones (teléfono, asiento, token, sesión completa) y dos modos (individual / batch).
- Webhook `wati-webhook`: implementado, protegido con `?key=<WATI_WEBHOOK_SECRET>`, reglas de precedencia de estados.
- Plantilla `entrada_grabacin` (ES, 11 variables) + helpers `buildWatiParameters`, `formatFechaLarga`, `formatHora` (TZ Europe/Madrid).
- Secrets configurados: `WATI_API_ENDPOINT`, `WATI_ACCESS_TOKEN`, `WATI_WEBHOOK_SECRET`, `WHATSAPP_PROVIDER`, `PUBLIC_SITE_URL`.
- UI: `WatiTestSendDialog` (prueba 1 número) y `comunicaciones.cola` / `comunicaciones.envio` para masivo.
- Diálogo de prueba (`send-communication-dialog`) y exclusión de `wati_test=true` en stats.
- **BBDD: 0 logs WhatsApp** en `communication_logs`. Nunca se ha completado un envío real por Wati.
- **0 logs en la edge function `send-whatsapp`** → la última prueba probablemente ni llegó a invocar la función, o se está invocando hace más de la retención de logs.

## Lo que falta — 4 bloques

### Bloque A · Diagnosticar por qué la prueba no llega (sin tocar código)

1. Confirmar el valor real de `WHATSAPP_PROVIDER` (debe ser `wati`, no `wassenger`). Si está en `wassenger`, la rama Wati ni se ejecuta y el envío sale por Wassenger (o queda como "no configurado" si Wassenger tampoco tiene key válida).
2. Confirmar formato de `WATI_API_ENDPOINT` (debe ser la URL base de tu tenant, p. ej. `https://live-mt-server.wati.io/<TENANT_ID>` — sin `/api/v1/...` al final, los helpers añaden la ruta).
3. Lanzar UNA prueba desde el diálogo Wati al móvil del usuario y, justo después, leer `supabase--edge_function_logs send-whatsapp` para ver:
   - URL exacta llamada, status HTTP de Wati y body de respuesta (los logs ya están instrumentados).
   - Diagnóstico esperado: 401 → token mal; 404 → endpoint mal; 200 con `result:false` → plantilla/idioma/parámetros; 200 con `localMessageId` → enviado OK pero no llega → ventana 24h o plantilla no aprobada para ese número.
4. Si la respuesta es 200 + `localMessageId` pero no llega, revisar en el panel Wati: plantilla `entrada_grabacin` aprobada, idioma `es` (no `es_ES`), 11 variables en ese orden exacto, y que el número de prueba no esté bloqueado / fuera de los países permitidos.

> Salida del bloque A: una decisión clara — "es config (token/endpoint/flag)", "es plantilla" o "es Wati (ventana / aprobación)".

### Bloque B · Configurar el webhook en Wati

El webhook está implementado y desplegado pero no consta configurado en el panel de Wati.

1. URL a pegar en Wati → Settings → Webhooks:
   `https://<project>.functions.supabase.co/wati-webhook?key=<WATI_WEBHOOK_SECRET>`
   (la pasamos por chat con el valor real cuando vayamos a aplicar).
2. Eventos a activar: `templateMessageSent_v2`, `sentMessageDELIVERED_v2`, `sentMessageREAD_v2`, `sentMessageREPLIED_v2`, `templateMessageFailed`.
3. Verificación: tras la prueba del bloque A, comprobar que llegan estados en `communication_logs.whatsapp_estado` (sent → delivered → read).

### Bloque C · Checklist previo al envío masivo del 24

Antes de pulsar "Enviar" en la cola para la sesión del 24:

1. Confirmar que la sesión 24-junio tiene `starts_at`, `access_time`, `end_time_estimate`, `venue_address` y `events.name` rellenos (la función falla con `sesion_incompleta` si no).
2. Confirmar nº de participantes con: `confirmation_token` ✅, `seat_zone/row/number` ✅, `people.phone` válido ES, y `status` en el set permitido. Sacar conteo y lista de excluidos.
3. Decidir tamaño de tanda: la función Wati no aplica `delay_ms` (solo Wassenger). Para el primer envío real, lanzar **una primera tanda pequeña (≤10 ids)** desde el diálogo de envío y luego el resto.
4. Re-verificar que el enlace `${PUBLIC_SITE_URL}/og/c/<token>` resuelve y muestra el asiento ya cargado en BBDD.

### Bloque D · (Opcional, recomendado tras el 24) endurecer la cola

- Añadir parámetro `batch_size`/`delay_ms` también a la rama Wati de `send-whatsapp` (hoy solo Wassenger los respeta).
- Botón "Reintentar fallidos" en `comunicaciones.cola` que invoque la edge con los `ids` de los `status=fallido` recuperables (telefono_invalido NO se reintenta, errores transitorios de Wati SÍ).
- Página de detalle por log con la traza Wati (estado, timestamps, error_code/detail).

## Detalles técnicos

- `WHATSAPP_PROVIDER` se lee con `Deno.env.get(...).toLowerCase()` en `send-whatsapp/index.ts`. Si no es exactamente `wati`, entra por Wassenger.
- Los logs `console.log("[WATI]...")` ya están en `_shared/wati-format.ts` — son suficientes para diagnosticar A.
- `wati-webhook` requiere `?key=` exacto a `WATI_WEBHOOK_SECRET` (timing-safe). Sin él → 401 silencioso en Wati.
- La idempotencia bloquea reintentar un log ya `enviado` salvo `metadata.wati_test=true` o `metadata.force_resend=true` — relevante si pruebas dos veces al mismo número con el mismo log.

## Lo que NO se toca en este plan

- Importación de asientos / solicitudes (congelado hasta después del 24, según conversación previa).
- Emails ya enviados / sus enlaces.
- Datos de la sesión del 24 en BBDD.

## Orden de ejecución sugerido

1. Bloque A (diagnóstico con logs) → me dices qué dice el toast / yo leo logs de la edge.
2. Bloque B (webhook en panel Wati) — en paralelo con A.
3. Bloque C (checklist y primera tanda pequeña) cuando A esté verde.
4. Bloque D después del 24.
