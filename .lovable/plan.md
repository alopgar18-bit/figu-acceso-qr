## Objetivo
Aplicar urgentemente las asignaciones de zona/fila/asiento del Excel `informe-el-perro-andaluz...` directamente en la base de datos, para la sesión **Grabación 17 de junio** del evento **EL PERRO ANDALUZ by Manu Sánchez**, antes de seguir mejorando el importador.

## Lo que voy a hacer

1. **Borrar las asignaciones actuales** de esa sesión:
   - `seat_zone / seat_row / seat_number = NULL` en `event_participants` de la sesión (440 titulares).
   - Lo mismo en `companions` cuyos titulares pertenezcan a esa sesión.

2. **Aplicar las asignaciones del Excel** (hoja `Detalle`, 890 filas / 358 grupos):
   - **Titulares (`Rol = Solicitante`)**: localizar el participante por `session_id` + `email` + nombre+apellidos (normalizados, sin tildes y en minúsculas), y actualizar `seat_zone / seat_row / seat_number`.
   - **Acompañantes (`Rol = Acompañante`)**: localizar el titular del grupo igual que arriba (usando la columna `Solicitante (titular)`), y dentro de sus `companions` localizar el acompañante por nombre+apellidos, actualizando sus asientos.

3. **Caso ambiguo conocido**: en el Excel `mariloriasco@gmail.com` aparece como titular en 2 grupos distintos pero en la BBDD solo hay 1 participante con ese email en la sesión. Asignaré los asientos del primer grupo y dejaré aviso del segundo en el informe final. (Si prefieres otra regla, dímelo).

4. **Informe al terminar**: número de titulares actualizados, acompañantes actualizados y lista de filas no encontradas (si las hay) para que decidas cómo tratarlas.

## Notas técnicas
- No toco ni `tickets`, ni `check-ins`, ni estados; solo los 3 campos de asiento.
- Se queda registrado en `audit_logs` con acción `seats.bulk_assign_manual` indicando evento, sesión y totales.
- No modifico el importador en este paso (lo dejamos para iterar después con calma).

Confírmame y lo ejecuto.