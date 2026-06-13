## Objetivo

1. Hacer que el flujo **Solicitudes → filtrar → Generar QR** sea completo (incluye acompañantes y muestra desglose).
2. Que en **`/comunicaciones/envio`** veas la lista de destinatarios y puedas refinarla con los mismos filtros que en Solicitudes, sin tener que volver atrás.

## Cambios

### 1. `src/routes/_authenticated/solicitudes.tsx` — `BulkActionsBar.generateQrBulk`

- Actualizar el toast para mostrar `Generados X titular(es) + Y acompañante(s) (Z ya existían)` usando los nuevos campos `generated_titulars`, `generated_companions`, `skipped_titulars`, `skipped_companions`, `mode` que ya devuelve `generateMissingTickets`.
- Si `mode === "mismo_qr"`, añadir nota "Sesión en modo 'un QR para el grupo': no se generan QR por acompañante".
- No tocar el resto del flujo (selección + botón "Enviar comunicación" ya navega a `/comunicaciones/envio` con `selection_key`).

### 2. `/comunicaciones/envio` — nueva sección "Destinatarios" con filtros y tabla

En `src/routes/_authenticated/comunicaciones.envio.tsx`:

- Añadir un **panel de filtros en el Paso 1** con los mismos campos que Solicitudes (los relevantes para envío):
  - Estado (multi-select sobre `PARTICIPANT_STATUS_OPTIONS`).
  - Tipo de asistente.
  - Con/sin email · Con/sin teléfono · Con/sin QR generado.
  - Búsqueda libre (nombre / apellidos / email / DNI / teléfono).
  - Provincia / ciudad / género / rango de edad / rango de fechas de creación.
  - Solo bloqueados · Solo duplicados (opcional, si lo usas).
  - Importación (`import_batch_id`) si hay batch contexto.
- Reescribir `participantsQ` para que además de filtrar por evento/sesión (o `selectedIds` cuando vienes de Solicitudes), aplique en cliente los filtros anteriores. Cuando vienen `selectedIds`, la lista parte de esos IDs y los filtros la reducen aún más.
- Añadir una **tabla de destinatarios** (similar a la de Solicitudes pero compacta: nombre, email/teléfono, estado, con/sin QR, checkbox para excluir filas concretas).
- Los contadores del resumen (Total, Con email, Sin email, Con QR, Sin QR, Ya en cola, Ya enviados) se recalculan sobre la lista filtrada + excluida.
- Pasos 2 (generar QR faltantes) y 5 (crear cola) actúan **solo sobre los participantes visibles (filtrados y no excluidos)**, no sobre todo el evento/sesión.

### 3. Reutilizar el componente de filtros (mínima refactor)

Para evitar duplicar UI:
- Extraer de `solicitudes.tsx` el bloque de filtros (la grilla con `Input`, `Select`, `Checkbox`) a un componente reutilizable `src/components/participant-filters-panel.tsx` con props `{ value, onChange, events, sessions, forms, hideEvent?, hideSession? }`.
- Usarlo tanto en Solicitudes como en Envío masivo. En envío, si ya viene `event_id`/`session_id` del contexto, se ocultan esos selectores.
- Reutilizar `ParticipantFilters` de `@/lib/use-participants`: cargar participantes con `useParticipants(filters)` también en envío masivo y aplicar los filtros adicionales que viven solo en cliente (ciudad, edad, fechas, duplicados, hasPhoto).

### 4. Carga de participantes en envío masivo

Cambios concretos en el query:
- Si hay `selection_key` (selección desde Solicitudes), parte de esos IDs (como hoy).
- Si no, usa `useParticipants({ eventId, sessionId, ...filtros })`.
- En ambos casos, aplicar los filtros UI sobre el resultado y guardar `excludedIds` (los desmarcados en la tabla).
- Los IDs efectivos = `participantesFiltrados - excludedIds`.

### 5. Coherencia con el resto

- `handleQueue`, `handleGenerateMissingQr` y los toggles de acompañantes ya operan sobre `participants.map(p => p.id)`, así que con cambiar la fuente de `participants` a la lista filtrada+excluida, todo encaja sin tocar `bulk-send.functions.ts` ni `tickets.functions.ts`.
- Mantener el path "vengo desde Solicitudes con selección" para no romper deep links existentes.

## Resultado

- **Solicitudes**: filtras → seleccionas (o no) → "Generar QR" crea titular + acompañantes (modo qr_propio) con toast claro; "Enviar comunicación" sigue llevando al envío masivo con esa selección.
- **Envío masivo**: ves la tabla de destinatarios, los filtras como en Solicitudes, desmarcas los que no quieras, generas QR faltantes y creas la cola sobre exactamente esa lista.

## Notas técnicas

- No hace falta migración de BD.
- Para no romper el endpoint `generateMissingTickets`, ya devuelve los campos nuevos + alias `generated`/`skipped` (compatibilidad).
- El componente extraído (`participant-filters-panel.tsx`) recibe el estado como prop controlada para que cada página gestione su propio URL/`useSearch` si lo necesita.
