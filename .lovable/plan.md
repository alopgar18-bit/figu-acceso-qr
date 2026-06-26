# Mejoras UX masivas: progreso, envío sin esperas y "ver todos"

## 1. Barra de progreso en procesos masivos

Hoy los procesos largos (importaciones, creación de cola, envío) sólo muestran un spinner o un toast al final. Se añade una barra de progreso real con `Progress` (ya disponible en `src/components/ui/progress.tsx`) y contador `N / total`.

### a) Creación de cola (`comunicaciones.envio.tsx` · `handleQueue`)
- Estado nuevo: `queueProgress = { current, total, queued, skipped }`.
- Antes del bucle `for (const part of chunks)`, fijar `total = chunks.length`.
- Tras cada `await queueFn(...)`, incrementar `current` y acumular contadores parciales.
- Render bajo el botón "Crear cola": tarjeta con `Progress value={current/total*100}`, texto `Lote {current} de {total} · {queued} encolados · {skipped} omitidos` y botón "Cancelar" que setea `cancelRef.current = true` (se chequea entre chunks).
- Al terminar, mantener la tarjeta 10 s con resumen final para que el usuario vea totales.

### b) Importaciones (`importaciones.$batchId.tsx`)
- Añadir polling cada 2 s mientras `status === "procesando"` para releer `imported_rows / total_rows` y pintar `Progress`.
- Mostrar `current/total` y porcentaje. Cuando pase a `completada`, parar polling.

### c) Envío/cola de envío (`comunicaciones.cola.tsx`)
- Ya hay polling cada 2.5 s (`pollBatchProgress`). Reutilizarlo para pintar una barra de progreso global por lote (enviados / total) además del estado por mensaje. Añadir tarjeta de "Progreso del envío en curso" arriba de la tabla.

### d) Asignación masiva, correcciones, importación de butacas
- Mismo patrón: estado `{current,total}` + `<Progress>` en los diálogos `apply-seat-corrections-dialog.tsx`, `seat-import-dialog.tsx`, `sesiones.$sessionId.asignacion.tsx`.

## 2. Envío masivo en lotes automáticos (sin clic por lote)

Hoy en `handleQueue` el usuario debe pulsar "Crear cola" y esperar; el servidor procesa en lotes internos. Falta automatizar el "siguiente lote" para que el operador no tenga que volver.

Cambios:
- Nuevo toggle **"Envío automático en lotes"** en el bloque 5 (por defecto ON cuando hay > 1 chunk).
- Campo numérico **Tamaño de lote** (default 500; min 50; max 2000).
- Campo **Pausa entre lotes (s)** (default 2; min 0; max 60) — útil si Wati / SMTP marca rate-limit.
- `handleQueue` itera todos los chunks sin esperar input adicional, llamando a `queueFn` y, entre llamadas, `await new Promise(r => setTimeout(r, pauseMs*1000))`.
- Mientras tanto, la tarjeta de progreso (sección 1a) sigue viva: lote X/Y, barras, ETA estimado (`(remaining*lastLatency)`), botón "Pausar"/"Reanudar" y "Cancelar".
- Si el operador cierra la pestaña, queda persistida en `localStorage` (`comm_bulk_progress_<batchId>`) para retomar visual al volver; los lotes ya encolados quedan en BBDD por `queueFn` (no se pierden).
- Estado intermedio se conserva en query keys para que `sentQ.refetch()` se ejecute al final de cada lote y el panel "Ya enviados" se actualice en vivo.

## 3. Opción "Ver todos" en pantallas con tope de 500

Donde hoy mostramos sólo los primeros 500 con aviso "Mostrando los primeros 500 de N":

- `comunicaciones.envio.tsx` (línea 863-897): añadir botón **"Ver todos (N)"** junto al aviso. Al pulsar, `setShowAll(true)` y se renderizan todos. Toast advirtiendo "Renderizar todos puede ralentizar el navegador".
- `importaciones.nueva.tsx` errores (línea 735, `slice(0,100)`): mismo patrón, botón "Ver todos los errores".
- Auditar y aplicar también en:
  - `importaciones.$batchId.tsx` (filas de auditoría)
  - `solicitudes.tsx` (si tiene tope; revisar y añadir si aplica)
  - `personas.tsx`
  - `comunicaciones.cola.tsx` tabla de logs.
- Implementación común: hook utilitario `useShowAll(initial=500)` que devuelve `{visible, showAll, toggle}` para no duplicar lógica.

## Detalles técnicos

- Componente nuevo `src/components/bulk-progress-card.tsx` reutilizable: props `{ title, current, total, stats?, onCancel?, onPause? }`. Renderiza `Progress`, contador y botones.
- Hook nuevo `src/hooks/use-bulk-progress.ts` con estado `{current,total,paused,cancelled}` y helpers `bump()`, `cancel()`, `pause()`, `resume()`.
- Hook nuevo `src/hooks/use-show-all.ts` para el patrón de "ver todos".
- `queueBulkInvitations` (backend) no requiere cambios; se sigue troceando en cliente.
- Persistencia mínima en `localStorage` para retomar visualmente; nada de tablas nuevas en BBDD.
- Tests visuales: revisar `comunicaciones.envio`, `importaciones.nueva`, `importaciones.$batchId`, `comunicaciones.cola`, `sesiones.$sessionId.asignacion`.

## Resultado esperado

- Cada acción masiva muestra en pantalla "Lote X de Y · 1.234 / 4.776" con barra de progreso, ETA y botón Cancelar.
- En envíos, basta un clic para procesar todos los lotes; la app encadena lotes con la pausa configurada.
- En cualquier listado con tope, un botón "Ver todos (N)" deja inspeccionar el dataset completo bajo el propio control del operador.
