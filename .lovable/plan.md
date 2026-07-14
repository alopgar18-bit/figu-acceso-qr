## Diagnóstico

El proceso actual mezcla demasiadas reglas en un solo flujo:

- Detección de duplicados cruza sesiones (índice global de evento por DNI/nombre).
- La reutilización de `people` por DNI hace que una persona "salte" entre sesiones al reimportar.
- Reglas de no-degradación, VIS, guiones en DNI, seat_locked, per-row actions, análisis previo… todo conviven en `imports.functions.ts` (1.800+ líneas).
- Los acompañantes no se importan como filas propias: van como `companions_count` sin identidad, lo que impide gestionarlos igual que a un titular.
- Cada arreglo puntual añade excepciones y rompe el anterior.

## Principio rector

**Una importación pertenece a UNA sesión y sólo afecta a esa sesión.** Nunca leemos ni escribimos participaciones de otras sesiones del mismo evento durante un import. Los duplicados se resuelven **dentro de la sesión destino**; fuera de ella no existen para este proceso.

## Modelo de datos (sin migración destructiva)

- `people` sigue siendo global, pero **el import ya no reutiliza automáticamente `people` por DNI**. Regla nueva: cada fila del Excel = una persona (nueva o la misma sólo si ya está en esta sesión). Si el mismo DNI aparece en otra sesión, se crea otra `people` con sufijo VIS N — es la estrategia que ya validamos y evita colisiones cruzadas.
- Nuevo campo virtual en `event_participants` (ya existe `import_batch_id`): usamos únicamente el par `(session_id, person_id)` como clave dentro del lote.
- Los acompañantes se importan como filas propias en `companions` ligadas al participant titular (ya existe la tabla). El titular queda con `companions_count = N` calculado a partir de las filas hijas.

## Nuevo flujo (2 pasos claros)

```text
Paso 1  ANÁLISIS por SESIÓN
  Input : sessionId + filas (titulares y acompañantes)
  Salida: bloques
    A · Nuevos titulares
    B · Titulares ya en esta sesión (misma persona)
    C · Titulares con mismo nombre pero DNI distinto (candidatos VIS)
    D · Acompañantes de un titular presente
    E · Acompañantes huérfanos (sin titular en el Excel ni en la sesión)
  Nunca se consulta otra sesión.

Paso 2  COMMIT por SESIÓN
  Para cada bloque, acción por defecto + override por fila:
    A → insertar titular + person nueva
    B → actualizar contacto/asiento, NO degradar estado, NO tocar ticket/QR
    C → suffix_distinct (VIS N) SIEMPRE por defecto
    D → insertar companion ligado al titular; recalcular companions_count
    E → skip con motivo "titular_ausente"
  Idempotente: reejecutar el mismo Excel sobre la misma sesión no crea filas nuevas.
```

## Cambios de código

1. **`src/lib/imports.functions.ts` — reescribir**
   - Trocear en módulos: `imports/analyze.ts`, `imports/commit.ts`, `imports/resolve.ts`, `imports/companions.ts`, `imports/dedup.ts`. Los `.functions.ts` sólo declaran los `createServerFn`.
   - Eliminar toda consulta a `event_participants` que no filtre por `session_id = data.sessionId`.
   - Eliminar `resolvePersonOutsideEvent` y el índice global `eventByDni/eventByName`.
   - `findPersonIdByDni` se conserva **sólo** para detectar colisiones y forzar VIS N, nunca para reutilizar la persona en otra sesión.
   - Regla única de duplicado dentro de sesión: `(first_name, last_name) normalizados` **o** `dni` normalizado. Contacto (email/phone) ignorado, como hoy.
   - Regla de no-degradación: se mantiene, pero encapsulada en `resolve.ts` con test unitario.

2. **Acompañantes como filas de primera clase**
   - Detectar rol en el Excel (columna Rol/Tipo, ya soportada en `seat-import-dialog`).
   - Vincular acompañante a titular por: (a) `titular_full_name` explícito, (b) mismo grupo (misma fila de origen con `companions_count>0`), (c) mismo email/teléfono cuando (a)/(b) no aplican.
   - Insertar en `companions` con `first_name`, `last_name`, `dni`, `email`, `phone`, `seat_*`; nunca crear `people` para acompañantes salvo que el usuario lo pida explícitamente.
   - Recalcular `event_participants.companions_count` desde COUNT hijos.

3. **UI `importaciones.nueva.tsx`**
   - Forzar selección de sesión antes del análisis (ya lo hace; validar que sea obligatoria y visible).
   - Simplificar los bloques a los 5 A–E anteriores con contadores y acción por defecto seleccionable arriba (skip/update/create_bis).
   - Vista previa por bloque con 5 primeras filas y buscador.
   - Botón "Reparar lote" (ya existe) sigue funcionando: reprocesa **sólo** la sesión del lote.

4. **Salvaguardas**
   - Constraint lógica en commit: si aparece `person_id` que ya tiene participación en OTRA sesión del mismo evento **y** DNI coincide → forzar VIS N automáticamente, nunca reutilizar.
   - Log de auditoría `imports.commit` con desglose por bloque.
   - Row-results (`import_row_results`) obligatorio para toda fila con `block` (A–E), `action_taken`, `person_id`, `participant_id`, `companion_id`.

5. **Compatibilidad**
   - Lotes anteriores siguen visibles y reparables.
   - `repairImportBatch` se adapta al nuevo modelo: reconstruye por `(session_id, batch_id)` sin tocar otras sesiones.

## Fuera de alcance (para no romper hoy)

- Sin cambios en QR, tickets, envío masivo, plantillas ni cola de comunicaciones.
- Sin migración de datos históricos: la limpieza se hace bajo demanda con "Reparar lote".
- Sin cambios en el formulario público ni en `submit_public_form`.

## Entregables

- `src/lib/imports/*.ts` (nuevo), `src/lib/imports.functions.ts` reducido a wrappers.
- `src/routes/_authenticated/importaciones.nueva.tsx` simplificada a A–E.
- `src/routes/_authenticated/importaciones.$batchId.tsx` con desglose por bloque.
- Auditoría en `audit_logs` con la acción `imports.commit.v2`.

## Validación

Prueba de humo tras el cambio: importar dos veces el mismo Excel de la sesión 15/07 sobre la 15/07 y sobre otra sesión distinta; verificar que:

- La segunda pasada no crea nada nuevo en 15/07.
- La importación en otra sesión no toca ni un solo registro de 15/07.
- Los homónimos con DNI distinto entran como VIS N.
- Los acompañantes aparecen en `companions` y `companions_count` cuadra.
