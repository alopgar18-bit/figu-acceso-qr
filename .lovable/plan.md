## Diagnóstico

El lote `BBdd_afor completo_envio.xlsx` (4.932 filas, sesión Grabación 30 jun) **sí terminó de procesar en BD** pero el `update` final de estado nunca llegó (timeout del worker). Datos reales:

- Participantes creados y vinculados al lote: **4.776**
- Participantes totales en la sesión: **5.268** (supera el límite de 5.000 del envío masivo)
- `imported_rows` en el lote: 0 · `status`: `procesando` (incorrecto)
- Tag de origen de las personas: **"Aforo completo"** (lo escribió el campo `source` del lote), pero el filtro de Comunicaciones busca exactamente `import:BBdd_afor completo_envio.xlsx`

Por eso "Enviar invitaciones a esta importación" abre Comunicaciones con **0 destinatarios**: el filtro nunca coincide. Y aunque coincidiera, el `limit(5000)` se quedaría corto para la sesión completa.

## Cambios

### 1. Desbloquear el lote (SQL, una sola vez)
- `import_batches`: marcar `status = 'completado'`, `imported_rows = 4776`, `error_rows = 0`, `completed_at = now()`.
- No se tocan participantes, personas ni QR.

### 2. Arreglar el filtro de "Enviar a esta importación"
`src/routes/_authenticated/comunicaciones.envio.tsx`:
- Sustituir el filtro frágil `people.source === "import:<filename>"` por un filtro directo sobre `event_participants.import_batch_id = batchId`.
- Así no depende del texto que se haya puesto en "Origen" al importar y funciona para este lote y para los futuros.

### 3. Cargar más de 5.000 destinatarios
Mismo archivo:
- Paginar la consulta de `event_participants` en bloques de 1.000 (range(0,999), (1000,1999)…) hasta agotar, en lugar de un único `limit(5000)`.
- Aplica tanto al envío por sesión completa (5.268) como al envío por lote.

### 4. Reconstruir auditoría del lote (opcional, manual)
- Abrir `/importaciones/1363116a-…/` y pulsar **"Subir Excel original"** con `BBdd_afor completo_envio.xlsx` para rellenar `import_row_results` (nuevos / actualizados en la sesión / en otra sesión / sin participación / no encontrados). No toca participantes ni QR; sólo audita.

### 5. Prevenir futuros "procesando" colgados (diferido, no entra hoy)
Plan para ejecutar tras el envío del 30 jun:
- Convertir `processImportBatch` al patrón asíncrono: responder `202 Accepted` al cliente, procesar en `EdgeRuntime.waitUntil`, ir actualizando `import_batches.status` (`procesando` → `completado` / `fallido`) por bloques de N filas con `completed_at` y `imported_rows` acumulados.
- UI: badge `procesando` con polling cada 5 s y barra de progreso real (`imported_rows / total_rows`).
- Reanudación: si un lote lleva > 10 min en `procesando` sin avance, botón "Reanudar / marcar completado con lo importado".

## Detalles técnicos

- Migración SQL exacta:
  ```sql
  UPDATE public.import_batches
     SET status = 'completado',
         imported_rows = 4776,
         error_rows = 0,
         completed_at = now()
   WHERE id = '1363116a-5bc6-4eff-8cc6-40c58d3ae2b4'
     AND status = 'procesando';
  ```
- Filtro nuevo en la query `bulk_participants`:
  ```ts
  if (batchId) q = q.eq("import_batch_id", batchId);
  else q = q.eq("event_id", eventId!).eq("session_id", sessionId!);
  ```
  y se elimina el post-filtro por `people.source`.
- Paginación:
  ```ts
  const pageSize = 1000;
  let from = 0; const all: PartRow[] = [];
  for (;;) {
    const { data, error } = await base.range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data as PartRow[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  ```

## Resultado esperado

- El lote pasa a `completado` con 4.776 importadas.
- Al pulsar "Enviar invitaciones a esta importación" aparecen los 4.776 destinatarios del Excel, listos para enviar la plantilla `entrada_grabacin` / aforo completo.
- El envío masivo por sesión también puede cargar los 5.268 sin recortar.
- Queda pendiente para después del 30 jun convertir el importador al patrón asíncrono con progreso real.
