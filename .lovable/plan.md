# Fase 2 — Acompañantes como filas propias

Aplica las decisiones que acabas de dar:

- Vinculación titular = **columna Titular explícita → fallback por contacto → agrupación por fila (companions_count contiguo)**.
- Cada acompañante genera **una fila en `people` y otra en `companions`**, con la misma regla VIS N si el DNI ya está en otra sesión del evento.
- Si el Excel trae asiento distinto al ya asignado → **sobrescribimos con el del Excel** y lo dejamos anotado en `import_row_results`.

## Bloques de análisis (nuevos)

```text
A  Titular nuevo en esta sesión
B  Titular ya en esta sesión (update sin degradar)
D  Acompañante vinculado a un titular presente (Excel o sesión)
E  Acompañante huérfano (sin titular localizable) → skip con motivo
```

El bloque C queda vacío por el aislamiento por sesión (ya cerrado en la fase 1) y se retira del wizard.

## Cambios de código

**1. Parser del Excel — `src/routes/_authenticated/importaciones.nueva.tsx`**
- Reconocer la columna Rol/Tipo (`titular` / `acompañante`) y la columna `Solicitante (Titular)`.
- Añadir al payload de cada fila: `role`, `titular_full_name`, `group_index` (posición secuencial que hereda al último titular con `companions_count > 0`).
- El buscador y contadores del panel de análisis pasan a A/B/D/E.

**2. Schema y análisis — `src/lib/imports.functions.ts`**
- Ampliar `rowSchema` con `role: "titular" | "acompanante"` (default `titular`) y `titular_full_name`, `group_index`.
- `analyzeImport`:
  - Separa titulares y acompañantes antes de clasificar.
  - Resuelve titular de cada acompañante en este orden: (1) match por `titular_full_name` normalizado en el Excel/roster, (2) mismo email o teléfono normalizado que un titular presente, (3) último titular con `group_index` compatible y `companions_count > 0` pendiente de rellenar.
  - Bloque D si encuentra titular, E si no.

**3. Commit — `src/lib/imports.functions.ts`**
- Primero se procesan titulares (A/B) para tener sus `participant_id`.
- Para cada acompañante D:
  - Crea/actualiza `people` con la misma regla VIS N que titulares (respeta `dniInOtherSession`).
  - Inserta/actualiza fila en `companions` con `event_participant_id` del titular resuelto, copiando nombre, DNI, contacto, `attendee_type = "acompanante"` y asiento del Excel.
  - Sobrescribe `seat_zone/row/number` en `companions` cuando el Excel trae datos, aunque ya hubiera asiento; registra `seat_override_previous` en `import_row_results`.
- Al terminar, `UPDATE event_participants SET companions_count = (SELECT count(*) FROM companions WHERE event_participant_id = ep.id)` para los titulares tocados.
- Bloque E → `import_row_results` con `status="skipped"`, `reason="titular_no_localizado"`.

**4. Constantes y UI**
- `src/lib/import-constants.ts`: nuevos labels/descriptions para A, B, D, E; retirar C.
- `src/routes/_authenticated/importaciones.$batchId.tsx`: mostrar contador de acompañantes creados por titular.

**5. Auditoría**
- `audit_logs` con `action = imports.commit.v2`, incluyendo desglose `{ titulares_nuevos, titulares_actualizados, acompanantes_creados, acompanantes_actualizados, huerfanos, seat_overrides }`.

## Fuera de alcance

- Sin migración de datos históricos; los lotes antiguos siguen visibles y reparables por `repairImportBatch`.
- Sin cambios en QR, tickets, envío masivo, formularios públicos ni cola de comunicaciones.
- Sin trocear todavía `imports.functions.ts` en `src/lib/imports/*.ts` (queda para una fase 3 de refactor puro, sin cambios funcionales).

## Validación

Antes de dar por cerrada la fase:

1. Importar el Excel del 15/07 dos veces sobre la misma sesión — la segunda pasada no crea nada.
2. Importar el mismo Excel sobre otra sesión — se crean personas VIS N sin tocar la del 15/07.
3. Fila de acompañante con `Solicitante (Titular) = "Juan Pérez"` presente → aparece en `companions` con el asiento indicado y `companions_count` sube.
4. Fila de acompañante sin titular localizable → queda en E y no se crea nada.
5. Titular reimportado con asiento distinto en su acompañante → el asiento del acompañante pasa a ser el del Excel y el override queda registrado.
