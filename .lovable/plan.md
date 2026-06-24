## Diagnóstico

El plano que ves de "Cartuja Center CITE Sevilla" **no está en `/planos`** porque nunca se creó como plano de recinto. Está guardado como **180 overrides de butacas** dentro de la sesión "Grabación 24 de junio" (tabla `session_seat_overrides`), que es el sistema legacy previo a la Fase 1.

Datos reales hoy:
- `venues`: 0 filas
- `venue_plans`: 0 filas
- `venue_seats`: 0 filas
- `session_seat_overrides` para la sesión del 24 jun: **180 butacas dibujadas**
- Las sesiones del 10 y 17 jun no tienen plano alguno

Por eso `/planos` aparece vacío y no puedes asignar ese plano a las otras dos sesiones.

## Solución: acción "Promover a plano de recinto"

Añadir un botón en la vista de plano de sesión (`/sesiones/{id}/plano`) que convierta las butacas dibujadas en un plano de recinto reutilizable, en un solo clic.

### Flujo

1. En `/sesiones/{sessionId}/plano`, si la sesión **no tiene `venue_plan_id`** pero **sí tiene overrides**, mostrar un banner: *"Este plano vive solo en esta sesión. Conviértelo en plano de recinto para reutilizarlo en otras sesiones del evento."* con botón **"Promover a plano de recinto"**.
2. Al pulsarlo se abre un diálogo con:
   - Nombre del recinto (precargado con `event.location_name` → "Cartuja Center CITE Sevilla")
   - Ciudad (precargada con `event.city` → "Sevilla")
   - Nombre del plano (precargado: "Configuración principal")
   - Checkbox **"Vincular este plano a la sesión actual"** (marcado por defecto)
3. Al confirmar, un server function `promoteSessionOverridesToVenuePlan`:
   - Busca o crea el `venue` (case-insensitive por nombre+ciudad).
   - Crea el `venue_plan`.
   - Inserta las 180 filas de `session_seat_overrides` como `venue_seats` (zone/row/number/category/color), con `plan_id` apuntando al nuevo plano.
   - Si el checkbox está marcado, actualiza `event_sessions.venue_plan_id` de la sesión actual.
   - Devuelve `{ venuePlanId, venueId, seatsCreated }`.
4. Toast de éxito + invalidación de queries. El plano ya aparece en `/planos`.

### Asignar a las otras sesiones

Una vez promovido, en el formulario de cada sesión (10 y 17 jun) ya existe el selector **"Plano del recinto"** (Fase 1). Bastará con seleccionar el plano recién creado y guardar — los KPIs y la asignación automática usarán las 180 butacas reales.

Alternativa rápida: añadir en `/planos/{planId}` un panel **"Sesiones que usan este plano"** con un botón *"Aplicar a otras sesiones del evento"* que permita seleccionar sesiones del mismo evento y setear su `venue_plan_id` en bloque. (Opcional, lo incluyo en el plan.)

## Detalles técnicos

**Nuevo archivo:** `src/lib/venue-plans.functions.ts`
- `promoteSessionOverridesToVenuePlan({ sessionId, venueName, city, planName, linkToSession }) ` — server fn protegida con `requireSupabaseAuth`. Lógica:
  1. Lee la sesión y su evento.
  2. `SELECT id FROM venues WHERE lower(name)=lower($1) AND lower(coalesce(city,''))=lower(coalesce($2,''))` → si no existe, `INSERT`.
  3. `INSERT INTO venue_plans (venue_id, name, is_active, version) VALUES (..., true, 1) RETURNING id`.
  4. `INSERT INTO venue_seats (plan_id, seat_zone, seat_row, seat_number, category, color) SELECT ... FROM session_seat_overrides WHERE session_id=$1`.
  5. Si `linkToSession`: `UPDATE event_sessions SET venue_plan_id=$plan WHERE id=$session`.
  6. Audit log `venue_plan.promote_from_session`.
- `bulkAssignVenuePlanToSessions({ planId, sessionIds })` — server fn para la asignación masiva opcional.

**Edición de `src/routes/_authenticated/sesiones.$sessionId.plano.tsx`:**
- Query adicional que cuente `session_seat_overrides` y lea `session.venue_plan_id`.
- Banner + diálogo de promoción descrito arriba.

**Edición de `src/routes/_authenticated/planos.$planId.tsx`:**
- Sección **"Sesiones vinculadas"** que lista `event_sessions` con `venue_plan_id = planId` y botón *"Aplicar a otras sesiones del mismo evento"* (multi-select de sesiones sin plano del mismo evento).

**Sin migración SQL** — todas las tablas necesarias ya existen.

## Resultado

Después de aplicar este plan:
- En `/planos` aparecerá la card **"Cartuja Center CITE Sevilla · Configuración principal · 180 butacas"**.
- En las sesiones del 10 y 17 jun podrás seleccionar ese plano en el formulario, o aplicarlo en bloque desde la vista del plano.
- Las butacas reservadas/bloqueadas (cámaras, MR, etc.) que ya dibujaste se conservan con su categoría y color en el nuevo plano.
