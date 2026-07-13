## Problema

Tras importar 382 filas: 256 nuevas → con QR, pero 126 "actualizadas" no reciben QR aunque su estado final sea con entrada (aceptado/enviado/confirmado). Al abrir "Ver solicitudes" o "Envío masivo" no aparecen para envío porque no tienen ticket.

Causa: `maybeGenerateTicketFor(...)` solo se llama cuando `insertParticipationFor` inserta una participación nueva. Cuando reutiliza una participación existente (bloques update / create_here / create_new / legado / carrera 23505), se salta la generación de QR aunque la persona no tenga ticket.

## Solución

Garantizar QR para toda fila importada cuyo estado final sea "con entrada", incluso si la participación ya existía y solo se actualiza. La función `maybeGenerateTicketFor` ya evita duplicados (busca ticket previo), así que llamarla siempre es seguro.

### Cambios en `src/lib/imports.functions.ts`

1. **Rama "update" manual (≈ línea 570-606)**: tras el `update` a `event_participants`, si el `finalStatus` (aplicando no-degradación) está en `QR_STATES` y no hay ticket, llamar a `maybeGenerateTicketFor(match.participantId, finalStatus, row)`. Hoy solo actualiza campos y no toca tickets.

2. **Rama "create_here" con `part.reused`** (línea 611-614): añadir `await maybeGenerateTicketFor(part.id, part.status, row);` antes del `logRow`.

3. **Rama "create_new" con `part.reused`** (línea 660-664): mismo añadido.

4. **Rama legado (no acción manual)**: revisar las llamadas a `insertParticipationFor` y añadir `maybeGenerateTicketFor` también cuando reutilice, con el mismo patrón.

5. **KPI "Actualizadas"**: el contador `updated++` se mantiene igual, pero el marcador de la fila (`logRow`) pasa a incluir "· QR generado" cuando corresponda, para que en la auditoría se vea que se emitió ticket sobre una participación previa.

6. **Contador `qrGenerated`**: ya se incrementa dentro de `maybeGenerateTicketFor`, así el cuadro "QR GENERADOS" del resumen final subirá para reflejar todos los QR (nuevos + reemitidos sobre actualizadas). No hace falta tocar la UI del resumen.

### Sin cambios necesarios

- Lista de solicitudes y "Envío masivo": ya listan por `import_batch_id` y filtran por presencia de ticket; en cuanto se generen los QR, aparecerán automáticamente.
- Regla de no-degradación: intacta. Nunca se sobrescribe un estado superior ni un ticket existente.
- `create_bis`: ya llama a `maybeGenerateTicketFor`.

## Verificación tras aplicar

1. Repetir la importación del Excel del 15 de julio.
2. Comprobar en el resumen que `QR GENERADOS ≈ 256 + N` (donde N son las 126 actualizadas cuyo estado sea con entrada y no tuvieran ticket).
3. En "Envío masivo" filtrando por ese lote deben aparecer todas las personas del Excel con entrada, no solo las 256 nuevas.
