## Objetivo

Corregir la importación para que cuando vuelvas a subir el Excel del 15 de julio:

- **Se importen todas las filas** (no queden en error por DNI ya existente ni por participación duplicada).
- Cada fila quede en la sesión destino con el **estado indicado en la importación** y con **entrada (QR) si el estado lo requiere**.
- Si una persona ya existía en la sesión con un **estado superior con entrada** (aceptado/enviada/confirmado/validado), **se conserva** ese estado y su ticket (no se degrada a lista de espera).

## Cambios en `src/lib/imports.functions.ts`

1. **Alta de persona tolerante al DNI duplicado**
   - Antes de crear una persona, si el Excel trae DNI se busca primero por DNI normalizado (con y sin guion, mayúsculas). Si existe, se reutiliza.
   - Si la creación falla con `uq_people_dni`, se relee la persona por DNI y se reutiliza en lugar de marcar la fila como error.

2. **Participación en la sesión: regla de no-degradación**
   - Al insertar la participación, si ya existe una para esa persona en la sesión destino:
     - Si el **estado actual es “con entrada”** (`aceptado_pendiente_envio`, `invitacion_enviada`, `confirmado`, `acceso_validado`) y el estado del Excel es inferior (por ejemplo `lista_espera` o `pendiente_revision`), **se mantiene el estado actual y el ticket**.
     - Si el estado del Excel es igual o superior con entrada, se mantiene el ticket existente y solo se refrescan asiento propuesto, lote y datos de contacto.
     - Si la participación no tenía ticket y el estado del Excel exige QR, se genera el ticket que falta (sin duplicar si ya existe uno).
   - Nunca se sobrescribe un QR/ticket ya emitido.

3. **Acción “crear bis” sin colisión de DNI**
   - Al crear el bis (VIS N) se omite el DNI de la persona original; el bis se registra como persona distinta sin documento propio, así no rompe la unicidad de DNI.

4. **Contabilidad del lote**
   - `imported + updated = total_rows`.
   - `error_rows = 0` salvo casos irrecuperables reales (fila sin nombre, sesión inexistente).
   - El lote termina como `completada` cuando no queda ninguna fila irrecuperable.

5. **Reglas de proyecto que NO se tocan**
   - Detección de duplicados sigue siendo por **nombre+apellidos** dentro de la sesión.
   - Sigue existiendo la opción `create_bis` para personas distintas con los mismos datos.
   - No se cambia la deduplicación principal a email/teléfono/DNI.

## Verificación tras tu reimportación

Cuando vuelvas a subir el Excel te confirmo por consulta:

- Total de filas del Excel = total en la sesión para esas personas.
- 0 filas en `error_rows` del nuevo lote.
- Todas las importadas con estado “con entrada” tienen ticket.
- Las que ya tenían ticket previo conservan su token y su estado si era superior.