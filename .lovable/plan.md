## Estado actual del envío (ahora mismo)

He revisado la base de datos del envío que dejaste corriendo:

- **Lock de drain activo** desde 21:13 (válido hasta 21:43) → la cola sigue "tomada" por un worker.
- **86 enviados OK** en los últimos minutos (ritmo ~25/min).
- **95 pendientes** todavía en cola.
- **Último envío real: 21:20** → llevamos ~7 min sin movimiento, lo que sugiere que el worker se ha parado (probable pausa anti-spam o el navegador cerrado cortó el trigger que reanuda el lote).

Por eso al volver a entrar no ves nada claro: la UI actual no muestra ni el lock, ni el último envío, ni si el drain sigue vivo.

## Lo que voy a hacer

### 1. Panel "Estado del envío masivo" en `/comunicaciones/cola`

Banner fijo arriba con, en tiempo real (refresco cada 5 s):

- 🟢 Activo / 🟡 Pausado / 🔴 Parado, según el lock (`whatsapp_drain_locks`) y el tiempo desde el último `sent_at`.
- Pendientes / enviados / fallidos del lote en curso (últimas 2 h).
- Hora del último envío y "hace X min/seg".
- Ritmo (msg/min) y ETA estimada.
- Si el lock está vivo pero >3 min sin envíos → aviso "El worker parece detenido. Pulsa Reanudar".

### 2. Botón "Reanudar cola"

Llama de nuevo a `send-whatsapp` en modo drain para retomar los pendientes sin tener que hacer nada manual. Idempotente: si el lock ya está libre, lo coge; si está vivo y activo, no hace nada.

### 3. Botón "Liberar lock"

Para el caso (raro) de que un lock antiguo siga vivo pero el worker esté muerto: borra el lock para poder relanzar limpio.

### 4. Persistencia del progreso (acción inmediata, sin esperar a la UI)

Ahora mismo te reanudo yo la cola para que terminen los 95 pendientes que quedan de tu envío, y te paso el conteo final.

## Detalle técnico

- Nuevo componente `WhatsappQueueStatusBanner` en `src/components/`.
- Server fn `getWhatsappQueueStatus` en `src/lib/wati.functions.ts`: lee `whatsapp_drain_locks` + agrega `communication_logs` (channel `whatsapp_business`, ventana 2 h).
- Server fn `resumeWhatsappQueue`: invoca `send-whatsapp` (acción drain) con `supabase.functions.invoke`.
- Server fn `releaseWhatsappLock`: borra fila de `whatsapp_drain_locks` (sólo admin).
- Integración en `src/routes/_authenticated/comunicaciones.cola.tsx` justo debajo de la cabecera, junto al botón "Probar conexión Wati" existente.

¿Lo lanzo así y de paso te reanudo ya los 95 pendientes?
