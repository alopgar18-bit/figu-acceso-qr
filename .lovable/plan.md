
# Plan consolidado tras sesión del 24 de junio

Basado en tus respuestas: grid abstracto puro, aforo del plano manda, solo sesiones nuevas, acompañantes siempre con butaca, orden Plano → Import → Asignación → KPIs, reglas completas de asignación, import masivo desde Excel, validación "avisar pero importar", solo las categorías actuales.

## Fase 1 — Plano físico reutilizable (base)

Modelo de datos nuevo (4 tablas en `public`, con GRANT + RLS):

- `venues` — recinto físico (nombre, ciudad, notas).
- `venue_plans` — un plano por venue (nombre, versión, aforo total calculado, activo sí/no).
- `venue_zones` — zonas del plano (nombre visible, color por defecto, orden).
- `venue_seats` — butaca individual (zona, fila como texto, número como texto, categoría por defecto, `is_active`, coordenadas grid `row_index`/`col_index` para render).

`event_sessions` recibe columna opcional `venue_plan_id`. Las sesiones del 24 y 25 quedan con `venue_plan_id = NULL` (modelo legacy actual sigue funcionando intacto).

UI nueva bajo `/_authenticated/planos`:

- Listado de planos (`/planos`).
- Detalle/editor (`/planos/$planId`) — grid abstracto puro, sin imagen de fondo. Cada celda muestra fila+nº y se colorea por categoría/zona. Edición de zonas (nombre + color) con picker y reasignación de categoría celda a celda.
- Botón "Duplicar plano" para versionar.

## Fase 2 — Import masivo de butacas desde Excel

- Endpoint server function `importVenueSeats` que recibe un Excel con columnas: `zona`, `fila`, `numero`, `categoria`, `row_index`, `col_index`, `activo`.
- Valida estructura, deduplica (zona+fila+nº), crea zonas que no existan y vuelca a `venue_seats`.
- Vista previa antes de aplicar: tabla con conteos por zona/categoría y errores de formato.
- Para importaciones de participantes (Excel de reservas):
  - Resuelve butaca contra `venue_seats` por zona+fila+nº.
  - Si la butaca **no existe en el plano**: importa el participante con warning, lo manda al panel "Resolver conflictos" con motivo `butaca_no_existe_en_plano`. **No bloquea.**
  - Si la butaca existe: marca `seat_locked = true` en `event_participants` (campo nuevo) para que la asignación automática no la mueva.
  - El participante conserva siempre su `confirmation_token`/QR — nunca se reemiten URLs.

## Fase 3 — Asignación automática (alcance completo v1)

Tabla `assignment_rules` (por plan + tipo de solicitante):

- `applicant_type` (productora, prensa, invitado, etc.).
- `preferred_zones` (array ordenado por prioridad).
- `priority` (orden de procesamiento entre tipos).
- Flags: `keep_companions_together`, `respect_mobility_reduced`, `respect_visibility_reduced`.

Motor de asignación:

1. Ordena participantes pendientes por prioridad de tipo y `created_at`.
2. Para cada uno (con sus acompañantes — **siempre con butaca asignada**):
   - Busca bloque de N butacas contiguas en zona preferente.
   - Si MR/VR: filtra solo butacas de esa categoría + acompañante en `acompanante_mr` adyacente.
   - Nunca toca butacas `reservado_camaras`, `bloqueado` ni `seat_locked = true`.
3. Genera propuesta en memoria → vista previa con tabla + diff sobre el plano + export a Excel.
4. Botón "Aplicar definitivamente" → escribe `event_participants.seat_*`, registra en `audit_logs`, no toca tokens/QR.

## Fase 4 — KPIs sobre plano físico

Cuando `event_sessions.venue_plan_id IS NOT NULL`:

- **Aforo del plano manda**: el límite es `count(venue_seats WHERE is_active)`, no `aforo_sesion`. Si la sesión tiene un número manual mayor, la UI lo marca como inconsistente y propone ajustar.
- `libres = venue_seats.is_active AND categoria NOT IN (reservado_camaras, bloqueado) AND no ocupada por participante activo`.
- `personas_con_qr_sin_asiento` ya parcialmente hecho — integrar al panel KPI.
- Panel KPI de sesión muestra: aforo plano, ocupados, libres reales, bloqueados/cámaras, MR/VR ocupados vs disponibles, personas con QR sin butaca.

## Categorías de butaca

Sin cambios. Solo las actuales: `libre`, `reservado_camaras`, `bloqueado`, `movilidad_reducida`, `acompanante_mr`, `visibilidad_reducida`.

## Notas técnicas

```text
venues ──< venue_plans ──< venue_zones
                       └─< venue_seats (zone_id, row, number, category, row_index, col_index)

event_sessions.venue_plan_id ─→ venue_plans.id   (NULL = legacy session)
event_participants.seat_locked BOOL DEFAULT false
assignment_rules (plan_id, applicant_type, preferred_zones[], priority, flags…)
```

- Toda la lógica de asignación e import en `createServerFn` bajo `src/lib/*.functions.ts`.
- RLS: lectura para `authenticated` con asignación a evento; escritura solo admins.
- `audit_logs` para crear/duplicar plano, import masivo, propuesta aplicada.
- Migraciones no tocan sesiones 24/25 (legacy intacto).
- Sin reemisión de tokens/QR en ninguna fase.

## Entregables por fase

1. **Fase 1**: migración + rutas `/planos` y `/planos/$planId` + editor visual.
2. **Fase 2**: server fns `importVenueSeats` e import de participantes reescrito + warnings en panel conflictos + `seat_locked`.
3. **Fase 3**: tabla `assignment_rules` + UI de reglas + motor + propuesta + apply + export Excel.
4. **Fase 4**: KPIs recalculados sobre plano + indicador de inconsistencia aforo.

¿Apruebas para empezar por la Fase 1?
