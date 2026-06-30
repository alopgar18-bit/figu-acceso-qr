# Mejora del envío masivo de WhatsApp (Wati) — entrega mismo día

## Diagnóstico del CSV de Wati

- 1.175 envíos, **508 fallidos con "Spam Rate limit hit"** + 22 "Message undeliverable".
- Picos: **99 msg en un minuto** (11:12), 86 (10:57), 78 (11:04). Sostenidos 50–99/min durante ~30 min.
- Causa raíz en `send-whatsapp`:
  1. `delayMs = 400 ms` (≈150/min teórico).
  2. **No hay lock**: si la UI lanza dos drenajes en paralelo o se solapan tandas, los ritmos se suman → 99/min reales.
  3. No se detecta `"Spam Rate limit hit"` → la cola sigue empujando mensajes ya rechazados y el *quality rating* baja.

## Objetivo

Pulsar "Enviar TODA la cola" y que los ~900 mensajes salgan **el mismo día**, a un ritmo seguro que no dispare el filtro anti-spam ni bloquee el número.

## Estrategia de ritmo (todo en el día)

Con 900 envíos disponemos de varias horas; no hace falta ir a 99/min.

```text
Ritmo objetivo:   ~45 msg/min (1 cada 1.300 ms + jitter ±250 ms)
Tanda:            40 msg → pausa 10 s
Spam detectado:   pausa 90 s + reintento; si reincide → pausa 5 min;
                  si vuelve a saltar → abortar y dejar resto en `pendiente`
Lock global:      1 solo drenaje WhatsApp simultáneo (TTL 10 min)
Tiempo estimado:  900 envíos ≈ 22–25 min (mismo día, sin programar)
```

Queda por debajo de los picos que provocaron el bloqueo y respeta el tier 1.000/24h de Meta. Todos los parámetros son configurables vía body de la edge por si hay que ajustar al alza/baja según el *quality rating*.

## Cambios

### 1. `supabase/functions/send-whatsapp/index.ts`

- Defaults nuevos: `delay_ms = 1300`, `jitter_ms = 250`, `batch_size = 40`, `batch_pause_ms = 10000`.
- **Jitter** ±250 ms para no caer siempre en el mismo segundo.
- **Circuit breaker para spam**: detectar `error_message` con `/spam.*rate.*limit/i`:
  - 1ª vez en el lote → marcar ese log como `pendiente` otra vez, `sleep(90s)` y continuar.
  - 2ª vez → `sleep(5min)` y continuar.
  - 3ª vez → abortar lote; los restantes quedan `pendiente` con `metadata.wati_throttled_at`.
- Mantener el circuit breaker existente de `WATI_NO_CREDITS`.
- Respuesta incluye `throttled`, `paused_seconds_total` para diagnóstico.

### 2. Lock global de drenaje

- Tabla `whatsapp_drain_locks` (`lock_key text primary key`, `acquired_at`, `acquired_by`, `expires_at`).
- Política: `service_role` ALL; ningún acceso anon/authenticated. RLS on.
- Migración con `GRANT ALL ON public.whatsapp_drain_locks TO service_role`.
- Adquisición: `INSERT … ON CONFLICT (lock_key) DO UPDATE … WHERE expires_at < now()`.
- Liberación dentro de `finally` del `EdgeRuntime.waitUntil`.
- Si hay lock vigente → 409 `{ busy: true, until }`.

### 3. UI — `src/routes/_authenticated/comunicaciones.cola.tsx`

- Texto del botón: "Enviar TODA la cola (N) — ~45/min · ≈ X min".
- Si 409 `busy` → toast "Ya hay un envío en curso, refresca en X min" (no error rojo).
- Pequeño panel admin (colapsable) para ajustar `delay_ms`, `batch_size`, `batch_pause_ms` antes de lanzar, con valores por defecto los de arriba.

### 4. Recuperación del último lote fallido

- Acción puntual: devolver a `pendiente` los `communication_logs` de canal WhatsApp con `error_message ILIKE '%Spam Rate limit hit%'` del envío de hoy, limpiando `whatsapp_estado`, `whatsapp_failed_detail`, `wati_local_message_id`. Quedan listos para relanzarse con el ritmo nuevo.

## Recomendaciones operativas (no requieren código)

- Antes de relanzar masivo: revisar en Meta Business Manager el **messaging tier** y el **quality rating** del número. Si el rating está en *Medium/Low*, esperar 24 h antes de un envío >500.
- Mantener 1 solo envío masivo en marcha a la vez (el lock lo garantiza, pero también a nivel operativo).

## Fuera de alcance

- Programación multi-día / repartos cron (descartado: el usuario necesita el mismo día).
- Migrar al endpoint *batch* de Wati (ya descartado por fiabilidad de `localMessageId`).
