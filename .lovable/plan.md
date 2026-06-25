## Problema

El lote del 30 jun dice `updated=14`, pero sólo 123 participaciones están etiquetadas con ese `import_batch_id` en la sesión (137 filas – 14 = 123). Esos 14 "actualizados" no aparecen en la sesión y la auditoría no los muestra porque tiene dos limitaciones:

1. **Sólo busca dentro de la sesión actual.** Si la persona quedó en otra sesión del mismo evento (o sin re-etiquetar tras un fallo de UPDATE silencioso), la fila aparece como "errored / no encontrado".
2. **No distingue insertado vs actualizado a posteriori.** Hoy se basa en `import_batch_id == batchId`, pero el commit original re-etiqueta a los actualizados con el mismo batch → todos parecen "inserted" al re-auditar.

## Solución (sólo auditoría, sin tocar participantes ni QR)

Reescribir `backfillBatchRowResults` para que, por cada fila del Excel, haga un diagnóstico amplio y guarde el resultado real:

### Lógica nueva por fila

1. Normalizar `first_name + last_name` (igual que el commit).
2. Buscar en `event_participants` del **evento completo** todas las participaciones cuya persona case por nombre+apellido. Para desempatar usar también email/teléfono/DNI si el Excel los trae.
3. Cruzar con el batch original usando dos señales nuevas:
   - `participant.created_at` vs `batch.created_at..completed_at` → si la participación nació dentro de la ventana del batch ⇒ **inserted**; si es anterior ⇒ **updated**.
   - `participant.import_batch_id == batchId` como confirmación secundaria.
4. Clasificar cada fila en uno de estos `outcome` (ampliamos el enum si hace falta, o lo metemos en `match_reason`):
   - `inserted_in_session` — creada por este batch en la sesión correcta.
   - `updated_in_session` — ya existía en la sesión y fue re-etiquetada.
   - `updated_in_other_session` — la persona existía en **otra** sesión del evento; el commit la contó como "updated" pero no la movió → **éstas son las 14 perdidas**.
   - `person_exists_no_participation` — la persona existe pero no tiene participación en ninguna sesión del evento.
   - `not_found` — ni persona ni participación coinciden.
   - `errored` — error real registrado.
5. Guardar en `match_reason` el detalle legible (sesión donde quedó, batch que la creó, fecha) y en `participant_id` el id real para poder enlazar.

### Migración mínima

- Permitir los nuevos valores en `outcome` (ya es `text`, basta con no usar enum; si hay CHECK, lo ampliamos).
- Sin cambios en `event_participants` ni `tickets`.

### UI (`/importaciones/$batchId`)

- Añadir tarjetas-resumen con los seis estados nuevos.
- Filtro por estado con foco automático en `updated_in_other_session` (las 14 que el usuario busca).
- Cada fila enlaza a la ficha de la persona/participación allá donde realmente esté (sesión + lote de origen), para poder decidir si moverla a la sesión del 30 jun manualmente.
- Botón "Exportar a Excel" del resultado completo para que el usuario tenga el listado fuera de la app.

### Flujo para el usuario

1. Abrir `/importaciones/8c648d92-484f-4b38-a1c9-a9dcfc7f4bba`.
2. Pulsar "Re-cargar auditoría" y soltar `bUS_Cazalla_30 junio.xlsx`.
3. La tabla mostrará las 14 con estado `updated_in_other_session`, indicando en qué sesión están y desde qué importación, sin reenviar entradas ni regenerar QR.

### Fuera de alcance (lo dejamos para después)

- Mover automáticamente esas 14 a la sesión del 30 jun (acción manual posterior, decidida fila a fila desde la auditoría).
- Cambiar la lógica del commit para que el `updated` real fuerce la sesión correcta (lo planteamos cuando rehagamos el módulo de importaciones).