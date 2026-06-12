
## Resumen
Cuatro mejoras post-primera-sesión enfocadas en tratar a los acompañantes como personas con asiento propio: emails con un QR por acompañante (con nombre/apellido + asiento si lo hay), búsqueda en validación que también encuentre acompañantes, exportación Excel con jerarquía titular → acompañantes, e importación de asientos que cubra titular y acompañantes. Asiento es opcional: nunca bloquea envíos.

---

## 1) Email del titular con un QR por acompañante (nombre, apellido, asiento opcional, enlace)

Se respeta el modo configurado en cada sesión (`companions_qr_mode`: `qr_propio` = un QR por persona; `grupo` = un solo QR colectivo). No se cambia ese desplegable.

**Base de datos** (una sola migración)
- `companions`: añadir `seat_zone text`, `seat_row text`, `seat_number text` (todos opcionales).
- `tickets`: añadir `companion_id uuid null` con FK a `companions(id) on delete set null`, y sustituir la restricción `tickets_participant_id_key` (UNIQUE) por un índice no único `idx_tickets_participant` para permitir varios tickets por participante en modo `qr_propio` (es lo que el código ya intenta hacer hoy).
- Sin cambios de RLS.

**Generación de tickets** (`src/lib/confirmation.functions.ts`)
- En modo `qr_propio`: al crear los tickets de acompañante, escribir `companion_id` en orden con la lista de `companions` del participante.
- En modo `grupo`: sin cambios (un único QR para el titular).

**Email del titular** (`src/lib/bulk-send.functions.ts` + plantillas)
- Cargar para cada participante: ticket(s) + filas de `companions` (nombre, apellido, asiento si existe).
- Modo `qr_propio`: incluir en el cuerpo una lista de “Acompañantes” con:
  `Nombre Apellido — [Zona · Fila · Asiento si hay] — [Ver entrada]` (enlace público al QR individual: `/c/<qr_token>/entrada`, ya existente).
- Modo `grupo`: comportamiento actual (un QR del titular que incluye al grupo); la lista de acompañantes sigue apareciendo en el cuerpo con nombre y asiento si lo hay, pero sin enlace individual.
- Asiento es opcional: si no hay zona/fila/asiento se omite ese tramo, **nunca bloquea el envío**.
- Variables nuevas para plantillas: `{{companions_list_html}}` y `{{companions_list_text}}`. Plantillas que no las usen siguen funcionando.

---

## 2) Búsqueda en validación incluye acompañantes + color por zona

**Backend** (`src/lib/access.functions.ts`)
- `searchSessionParticipants`: añadir consulta paralela a `companions` (filtrando por sesión vía `event_participants`) por nombre/apellido/dni/email/teléfono. Devolver filas unificadas con `match: "titular" | "acompanante"` y, para acompañantes, el nombre del titular para contexto.
- `validateQr`: el resultado ya incluye el ticket; añadir en la respuesta `seat: { zone, row, number } | null` resuelto desde:
  - `companions.seat_*` si el ticket tiene `companion_id`.
  - `event_participants.seat_*` si es el ticket del titular.

**UI** (`src/routes/_authenticated/control-acceso.$sessionId.tsx`)
- Lista de resultados: etiqueta “Acompañante de …” cuando aplique. Al pulsar, abre la ficha del titular y resalta el acompañante.
- Tras validar un QR: mostrar un bloque grande con la **zona en color**:
  - “VIP” → verde
  - “Público” → azul
  - Resto de zonas → color neutro
  - Mapeo zona→color en `src/lib/event-constants.ts` (case-insensitive, normaliza acentos). Sin zona = no se muestra el bloque (no es bloqueante).
- Si hay fila/asiento, se muestran debajo en texto normal.

---

## 3) Excel de asistentes / solicitudes (una sola pestaña, jerárquico)

**Backend** nueva server fn `exportAttendeesXlsx` en `src/lib/report-export.ts`:
- Input: `event_id`, opcional `session_id`, modo (`asistentes` = estados confirmados/QR/validado; `solicitudes` = todos).
- Genera `.xlsx` con `exceljs` (compatible con Worker; añadir dependencia) y devuelve base64 que el cliente descarga como Blob.
- **Una sola pestaña** con columnas: Tipo (Titular/Acompañante), Titular asociado, Nombre, Apellidos, DNI, Email, Teléfono, Sesión, Estado, Zona, Fila, Asiento, Check-in (sí/no), Fecha check-in.
- Orden: por titular; debajo de cada titular sus acompañantes en filas con sangría visual (columna “Tipo” = “— Acompañante”).

**UI** (`src/routes/_authenticated/informes.$eventId.tsx`)
- Botones “Descargar asistentes (Excel)” y “Descargar solicitudes (Excel)”.

---

## 4) Importador de asientos cubre titular y acompañantes

**Backend** (`src/lib/seats.functions.ts` → `bulkAssignSeats`)
- Ampliar `rowSchema` con `tipo` opcional (`titular` | `acompanante`) y permitir identificar acompañantes por su propio `email` o `dni`.
- Resolución por fila:
  - Si email/dni coincide con un acompañante (o `tipo=acompanante`) → actualizar `companions.seat_*`.
  - Si coincide con titular → actualizar `event_participants.seat_*` (como hoy).
- Devolver desglose `{ updated_titulares, updated_acompanantes, skipped, errors }`.
- Si el evento aún no tiene zonas/asientos importados, los envíos siguen funcionando igual (no es requisito).

**UI** (`src/components/seat-import-dialog.tsx`)
- Aceptar cabecera opcional `tipo` (titular/acompañante) en el CSV.
- Texto de ayuda: “Identifica acompañantes por su email/DNI o añadiendo la columna `tipo`”.
- Mostrar el desglose en el toast/resultado.

---

## Notas técnicas
- Migración única con `ALTER TABLE` + cambio de índice; sin cambios de RLS.
- `exceljs` se importa dentro del handler del server fn para no contaminar el bundle cliente.
- Backfill: no se hace nada para sesiones pasadas; los `seat_*` quedan vacíos hasta que se importen.
- Sin cambios en el flujo público de inscripción ni en la confirmación del asistente, salvo escribir `companion_id` en tickets al confirmar.
