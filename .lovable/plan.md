## Problema

Tras el fix de seguridad de esta mañana, las Edge Functions `send-email` y `send-whatsapp` exigen rol `admin`, pero en la plataforma ese rol no existe — se usan `superadmin`, `admin_figurarte`, `coordinador`, etc. Por eso al pulsar cualquier botón de envío (email o WhatsApp, incluido "Reanudar cola") la función devuelve 403 → "Edge Function returned a non-2xx status code" y hay 35 WhatsApps pendientes sin worker.

## Solución

1. **`supabase/functions/_shared/require-admin.ts`**
   - Renombrar internamente a "requireStaff" (mantener export `requireAdmin` para no romper imports).
   - Sustituir la llamada `has_role(userId, 'admin')` por `has_any_role(userId, ARRAY['superadmin','admin_figurarte','coordinador'])` (RPC ya existe en la BBDD).
   - Devolver también el rol para poder loguearlo.

2. **Redeploy** de `send-email` y `send-whatsapp` para aplicar el cambio.

3. **Recuperar la cola parada**: como ya no habrá error de auth, basta con pulsar "Reanudar cola" desde el banner. Si prefieres, lo lanzo yo desde aquí una vez desplegado.

## Qué NO se toca

- No se relaja ninguna otra política ni RLS.
- El resto de las mejoras de seguridad (sanitización XSS, restricción del `from`) siguen intactas.
- No se cambia UI, ni la lógica de rate-limit / spam pause.

## Verificación

- Log-in como coordinador o admin_figurarte → pulsar "Enviar TODA la cola WhatsApp" → esperar respuesta 200 con `{ processed, sent, failed }`.
- Revisar `edge_function_logs send-whatsapp`: debe aparecer el arranque del worker sin `Forbidden`.
- Banner debe pasar a "Worker activo" y el contador de pendientes debe bajar.
