## Qué está pasando

La opción **"Tratar como personas distintas (VIS 2, VIS 3…)"** SÍ existe en el wizard de `Importaciones → Nueva importación`, en el paso **"Reglas de importación"** → desplegable **"Duplicados"** (tercera columna, a la derecha de "Estado inicial" y "Tipo de asistente").

El problema es que:
- El **valor por defecto** del desplegable es `"Actualizar persona global"` (`update_person`), no VIS.
- Ese modo hace exactamente lo que has visto: cuando llega una fila con un nombre+apellido ya existente en la sesión, **sobrescribe** el asiento del anterior en vez de crear una persona nueva.
- La opción de duplicados está en la misma tarjeta que "Estado inicial", visualmente poco destacada, así que en un import rápido pasa desapercibida y te quedas con el default.

O sea: el código funciona bien si eliges VIS, pero por defecto no lo estás eligiendo y no hay ningún aviso previo de "vas a sobrescribir N filas".

## Qué propongo cambiar

### 1. Cambiar el default a "VIS" (más seguro)
En `src/routes/_authenticated/importaciones.nueva.tsx` cambiar:
```
useState<DuplicateStrategy>("update_person")  →  useState<DuplicateStrategy>("suffix_distinct")
```
Así, salvo que el usuario elija explícitamente otra cosa, los duplicados siempre se crean como personas distintas y **nunca se pierde un asiento** por colisión de nombre.

### 2. Aviso claro antes de importar
En el paso final ("Confirmar e importar") añadir un recuadro amarillo/rojo cuando el fichero contenga colisiones de nombre+apellido (con el propio fichero o con el roster de la sesión):

```
⚠️  Hemos detectado 12 filas con nombre y apellidos que coinciden con
    personas ya existentes en esta sesión.
    Estrategia actual: [Actualizar persona global]
        → Los 12 se fusionarán con la persona existente y su asiento
          se sobrescribirá con el de la fila importada.
    [Cambiar a "Tratar como personas distintas (VIS 2, VIS 3…)"]
```
El botón cambia el desplegable sin salir del paso. Cálculo del contador: reutilizar el `nameToPersonId` que ya monta `imports.functions.ts` en un `previewDuplicates` server fn ligero (solo cuenta, no escribe).

### 3. Etiqueta más visible del selector
Renombrar la label del desplegable de `Duplicados` → `Duplicados por nombre+apellido` y añadir un icono ⚠️ al lado cuando el valor sea `update_person` o `new_participation`, con tooltip "Puede sobrescribir asientos".

### 4. Mismo comportamiento en "Importar asientos" rápido
`src/components/seat-import-dialog.tsx` (el botón del plano) hoy no tiene selector de duplicados y siempre actualiza por nombre. Añadir el mismo selector con default `suffix_distinct` para que el flujo rápido tampoco pise asientos.

### 5. Post-import: seguir mostrándolo en el resumen
El resumen del batch ya audita `sufijo VIS aplicado por duplicado nombre+apellido` en `import_row_results.match_reason`. Añadir en la pantalla del batch un contador destacado:
- "X personas creadas con sufijo VIS por duplicado — revísalas para confirmar si son la misma persona o dos distintas".

## Qué NO cambia
- El modo `update_person` sigue disponible para quien realmente quiera actualizar contactos (email/tel/etc.) sin crear duplicados.
- El sufijo VIS sigue viviendo solo en BBDD; el saludo de plantillas usa el primer token del apellido, así el asistente nunca ve "VIS 2".
- No se toca la importación que acabas de hacer — para esa te preparo aparte el Excel de huérfanos como el del 2 de julio y aplicamos SQL, si me confirmas de qué sesión/batch es.

¿Lo aplico así? Si prefieres que el default siga siendo `update_person` y solo añadamos el aviso + botón de cambio, dímelo y lo dejo como opción explícita.
