## Idea

En lugar de elegir una única estrategia de duplicados a ciegas, la importación se hace en **dos pasos**:

1. **Analizar** el archivo → mostrar los duplicados detectados agrupados en bloques.
2. **Decidir por bloque** qué hacer, y confirmar la importación.

## Detección ampliada

Hoy sólo se compara `nombre + apellidos` en la misma sesión. Se amplía a 4 claves normalizadas: **DNI**, **email**, **teléfono** (últimos 9 dígitos) y **nombre+apellidos**. Basta con que coincida una para considerar duplicado.

Se compara contra **toda la base de personas / participaciones** del evento (no sólo la sesión actual), para poder clasificar.

## Bloques que verá el usuario

Cada fila del Excel se clasifica en un bloque:

- **A. Nuevos** — no coinciden con nadie. Se importan siempre.
- **B. Ya en esta sesión** — la persona ya participa en la sesión destino.
- **C. Ya en otra sesión del evento** — la persona existe en otra sesión, pero no en esta.
- **D. Persona conocida sin participación** — existe en `people` pero sin participación en este evento.

Para B y C, además, se marca si esa participación existente **ya tiene ticket/QR generado** (icono/aviso "entrada enviada").

## Acción por bloque (radio group)

Para cada bloque el usuario elige una acción por defecto, con posibilidad de sobreescribir fila a fila:

| Bloque | Acciones posibles |
|---|---|
| **B. Ya en esta sesión** | **Actualizar** datos (default) · **No importar** · **Crear bis** (VIS 2) |
| **C. Ya en otra sesión** | **Crear en esta sesión** (default) · **No importar** · **Crear bis** |
| **D. Persona conocida** | **Crear participación** (default) · **No importar** |
| **A. Nuevos** | Sólo "Crear" (no hay decisión) |

"Crear bis" = añade `VIS 2` / `VIS 3`… al apellido y lo trata como persona nueva con su propio QR (comportamiento actual de `suffix_distinct`).

## UI

Nueva pantalla intermedia entre "subir archivo + mapear columnas" y "confirmar importación":

```text
┌─ Análisis de duplicados ────────────────────────────────┐
│  A. Nuevos             42 filas   → Crear                │
│  B. Ya en esta sesión  11 filas   ( ) Actualizar         │
│                        (8 con entrada enviada)  ( ) Saltar  ( ) Crear bis │
│  C. Ya en otra sesión   6 filas   ( ) Crear aquí  ( ) Saltar  ( ) Crear bis │
│  D. Persona conocida    3 filas   ( ) Crear  ( ) Saltar  │
│                                                           │
│  [ Ver detalle por fila ▾ ]                              │
│  [ Descargar Excel del análisis ]                        │
│                                                           │
│                     [ Cancelar ]  [ Confirmar importación ] │
└──────────────────────────────────────────────────────────┘
```

El detalle expandible lista fila a fila: nombre del Excel, motivo del match (DNI/email/tel/nombre), participación existente (sesión, estado, si tiene QR), y un selector por fila para sobreescribir la acción del bloque.

## Detalles técnicos

**Nuevos ficheros / cambios**

- `src/lib/imports.functions.ts`
  - Nueva server fn `analyzeImport({ eventId, sessionId, rows })` que devuelve, sin escribir nada:
    ```ts
    { rows: Array<{
        rowIndex, block: 'A'|'B'|'C'|'D',
        match_reason: 'dni'|'email'|'phone'|'name'|null,
        existing: { participant_id?, session_id?, session_name?, status?, has_ticket? } | null
      }>,
      counts: { A, B, C, D, B_with_ticket, C_with_ticket }
    }
    ```
  - Refactor de `commitImport`:
    - Nuevo campo `perRowActions: Record<rowIndex, 'update'|'create_here'|'create_bis'|'skip'|'create_new'>` opcional; si viene, sobreescribe la estrategia global.
    - Índice de duplicados por DNI/email/teléfono además de nombre.
    - Comportamientos de las acciones:
      - `update` → actualiza `people` + `event_participants` de esa sesión (como hoy).
      - `create_here` → reutiliza `person_id`, crea nueva `event_participants` en la sesión destino.
      - `create_bis` → aplica sufijo `VIS N`, crea persona nueva + participación.
      - `create_new` → sólo bloque A/D: crea persona (si D reutiliza `person_id`) + participación.
      - `skip` → sólo `import_row_results` con outcome `skipped`.

- `src/lib/import-constants.ts`
  - Añadir el tipo `RowAction` y helpers `defaultActionForBlock(block)`.

- `src/routes/_authenticated/importaciones.nueva.tsx`
  - Añadir paso "Análisis" entre mapeo y commit.
  - Componente `<DuplicateBlocks>` con radios por bloque y accordion de detalle por fila.
  - Botón "Descargar Excel del análisis" (genera XLSX en cliente con `xlsx`, mismo pattern que `seat-import-dialog`).

- `src/routes/_authenticated/importaciones.$batchId.tsx`
  - Mostrar `match_reason` y acción aplicada en el detalle por fila (ya existe `import_row_results`, sólo hay que añadir columnas).

**Sin cambios de schema.** Todo se resuelve con `people`, `event_participants`, `tickets`, `import_row_results` actuales. `import_row_results.match_reason` ya existe.

## Resultado para el caso del 8 de julio

1. Subes el Excel de lista de espera y mapeas columnas como hasta ahora.
2. La plataforma analiza y muestra:
   - "5 nuevos"
   - "12 ya en esta sesión (8 con entrada enviada)" → eliges **Saltar** para todo el bloque.
   - "2 en otra sesión" → eliges **Crear aquí**.
3. Confirmas → sólo entran los 7 correctos, sin tocar a nadie con entrada ya enviada, y el batch queda auditado con el motivo de cada fila.
