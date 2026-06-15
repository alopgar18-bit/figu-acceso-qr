
## Objetivo

Asignar zona/fila/asiento a los 65 titulares del Excel `Cadiz_Bus_17_junio.xlsx` que **ya están importados** como participantes en la sesión **Grabación 17 de junio** (`131854a7-1331-403e-9feb-d571b96379cd`). Todos van a zona **Club** con su fila/asiento del Excel.

## Pasos

1. Leer las 65 filas del Excel.
2. Localizar a cada participante en `event_participants` (filtrando por esa `session_id`) con esta prioridad:
   - Email normalizado
   - Nombre + primer apellido normalizados
   - Teléfono (últimos 9 dígitos)
3. `UPDATE event_participants SET seat_zone='Club', seat_row=..., seat_number=...` para los 65 (sin tocar al resto).
4. Audit log `seats.bulk_assign_manual` con origen `Cadiz_Bus_17_junio`.
5. Reporte final: cuántos asignados y lista de los que no se hayan podido matchear (si los hubiera) para revisión.

No se tocan acompañantes, tickets ni checkins. No se modifica código.

Confirma para ejecutar.
