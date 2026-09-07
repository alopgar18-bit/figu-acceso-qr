# Revisión de asientos del 9 de septiembre y errores del envío

## Qué he comprobado (datos reales de hoy)

Sesión "Grabación 9 de septiembre" (642 solicitudes procedentes de 4 importaciones: 446 + 89 + 55 + 52):

- **622 personas aceptadas pendientes de envío → las 622 tienen zona, fila y asiento.** Ninguna importación se quedó sin asiento.
- 68 en pendiente de revisión (sin asiento, es lo normal).
- **20 personas se han dado de baja ellas mismas hoy**, entre las 17:48 y las 18:54 (hora española), usando el enlace de cancelación. Al cancelar, el sistema libera su butaca automáticamente (lo activamos la semana pasada) y queda registrada en "Butacas liberadas".

Las 9 filas de tu Excel que fallaron en el envío coinciden exactamente con esas bajas:
Alfonso José Marín, Lydia Bonete, Estela Toribio, Pilar Megías, Adelina Estero, Silvia Morales, Carlos González y Alberto Moguer se habían dado de baja **antes** de lanzar la cola, por eso el envío dice "pendiente_asiento" (ya no tenían butaca).

La única excepción es **María González Fernández**: sigue activa y con butaca (Platea puerta 3, fila 26, asiento 2), pero su teléfono está mal escrito (6789805936, tiene un dígito de más) y por eso salió "telefono_invalido".

Conclusión: no hay ningún fallo de importación de asientos. Lo que falla es que la cola trata las bajas como errores y no lo dice con claridad.

## Qué propongo cambiar

1. **No enviar ni marcar como error a quien se ha dado de baja.**
   Antes de enviar, si la persona está cancelada o rechazada, el mensaje se marca como "cancelado" (no "Error") con el texto "el asistente se dio de baja". Así la pantalla de cola deja de mostrar errores rojos que no son problemas reales.

2. **Mensajes de error en español y comprensibles** en la lista de comunicaciones:
   - "pendiente_asiento" → "Sin butaca asignada"
   - "telefono_invalido" → "Teléfono no válido"
   - "sin_confirmation_token" → "Falta enlace de entrada"
   - "participante_no_encontrado" → "Solicitud no encontrada"

3. **Aviso antes de encolar**: al preparar un envío se comprobará cuántos destinatarios están sin butaca, con teléfono no válido o dados de baja, y se mostrará un resumen para corregirlos antes de lanzar la cola.

4. **Comprobación rápida por sesión**: botón "Revisar asientos" en la sesión que lista, en pantalla y en Excel, quién está aceptado sin zona/fila/asiento (ahora mismo daría cero) y quién tiene teléfono no válido.

5. **Corregir el teléfono de María González** para que reciba su entrada, y opción de reenvío a los que fallaron por causas subsanables.

## Nota

Las 20 butacas que han quedado libres por las bajas de hoy están disponibles en el informe → "Butacas liberadas (Excel)" para reasignarlas a nuevos invitados.

## Detalle técnico

- `supabase/functions/send-whatsapp/index.ts` (y equivalente en `send-email`): cargar el estado del participante junto con la butaca; si el estado está en el conjunto de cancelados/rechazados, actualizar el log a `status='cancelado'` con `error_message='asistente_dado_de_baja'` en lugar de `fallido`.
- Nuevo mapa de etiquetas en `src/lib/communication-constants.ts` y uso en `src/routes/_authenticated/comunicaciones.cola.tsx` y `comm-log-detail-dialog.tsx`.
- Precomprobación en `src/lib/bulk-send.functions.ts` que devuelve conteos (sin butaca / teléfono no válido / dados de baja) mostrados en `send-communication-dialog.tsx`.
- Nueva exportación de auditoría de asientos reutilizando el patrón de `src/lib/released-seats-export.ts`, enlazada desde la página de sesión.
