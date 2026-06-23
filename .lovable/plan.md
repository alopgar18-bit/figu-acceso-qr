
# Plan urgente para el 24 de junio: libres correctos + leyendas

Alcance mínimo para que mañana el plano y la KPI de libres reflejen la realidad. El módulo completo de venues/planos reutilizables y la mejora de importaciones queda para el plan conjunto del día 25.

## Diagnóstico (verificado contra la BBDD)

Sesión `Grabación 24 de junio`, aforo configurado **700**.

| Métrica | Valor real |
| --- | --- |
| Titulares con asiento | 576 |
| Acompañantes con asiento | 326 |
| **Personas con butaca asignada** | **902** |
| Butacas únicas ocupadas | 836 |
| Titulares `cancelado_asistente` (con asiento aún puesto) | 7 |
| Personas en conflicto (misma butaca, distinta gente) | ~66 |

Por qué el plano dice "muchas libres":

1. La KPI "Huecos visibles" no es "libres reales": solo cuenta huecos entre `min..max(asiento)` de las filas que ya tienen alguien, ignorando filas y zonas sin asignar. El usuario la lee como "libres" y no lo es.
2. `getSessionOccupancy` no filtra por estado → los 7 cancelados aparecen ocupando butaca; en cambio, los acompañantes (status vacío) sí cuentan, bien.
3. No existe el concepto de butacas reservadas (cámaras), MR ni VR → cualquier resta contra `capacity` sale mal.

## Cambios a entregar antes de mañana

### 1. Corregir `getSessionOccupancy` (servidor y mirror cliente)

Archivos: `src/lib/seats.functions.ts` y `src/lib/seats-browser.ts` (mantener ambos idénticos).

- Excluir como ocupantes los titulares en estados `cancelado_asistente`, `no_asistira`, `baja`, `rechazado` (lista a confirmar contigo). Sus acompañantes tampoco cuentan aunque tengan butaca.
- Devolver totales nuevos en `totals`:
  - `aforo` = `session.capacity`.
  - `butacas_ocupadas` = butacas únicas con al menos un ocupante válido.
  - `personas_ocupadas` = ocupantes válidos (titulares + acompañantes).
  - `conflictos` = butacas con 2+ ocupantes válidos.
  - `reservados_no_disponibles` = butacas marcadas como `reservado_camaras` o `bloqueado` (ver §2).
  - `libres_estimadas` = `max(0, aforo − butacas_ocupadas − reservados_no_disponibles)`.
  - `overbooking` = `max(0, butacas_ocupadas + reservados_no_disponibles − aforo)`.
- Quitar `huecos_estimados` o renombrarlo a `huecos_dentro_de_rango` y dejar de mostrarlo en pantalla.

### 2. Leyendas mínimas por sesión (reservados, MR, VR)

Tabla nueva `public.session_seat_overrides`:

- Campos: `session_id` (FK `event_sessions`), `seat_zone`, `seat_row`, `seat_number`, `category` enum (`reservado_camaras | bloqueado | movilidad_reducida | acompanante_mr | visibilidad_reducida`), `color` opcional, `notes` opcional, timestamps.
- UNIQUE(`session_id`, `seat_zone`, `seat_row`, `seat_number`).
- GRANT a `authenticated` y `service_role`. RLS: lectura para cualquier usuario con acceso a la sesión (mismo patrón que ya usa `event_participants`), escritura solo admin / productora.

Integración en `getSessionOccupancy`:

- Cargar overrides y adjuntar `category` y `color` a cada `SeatCell`.
- Butacas con `category ∈ {reservado_camaras, bloqueado}`: pintadas en gris, no clicables, no suman a libres y suman a `reservados_no_disponibles`.
- `movilidad_reducida / acompanante_mr / visibilidad_reducida`: color propio + entrada en la leyenda. Siguen siendo butacas válidas (libres si no hay ocupante).

### 3. UI del plano (`src/routes/_authenticated/sesiones.$sessionId.plano.tsx`)

- Sustituir las KPIs actuales por: `Aforo · Butacas ocupadas · Personas · Reservados · Libres estimadas · Conflictos`. La de Libres en verde, en rojo si `overbooking > 0` con tooltip explicando que hay más butacas asignadas que aforo.
- Añadir panel "Leyenda" plegable con las categorías presentes en la sesión (lee de los overrides).
- Botón "Marcar butacas" visible solo a admin → modal sencillo: seleccionar zona, fila, rango de números (`12-18` o `12,14,16`), elegir categoría, guardar. Suficiente para meter mañana antes del evento los grises de cámaras y las zonas MR/VR del plano que pasaste. Sin editor visual sobre la imagen — eso entra en el plan del día 25.
- Modo filtro "Sólo libres" deja de incluir reservados/bloqueados.

### 4. Limpieza de datos previa al evento

Antes de mañana, un script de mantenimiento (server fn admin) que:

- Liste titulares con `status ∈ {cancelado_asistente, no_asistira, baja}` que aún tengan `seat_*` rellenos en la sesión 24-jun.
- Tras tu OK, vacíe `seat_zone/row/number` en titulares cancelados y en sus acompañantes.
- Log a `audit_logs`.

Esto deja el plano consistente aunque el filtro por estado del §1 ya cubra el cálculo.

### 5. Validación

- Cuadrar a mano: `butacas_ocupadas + libres_estimadas + reservados_no_disponibles ≈ aforo` (o `overbooking > 0` claro en rojo).
- Revisar contigo el plano con los reservados de cámaras marcados y confirmar que las cifras coinciden con lo que se espera ver el día del evento.

## Fuera de este plan (entra el 25)

- Módulo de venues / planos reutilizables con imagen de fondo y editor visual sobre la imagen.
- Asignación automática desde plano con perfiles de solicitante y export Excel.
- Reescritura del módulo de importaciones para alimentar `venue_seats` y validar contra el plano.

## Confirmaciones antes de implementar

1. Lista definitiva de estados que NO cuentan como ocupado (propongo `cancelado_asistente`, `no_asistira`, `baja`, `rechazado` — ¿añadimos/quitamos alguno?).
2. ¿Te vale el editor por rango numérico para marcar butacas mañana, o lo dejamos solo en "marcar butacas reservadas de cámaras" y MR/VR las gestionas tú con la importación posterior?
3. ¿Ejecuto la limpieza de los 7 cancelados con asiento en cuanto la migración esté lista, o prefieres revisar la lista uno a uno?
