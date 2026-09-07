# Distinguir "aprobados" y "confirmados" en el informe

## Por qué salen iguales hoy

Los dos KPIs se calculan sobre casi la misma lista de estados. "Aprobados" incluye aprobado, aceptado pendiente de envío, invitación enviada, pendiente de confirmación, confirmado, QR generado y acceso validado. "Confirmados" incluye esos mismos salvo "aprobado". Como en la práctica nadie se queda en "aprobado", el número coincide.

Además, cuando alguien se da de baja su estado pasa a cancelado, así que las bajas ya desaparecen de los dos contadores: por eso los 35 cancelados no restan de ninguno.

## Cómo quedarán

- **Total aprobados (personas)**: todas las personas aceptadas para asistir, incluidas las que después se dieron de baja o fueron canceladas. Es el total de plazas concedidas en la sesión.
- **Total confirmados (personas)**: los aprobados menos las bajas (cancelado por asistente, cancelado por FIGURARTE, rechazado y bloqueado). Es el número de personas que se espera en la sala.
- **Cancelaciones (personas)**: se mantiene, y ahora cuadra exactamente la resta: aprobados − cancelaciones = confirmados.

Con los datos de tu captura: 607 confirmados + 35 cancelaciones = 642 aprobados.

Bajo cada cifra se añadirá una línea corta explicando el criterio, para que no vuelva a haber dudas.

## Alcance

Se aplica a las pestañas Previo, Tiempo real, Final y Por sesión del informe, y a la exportación a Excel del informe, para que las columnas y los totales usen el mismo criterio.

No se toca ningún estado del participante ni ningún flujo de envío: solo cambia cómo se cuentan estas dos cifras.

## Detalle técnico

- `src/lib/use-reports.ts`:
  - Nueva lista `ACCEPTED_EVER` = APPROVED_LIKE + los estados de baja que provienen de una aceptación previa (`cancelado_asistente`, `cancelado_figurarte`, `no_presentado`, `incidencia`), usada para `aprobados` / `personasAprobados`.
  - Para identificar bajas que antes estaban aceptadas se usa la existencia de butaca liberada en `released_seats` o de ticket emitido; si no hay evidencia, la baja no suma a aprobados (evita contar rechazos de solicitudes nunca aceptadas).
  - `CONFIRMED_LIKE` pasa a ser `ACCEPTED_EVER` menos los estados de baja, de modo que confirmados = aprobados − cancelados por construcción.
  - `ocupacion` sigue usando `personasConfirmadas`.
- `src/routes/_authenticated/informes.$eventId.tsx`: añadir subtítulo descriptivo en las tarjetas `Total aprobados` y `Total confirmados`, y revisar la tabla por sesión.
- Revisar que la exportación Excel del informe reutiliza los mismos contadores.
