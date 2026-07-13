## Objetivo

Reparar el lote `5f5e1821-6dcd-4d1c-9521-215902cc8c51` (y cualquier otro ya importado) sin re-subir el Excel, para que:
- Los 47 registros que se fusionaron por email/teléfono queden recuperados como participaciones independientes cuando corresponda.
- Todos los participantes del lote tengan QR si su estado lo permite.
- Aparezcan íntegramente en “Envío masivo” filtrando por `import_batch_id`.

## Alcance

Solo backend de importación + UI de lotes. No se toca formulario público, comunicaciones ni control de acceso.

## Cambios

### 1. Nueva server function `repairImportBatch(batchId)` en `src/lib/imports.functions.ts`

Para el lote indicado:

1. Cargar `import_row_results` originales del lote (payload de cada fila del Excel).
2. Cargar roster actual de la sesión y construir índice `nameKey → person_id` (mismas reglas actuales: nombre+apellido normalizados, DNI normalizado sin guiones).
3. Para cada fila del Excel:
   - **Si la fila ya está correctamente vinculada** a un participante cuyo nombre+apellido coincide → asegurar `import_batch_id = batchId` en `event_participants` y llamar `maybeGenerateTicketFor` si el estado lo permite y no tiene ticket.
   - **Si la fila fue absorbida por otro participante con distinto nombre** (colisión por email/teléfono en el algoritmo antiguo) → aplicar el flujo nuevo:
     - Buscar/crear persona por DNI o crear nueva (con sufijo VIS si colisiona nombre+apellido en la sesión).
     - Insertar participación en la sesión con estado del Excel, respetando la regla de no-degradación si ya existiera.
     - Etiquetar con `import_batch_id`, generar QR si procede.
4. Devolver resumen: `{ recovered, ticketsCreated, tagged, skipped }` y registrar en `audit_logs` (`import_batch.repair`).

Idempotente: repetible sin efectos secundarios.

### 2. UI en `src/routes/_authenticated/importaciones.$batchId.tsx` (o listado de lotes)

- Botón “Reparar lote” con `dangerous-action-dialog` explicando qué hará.
- Al terminar, mostrar toast con el resumen y refrescar la vista.

### 3. Verificación

Tras ejecutarlo sobre el lote `5f5e…`:
- Contar filas del lote en `event_participants` → debe ser 382.
- Contar tickets emitidos para esos participantes → debe cubrir todos los estados con derecho a entrada.
- Abrir “Envío masivo” filtrado por ese lote → total esperado 382 (o el número real con entrada).

## Detalles técnicos

- Reutiliza helpers existentes: `nameKey`, `normDniLocal`, `insertNewPerson`, `insertParticipationFor`, `maybeGenerateTicketFor`, `rank()` para no-degradación.
- No borra participantes existentes; solo añade los que faltan y re-etiqueta.
- Respeta la regla del proyecto: dedupe SOLO por nombre+apellido / DNI, nunca por email/teléfono.
- Sin cambios de esquema, sin migraciones.
