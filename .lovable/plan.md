## Opción A — Auditoría sin tocar participantes

### Qué se hace

1. **Nueva tabla `import_row_results`** (sólo auditoría, no afecta a `event_participants` ni `tickets`):
   - `batch_id`, `row_number`, `outcome` (`inserted` | `updated` | `skipped` | `errored`)
   - `participant_id` (FK al participante final, si lo hay)
   - `raw_row` (jsonb con la fila original del Excel)
   - `match_reason` (texto: "nombre+apellido", "dni", etc.)
   - `error_message` (si `errored`)
   - RLS: lectura para admins y asignados al evento del batch.

2. **Actualizar `src/lib/imports.functions.ts`**:
   - En cada fila procesada (insert, update, skip, error) insertar una fila en `import_row_results` con el resultado y el `participant_id` resultante.
   - **No se cambia ninguna lógica de negocio existente** sobre participantes/tickets. Sólo se añade el log.

3. **Nueva ruta `/importaciones/$batchId`** (detalle de importación):
   - KPIs arriba: total filas, nuevos, actualizados, omitidos, errores.
   - Tabla con todas las filas: nº fila, nombre, outcome, motivo, enlace al participante.
   - Filtro por outcome (ver sólo "actualizados", sólo "errores", etc.).
   - Botón "Exportar a Excel".
   - Enlace desde la lista `/importaciones` (columna nueva "Ver detalle").

4. **Backfill puntual para la sesión del 30 de junio** (sólo lectura cruzada, ningún UPDATE sobre `event_participants` ni `tickets`):
   - Releer el Excel `bUS_Cazalla_30 junio.xlsx` desde el storage del batch `8c648d92…`.
   - Para cada fila, buscar el participante existente en la sesión por `nombre+apellido` (misma regla que usó el importador).
   - Insertar las 137 filas en `import_row_results` con el `participant_id` correspondiente y outcome (`updated` para los 14 ya existentes, `inserted` para los 123 nuevos).
   - **Resultado visible**: al abrir `/importaciones/8c648d92…` verás los 14 nombres exactos marcados como "actualizado", con enlace a su ficha en la sesión del 30.

### Qué NO cambia

- Las 504 entradas de la sesión del 30 quedan intactas.
- Ningún `qr_token`, `confirmation_token`, `participant_id`, `session_id` ni `status` se modifica.
- No se reenvía ninguna comunicación.
- Los participantes siguen apuntando al `import_batch_id` que tienen ahora (la columna no se toca).

### Detalle técnico

- Migración: `CREATE TABLE public.import_row_results` con GRANT a `authenticated`/`service_role` y RLS reutilizando `has_event_assignment` / `is_admin`.
- Server function nueva: `getImportBatchDetail({ batchId })` en `src/lib/imports.functions.ts` que devuelve KPIs + filas.
- Server function nueva: `backfillBatchRowResults({ batchId })` (admin-only) que rellena las filas del batch leyendo el Excel del storage.
- UI: `src/routes/_authenticated/importaciones.$batchId.tsx` (tabla con TanStack Query) + botón "Exportar Excel" usando `xlsx`.
- Enlace nuevo en `src/routes/_authenticated/importaciones.tsx` por cada batch.

### Orden de ejecución

1. Migración `import_row_results`.
2. Modificar `imports.functions.ts` para registrar las nuevas importaciones.
3. Crear ruta de detalle + export.
4. Ejecutar `backfillBatchRowResults` para el batch `8c648d92…` y verificar los 14 actualizados.
