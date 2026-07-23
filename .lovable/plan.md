Aplicar las dos correcciones acordadas.

## 1. Arreglar los datos ya afectados (SQL en una transacción)

Sin choques detectados (0 personas de las 20 solicitudes existen ya en la sesión del 29-jul), así que se puede mover todo limpio:

- `UPDATE public_forms SET session_id = 'bceffbaf-…' WHERE id IN (…4 formularios del 29-jul…)` — reapunta los 4 formularios de Arahal / General compromisos / Villarrasa / Córdoba a la sesión del 29 de julio.
- `UPDATE event_participants SET session_id = 'bceffbaf-…' WHERE public_form_id IN (…4 ids…) AND session_id = '59440d2f-…'` — traslada las 20 solicitudes recibidas hoy desde la sesión 22-jul a la 29-jul (mismo `event_id`, no toco estado, asiento ni ticket).
- Registro en `audit_logs` con acción `reassign_session` y contexto "Reasignación formularios 29-jul".

## 2. Prevención en la app (dos cambios pequeños)

**A. Selector de sesión al duplicar formulario**
- `src/lib/forms.functions.ts`: `duplicatePublicForm` acepta opcional `session_id`; si se pasa, se usa; si no, mantiene el original (retrocompatible).
- `src/routes/_authenticated/eventos.$eventId.tsx` (o donde esté el botón "Duplicar"): al pulsar duplicar, abrir un pequeño diálogo con selector de sesiones del mismo evento (por defecto la del formulario original) y llamar a `duplicatePublicForm` con la elegida.

**B. Sesión editable en el editor de formularios**
- `src/components/form-editor-dialog.tsx`: añadir un `Select` de sesión (cargado con `useEventSessions(event_id)`), enlazado al campo `session_id`.
- `src/lib/forms.functions.ts`: `updatePublicForm` ya acepta el resto de campos; añadir `session_id` al esquema/validador y al `UPDATE`.
- Solo visible para roles con permiso de edición (los mismos que hoy pueden editar el formulario).

No toco lógica de submit ni validaciones de aforo — la función RPC `submit_public_form` ya deriva la sesión del formulario, así que en cuanto el `session_id` esté bien apuntado, las nuevas solicitudes caerán solas donde toca.

## Verificación final

Tras aplicar 1 y 2:
- `SELECT count(*) FROM event_participants WHERE session_id='bceffbaf-…'` → debe subir en 20.
- `SELECT count(*) FROM event_participants WHERE session_id='59440d2f-…' AND public_form_id IN (…)` → debe ser 0.
- Comprobar en el panel de Solicitudes de la sesión del 29-jul que aparecen las 20.
- Probar en editor: cambiar `session_id` de un formulario de prueba y ver que la lista de formularios refleja la sesión nueva.
