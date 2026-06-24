## Objetivo

1. Revertir el flujo confuso de "promover plano".
2. Dejar **ya cargado** el plano del Cartuja Center (1711 butacas del Excel) vinculado a las sesiones del evento, para que al abrir la app esté listo.
3. **Añadir** en `/planos/$planId` un **importador visual de Excel reutilizable**, para que en el futuro puedas cargar más planos del mismo modo sin volver a pedírmelo.

## 1. Revertir el flujo de "promover plano"

- Borrar `src/lib/venue-plans.functions.ts`.
- `src/routes/_authenticated/sesiones.$sessionId.plano.tsx`: quitar banner amarillo, botón "Promover a plano de recinto", `promoteInfoQ`, `PromoteToVenuePlanDialog` e imports asociados.
- `src/routes/_authenticated/planos.$planId.tsx`: quitar `LinkedSessionsCard` y `bulkAssignVenuePlanToSessions`.
- Esto debería restaurar `/planos` y `/planos/$id` (los 404 vienen del join roto contra sesiones).

## 2. Importador visual de Excel en `/planos/$planId`

Nuevo botón **"Importar desde Excel"** en la página del plano:

1. Input file `.xlsx`.
2. Parseo en el cliente con `xlsx` (`cellStyles: true`) — instalar `xlsx` vía `bun add xlsx`.
3. Detectar:
   - **Zonas**: celdas con texto tipo `CLUB`, `PALCO`, `PLATEA`, `PLATEA ALTA`, `PLATEA BAJA`, `PLATEA PREFERENTE` (configurable).
   - **Filas**: rótulos `F1..F26` a la izquierda de cada bloque (con `F4b` cuando aparece).
   - **Butacas**: toda celda con un número se importa como butaca con `zona`, `fila`, `numero`, `row_index`, `col_index` y `color` (hex del relleno).
4. **Diálogo de mapeo de colores**: tabla con los colores detectados y su frecuencia, cada uno con un selector de categoría (`libre`, `reservado_camaras`, `visibilidad_reducida`, `movilidad_reducida`, `acompanante_movilidad_reducida`, `premium`, `bloqueado`).  
   Defaults pre-cargados según leyenda del Excel:
   ```text
   FFFDE8D9  melocotón     → visibilidad_reducida
   FF002060  azul oscuro   → movilidad_reducida
   FFB5DDE7  celeste claro → acompanante_movilidad_reducida
   FF7E7E7E  gris          → reservado_camaras
   resto                   → libre
   ```
5. Al confirmar, llamar a un nuevo server fn `importVenueSeatsBulk({ venue_plan_id, zonas, butacas })` que:
   - Crea/actualiza `venue_zones`.
   - Borra `venue_seats` existentes del plano (reimport idempotente).
   - Hace **un solo `INSERT ... SELECT FROM unnest(...)`** con las 1711 butacas → coste constante, no 1711 round-trips.
6. Refresca el listado del plano y muestra el total importado.

Este importador queda permanente en la UI — no es desechable.

## 3. Carga inicial del Cartuja Center

Para que cuando entres ya esté listo, usar el **mismo importador desde el lado servidor** una sola vez:

- Migración SQL que crea (si no existen) el `venue` "Cartuja Center CITE Sevilla", el `venue_plan` "Plano principal" y las 5 `venue_zones`.
- Migración de datos (vía `supabase--insert`) con las 1711 butacas ya parseadas localmente con openpyxl, usando exactamente el mapeo de colores de arriba. Este paso es equivalente a abrir el importador y pulsar "Confirmar" — sirve además como **test real** del formato canónico que produce el importador, así detectamos errores ya en esta entrega.
- Actualizar `event_sessions.venue_plan_id` para apuntar al nuevo plano en todas las sesiones del evento del Cartuja.

## 4. Verificación

- `/planos` → aparece "Cartuja Center CITE Sevilla — Plano principal" con 1711 butacas.
- `/planos/{id}` → rejilla pintada según `row_index`/`col_index`, con categorías visibles.
- Sesiones de junio → plano cargado automáticamente.
- Probar el botón "Importar desde Excel" con el mismo fichero en un plano vacío de prueba para confirmar que el flujo UI también funciona end-to-end.
- Screenshots con Playwright antes de avisar.

## Archivos afectados

- ❌ `src/lib/venue-plans.functions.ts` (borrar)
- ✏️ `src/routes/_authenticated/sesiones.$sessionId.plano.tsx`
- ✏️ `src/routes/_authenticated/planos.$planId.tsx` (añadir botón + diálogo importador)
- ➕ `src/lib/venue-plan-import.functions.ts` (server fn `importVenueSeatsBulk`)
- ➕ `src/components/venue-plans/ImportExcelDialog.tsx`
- 🗄️ Migración: venue + plan + zonas + vinculación a sesiones
- 🗄️ Insert masivo: 1711 butacas del Cartuja

## Lo que NO se hace

- No se modifica la estructura de `venues` / `venue_plans` / `venue_zones` / `venue_seats`.
- No se tocan los `session_seat_overrides` existentes de la sesión del 24.
