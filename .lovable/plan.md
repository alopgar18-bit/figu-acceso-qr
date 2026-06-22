## Objetivo

Asignar directamente en la base de datos las columnas `seat_zone`, `seat_row`, `seat_number` para los 906 invitados (579 solicitantes + 327 acompañantes) de la sesión del 24 de junio (`59f5039a-5392-44fc-a33e-f842d8f2c7b6`), tomando los datos del Excel `total invitados.xlsx`.

Al pulsar el botón "Entrada" del email, la URL `/c/{token}/entrada` lee `seat_zone`, `seat_row`, `seat_number` directamente de BBDD, por lo que **no hay que reenviar correos**: en cuanto se actualicen los registros, el asiento aparecerá correctamente.

## Verificación del Excel

- 906 filas: 579 Solicitantes + 327 Acompañantes (cuadra exactamente con BBDD).
- 902 filas con Zona + Fila + Asiento completos.
- 4 filas sin asiento (Zona/Fila/Asiento vacíos):
  1. Dionisia María Burguillos García (solicitante) — dioniburgui@gmail.com
  2. Salvador Martín Artacho (solicitante) — salvador.m.artacho@gmail.com
  3. Benita Ruiz de Casteo (solicitante) — beniruiz1969@gmail.com
  4. Mari Carmen Ruiz De Castro Calvo (acompañante de Benita) — beniruiz1969@gmail.com

Estas 4 filas se dejarán con asiento `NULL` (no se sobrescribe nada). El resto de campos (estado, check-in, necesidades especiales) no se tocan.

## Plan de ejecución

1. **Script de matching (Python en sandbox, no toca BBDD todavía)**
   - Cargar Excel y BBDD (`event_participants` + `people` para titulares, `companions` para acompañantes), filtrando por `session_id = 59f5039a-...`.
   - Match de solicitantes: por `Nombre completo` normalizado (minúsculas, sin tildes, espacios colapsados) contra `people.first_name + ' ' + last_name`; desempate por `email`.
   - Match de acompañantes: agrupados por titular (mismo Grupo) → contra `companions` del participante titular, por nombre completo normalizado; desempate por email/teléfono.
   - Generar un informe con: filas matcheadas, filas con match ambiguo, filas sin match. Si hay ambigüedades, se resuelven uno a uno antes de continuar.

2. **Migración SQL (data update) — solo tras revisar el informe**
   - Dos `UPDATE` mediante `VALUES (...)` o tabla temporal:
     - `UPDATE event_participants SET seat_zone, seat_row, seat_number WHERE id IN (...)` (575 filas con asiento).
     - `UPDATE companions SET seat_zone, seat_row, seat_number WHERE id IN (...)` (326 filas con asiento).
   - No se tocan estados, ni tickets, ni emails, ni QR.

3. **Verificación post-update**
   - `SELECT count(*) FILTER (WHERE seat_zone IS NOT NULL)` en participants y companions de la sesión → debe dar 575 y 326.
   - Comprobar 3 URLs `/c/{token}/entrada` (titular con acompañante, titular sin acompañante, acompañante) para confirmar que el asiento aparece.

4. **Avisar al usuario** de las 4 filas que han quedado sin asiento, para que decida si las asigna manualmente más adelante.

## Lo que NO se hace

- No se reenvían emails ni WhatsApp.
- No se regeneran QR ni tickets.
- No se cambian estados de participantes.
- No se toca la UI del importador ni se crea un import_batch nuevo.

¿Confirmas para ejecutar el matching y, si no hay ambigüedades, lanzar la migración de datos?
