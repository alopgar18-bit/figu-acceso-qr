## Objetivo
Eliminar los fallos por caducidad de sesión en TODOS los procesos largos de la plataforma (envíos WhatsApp/email, importaciones, generación masiva, exportaciones), no solo en la cola de WhatsApp. Solución en tres capas: sesión resiliente, jobs desacoplados del navegador, y configuración de auth.

---

## Capa A — Sesión resiliente (aplica a toda la app)

**A1. Refresh proactivo en `src/hooks/use-auth.tsx`**
- Listener de `visibilitychange` + `focus`: si `expires_at` < 5 min, llamar `supabase.auth.refreshSession()`.
- `setInterval` cada 4 min mientras la pestaña esté visible, como red de seguridad contra navegadores que congelan timers en background.

**A2. Reintento silencioso tras 401**
- Ampliar `src/lib/send-whatsapp-client.ts` con lógica: si 401 → `refreshSession()` → reintentar una vez → si vuelve a fallar, mostrar aviso.
- Crear helper genérico `src/lib/authed-invoke.ts` que envuelve `supabase.functions.invoke` con el mismo patrón.
- Migrar todas las llamadas a edge functions (send-email, send-whatsapp, wati-webhook test) a este helper.

**A3. Hook `useKeepSessionAlive(active)` en `src/hooks/use-keep-session-alive.ts`**
- Cuando `active === true`, hace `supabase.auth.getUser()` cada 4 min.
- Se activa en:
  - `whatsapp-queue-status-banner.tsx` cuando hay `queued > 0` o `processing > 0`.
  - Página de importaciones cuando hay batch en progreso.
  - Página de envíos por lotes cuando `bulk_progress` está activo.
  - Cualquier página con job en `running`.

**A4. Aviso no destructivo cuando el refresh falla realmente**
- Nuevo componente `<SessionExpiredToast>` que aparece como toast persistente con botón "Volver a iniciar sesión" (abre `/login` en nueva pestaña) en lugar de redirigir y perder estado.
- Se dispara desde el interceptor A2 cuando el refresh token también falla.

---

## Capa B — Desacoplar procesos largos del navegador

**B1. Nueva tabla `background_jobs` (migración)**
```
id uuid PK
kind text (send_whatsapp | send_email | import_batch | export_report | bulk_assign)
payload jsonb
status text (queued | running | done | failed | paused | cancelled)
progress jsonb ({ total, done, failed, current_step })
result jsonb
error text
created_by uuid → auth.users
created_at, started_at, finished_at timestamptz
lock_owner text, lock_expires_at timestamptz
```
Con GRANTs (`authenticated` SELECT/INSERT own; `service_role` ALL), RLS y policies scoped a `created_by = auth.uid()` o `is_admin`.

**B2. Endpoint `src/routes/api/public/jobs/tick.ts`**
- Server route pública (autenticada por `apikey = anon key`).
- Loop: toma jobs `queued` (con lock optimista), los ejecuta usando `supabaseAdmin`, actualiza `progress` incrementalmente.
- Dispatcher por `kind` que llama a los handlers correspondientes.

**B3. pg_cron cada minuto**
- Habilitar `pg_cron` + `pg_net`.
- `SELECT cron.schedule('jobs-tick', '* * * * *', ...)` que hace POST al endpoint anterior con apikey.

**B4. Refactor de procesos existentes**
- **WhatsApp/email**: el botón "Enviar" ya no invoca directamente el edge function. Hace `INSERT INTO background_jobs(kind='send_whatsapp', payload={ids, template_id})`. El handler en el tick reutiliza la lógica interna de `send-whatsapp/index.ts` pero con SERVICE_ROLE y sin dependencia del token del usuario.
- **Importaciones grandes**: `importaciones.nueva.tsx` sigue subiendo el CSV y creando el `import_batch`, pero el procesamiento pesado se convierte en `kind='import_batch'`. La UI hace polling de `background_jobs.progress`.
- **Exportaciones/informes**: mismo patrón, resultado se guarda en `public-assets` bucket y se devuelve URL.

**B5. Componente genérico `<JobProgress jobId />`**
- Polling cada 3 s vía `useQuery` con `refetchInterval`.
- Se integra en banner WhatsApp, página de importación, y futuras pantallas.
- Sobrevive al cierre de pestaña: al reabrir muestra el estado actual del job.

---

## Capa C — Configuración de Auth

**C1.** Subir JWT expiry en Cloud Auth de 1 h → 4 h (menos refrescos, sigue seguro porque el refresh token rota). Se hace vía `supabase--configure_auth`.

---

## Alcance del "hazlo todo"
Implemento las tres capas en un único paquete de cambios, en este orden:

1. **Capa A completa** (5 archivos nuevos/editados) — resuelve el 80% de forma inmediata.
2. **Capa B**:
   - Migración `background_jobs`.
   - `src/routes/api/public/jobs/tick.ts`.
   - `src/lib/jobs.functions.ts` (crear/consultar/cancelar jobs desde UI).
   - Componente `<JobProgress>`.
   - Refactor de WhatsApp: la UI encola en `background_jobs` en vez de invocar el edge function directamente. El edge function `send-whatsapp` se adapta para poder ser llamado por el tick (con lock del propio job).
   - Refactor de importaciones para usar el mismo patrón.
   - pg_cron via `supabase--insert`.
3. **Capa C**: subir JWT expiry a 4 h.

## Riesgos y mitigación
- El refactor de la cola WhatsApp toca código en producción; mantendré compatibilidad para que los jobs a medio hacer terminen bien.
- Exportaciones no las migro en esta iteración salvo que ya haya evidencia de que se cuelgan; si prefieres, se añaden luego.
- pg_cron necesita habilitar extensiones (se hace en la migración).

## Fuera de alcance
- Sesiones eternas (imposible por diseño).
- Reescribir edge functions desde cero.
- UI de administración de jobs (listado, retry manual) — se puede añadir después; por ahora solo el progreso in-context.

¿Confirmo y arranco con las tres capas?
