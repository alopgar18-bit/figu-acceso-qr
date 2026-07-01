## Diagnóstico

Del CSV que has subido: **66 de 69 mensajes** marcados por Wati como `Spam Rate limit hit`, todos enviados en la ventana 15:34-15:38. El circuit breaker actual solo mira errores **síncronos** del `POST /sendTemplateMessages`, pero Wati devuelve `200 OK` y **después** rechaza vía webhook, por eso no reacciona a tiempo.

## Qué se implementa

### 1. Ritmo por defecto más bajo (~20 msg/min)
En `supabase/functions/send-whatsapp/index.ts`:
- `delayMs` por defecto: **1300 ms → 3000 ms**
- `jitterMs` por defecto: **250 ms → 600 ms**
- `batchSize` por defecto: **40 → 20**
- `batchPauseMs` por defecto: **10 s → 15 s**
- Ritmo real esperado: ~18–20 msg/min. Un envío de 500 tarda ≈ 27 min (antes ≈ 11 min).
- Los overrides seguirán aceptándose desde el body por si algún día hay que acelerar puntualmente.

### 2. Circuit breaker por webhook de Wati
En `supabase/functions/wati-webhook/index.ts`:
- Detectar eventos con `failedDetail`/`reason` que contengan `spam rate limit`.
- Marcar el `communication_log` como fallido con `whatsapp_estado = 'wati_spam_ratelimit'` y guardar el motivo.
- Contar ocurrencias en los últimos 2 minutos vía tabla nueva `whatsapp_spam_events (id, occurred_at, batch_id, wati_id)`.
- Si en 2 min hay **≥ 3 eventos de spam**: escribir `whatsapp_drain_locks` con `wati_paused_reason = 'WATI_SPAM_BURST'` y `pause_until = now() + 10 min`.
- El worker ya respeta ese lock, por lo que la cola se pausa sola.
- Auto-liberación cuando `now() > pause_until`.

### 3. Banner y aviso en la UI de Cola
`src/routes/_authenticated/comunicaciones.cola.tsx` + `src/components/whatsapp-queue-status-banner.tsx`:
- Banner naranja "Wati está marcando envíos como spam — cola pausada 10 min (reanuda a las HH:MM)".
- Botón "Reanudar ahora" (fuerza liberar el lock, avisando del riesgo).
- KPI extra: "Fallidos por spam (24 h)".

### 4. Botón "Reintentar fallidos por spam"
- En la cabecera de `comunicaciones.cola.tsx`, junto al de 401.
- Server fn en `src/lib/bulk-send.functions.ts`: cuenta y devuelve a `pendiente` los logs con `whatsapp_estado = 'wati_spam_ratelimit'` (o motivo que matchee) del batch/sesión indicados.
- Al lanzarlos, se procesan con el nuevo ritmo lento por defecto.
- Los 66 fallidos del CSV de hoy se pueden recuperar ya con este botón.

### 5. Migraciones SQL
```sql
create table public.whatsapp_spam_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  batch_id uuid,
  wati_id text,
  phone text,
  raw jsonb
);
grant select, insert on public.whatsapp_spam_events to service_role;
alter table public.whatsapp_spam_events enable row level security;
create policy "admins read spam events" on public.whatsapp_spam_events
  for select to authenticated using (public.is_admin(auth.uid()));
create index on public.whatsapp_spam_events (occurred_at desc);
```

## Qué NO se toca
- Plantilla `entrada_grabacin` y variables de zona/fila/asiento (ya OK).
- Flujo de email (Resend).
- 401/token handling de Wati (ya OK).

## Detalles técnicos
- Reutiliza `whatsapp_drain_locks` que ya existe para 401 → añade el motivo `WATI_SPAM_BURST` con `pause_until`.
- El worker `send-whatsapp` ya lee ese lock y se aborta limpiamente dejando el resto en `pendiente`.
- No hace falta cron: cada nueva invocación consulta el lock y respeta `pause_until`.

¿Lo aplico así?