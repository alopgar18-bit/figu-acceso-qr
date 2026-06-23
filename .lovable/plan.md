## Objetivo

Dejar el plano correcto para mañana sin reenviar entradas: aplicar el "Listado corregido" del Excel directamente sobre `event_participants` / `companions` (solo cambian `seat_zone/row/number`; **NO se toca `confirmation_token` ni se regeneran QR**, las URLs ya enviadas siguen válidas). En paralelo, dejar los cambios de UI que pediste (aforo plano vs sesión, leyenda completa, panel global de conflictos).

---

## 1. Aplicar el Excel a la BBDD (lo crítico para mañana)

**Flujo:**

1. Subes el Excel desde el plano (admin only) → server fn `applySeatCorrectionsExcel`.
2. Server fn parsea la hoja **"Listado corregido"** y, por cada fila, busca la persona en la sesión por:
  - `email` (titular) + `nombre completo` → match en `event_participants` (titular) o `companions` (acompañante).
  - Si hay match único: actualiza `seat_zone / seat_row / seat_number` con `Fila final` / `Asiento final`.
  - Si hay 0 o varios matches → fila se devuelve como "no aplicada" en el informe.
3. Antes de aplicar, devuelve una **vista previa** (totales: a actualizar / sin cambios / no encontrados / conflictos) y solo aplica con confirmación explícita.
4. Todo el cambio se registra en `audit_logs` (`action='seats.bulk_correction'`, `changes={file, applied, skipped, sample}`).
5. **No** se tocan: `confirmation_token`, `qr_*`, `status`, `tickets`. Las URLs/QR ya enviadas siguen funcionando.

**Validaciones obligatorias en el server fn:**

- Solo admin (`is_admin(auth.uid())`).
- Sesión target = la del plano abierto.
- Rechazar fila si la butaca destino **no existe** en el plano (cruzando con `event_sessions.theater_layout`/zonas) o **es de cámara/bloqueada** (cruce con `session_seat_overrides`).
- Rechazar si la butaca destino ya está asignada a otra persona distinta de la del Excel (evita crear nuevos duplicados).
- Resultado final descargable en Excel: filas aplicadas, filas omitidas con motivo.

**Sin migración nueva**: solo updates sobre tablas existentes.

---

## 2. Aforo del plano vs aforo de sesión

En `seats.functions.ts` + `seats-browser.ts`:

- Nuevo `aforo_plano = Σ butacas reales en zonas` (excluye huecos/pasillos).
- `totals` añade `aforo_plano`, mantiene `aforo` como `aforo_sesion`.
- `libres_estimadas = aforo_plano − butacas_ocupadas − reservados_no_disponibles`.
- `desviacion_sesion = aforo_plano − aforo_sesion`.

En el KPI panel: dos tarjetas — **"Aforo plano"** (principal) y **"Aforo sesión"** (referencia, badge de aviso si difieren). "Libres" cuelga del aforo del plano.

---

## 3. Leyenda completa siempre visible

En `sesiones.$sessionId.plano.tsx`, renderizar la leyenda iterando sobre `SEAT_OVERRIDE_LABELS` completo (no solo categorías con count>0), mostrando color por defecto y contador (0 si no hay). Tooltip con la descripción funcional de cada una.

---

## 4. Panel global "Resolver conflictos"

Bloque colapsable en la cabecera del plano (admin), con tres acciones masivas — todas con **listado previo** antes de actuar (según tus respuestas):

1. **Duplicados de butaca** → muestra los duplicados; permite marcar/desmarcar y aplicar.
  - **Por defecto**: marcar manualmente desde la lista (tu opción c). Sin regla automática.
2. **Cancelados con butaca** → lista los titulares con estado en `INVALID_OCCUPANT_STATUSES` que conservan `seat_*`; botón "Liberar butaca seleccionadas".
3. **Asignados fuera del plano** → lista de participantes con `seat_*` que no existen en ninguna zona; solo **listar / exportar a Excel** (tu opción 2), no desasigna automáticamente.

**Exportar conflictos a Excel** (tu opción sí): botón en el panel que descarga un `.xlsx` con tres hojas (duplicados / cancelados con butaca / fuera de plano), mismo formato que el que has usado para tu análisis paralelo.

Todo vía server functions con `requireSupabaseAuth` + `is_admin`, registrado en `audit_logs`.

---

## Archivos a tocar / crear

- `src/lib/seats.functions.ts` — `aforo_plano`, `listSeatConflicts`, `clearCanceledSeats`, `applySeatCorrectionsExcel`, `exportConflictsXlsx`.
- `src/lib/seats-browser.ts` — espejar shape de totals.
- `src/routes/_authenticated/sesiones.$sessionId.plano.tsx` — KPIs, leyenda completa, panel "Resolver conflictos", botón "Aplicar correcciones desde Excel".
- Nuevo componente `ApplyCorrectionsDialog` (subir xlsx, preview, confirmar).

**No se toca**: tabla `tickets`, `confirmation_token`, módulo de importación, módulo de planos físicos (queda para el 25).

---

## Coherencia con tu Excel (revisado)

- Totales cuadran: 763 + 57 reubicadas + 4 sin asignar + algunos no asistirá ≈ 906 asistentes; cuadra con los 902 con asiento en BBDD.
- 0 butacas de cámara invadidas → coherente con que aún no tienes `session_seat_overrides` cargadas; convendría marcar las casillas grises del plano (cámaras) **antes** de aplicar correcciones para que la validación las rechace si algún destino futuro cae sobre ellas. Mañana basta con que estén marcadas; si quieres lo hago yo desde la imagen del plano que ya pasaste.
- Matching por `email + nombre completo` es razonable; si una persona aparece con email vacío o nombres con tildes/espacios distintos, caerá en "no encontrada" y la verás en el informe para resolver a mano. Te aviso por si prefieres incluir un fallback por `dni`.

## Preguntas antes de implementar

1. ¿Te marco yo las **butacas de cámara (grises)** desde el plano que pasaste, antes de aplicar el Excel, para que la validación las proteja? (recomendado) si
2. Para la limpieza de cancelados con butaca: ¿ejecuto la limpieza **a la vez** que aplico el Excel, o lo dejo como acción aparte en el panel? a parte