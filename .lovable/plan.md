# Solicitudes → Comunicar → QR → Cola + borrado controlado

Alcance grande. Lo divido en 3 fases entregables para que cada una sea verificable end-to-end. Recomiendo aprobar la Fase 1 primero (el bloqueo actual) y luego seguir.

## Fase 1 — Desbloquear "Comunicar" desde Solicitudes (PRIORIDAD)

Resuelve el síntoma reportado: 401 resultados visibles, pero "Envío masivo" muestra 0.

### Cambios

1. **`solicitudes.tsx` → `BulkActionsBar`**
   - Activar el botón `Comunicar` (quitar `disabled`).
   - Navegar a `/comunicaciones/envio` pasando `participant_ids` (los seleccionados) por search-params, además de `event_id` y `session_id` cuando existan.
   - Añadir botón secundario "Comunicar a todos los filtrados" (cuando hay filtros con resultados pero ninguna selección): pasa los IDs de `filteredRows` completos.
   - Añadir botón "Generar QR" que llama directamente a `generateMissingTickets` con los IDs seleccionados (requiere mismo evento+sesión).

2. **`comunicaciones.envio.tsx`**
   - Ampliar `searchSchema` con `participant_ids` (lista, codificada como CSV en URL para evitar URLs gigantes; usar sessionStorage como fallback si > 100 IDs).
   - Nueva fuente de destinatarios: si llegan `participant_ids`, cargar `event_participants` por `.in('id', ids)` en lugar de filtrar por `event_id+session_id+batch_id`.
   - Derivar `event_id`/`session_id` desde el primer participante si no vienen explícitos. Validar que todos comparten evento+sesión (mostrar error claro si no).
   - Mostrar tabla de destinatarios (Nombre, Apellidos, Email, Teléfono, Estado, ¿QR?, ¿En cola?) antes del paso "Crear cola".

3. **`bulk-send.functions.ts` → `queueBulkInvitations`**
   - Aceptar `participant_ids` ya filtrados desde el cliente (ya lo hace, verificar).
   - Estado de log: si falta email → `cancelado` con `error_message = 'omitido_sin_email'`; si falta QR y `require_ticket=true` → `cancelado` con `omitido_sin_qr`. Devolver contadores diferenciados.

### Resultado verificable
- Solicitudes → filtrar evento+sesión → seleccionar 1 → Comunicar → asistente muestra Total: 1.
- Sin selección + filtros con 401 → "Comunicar a todos los filtrados" → Total: 401.
- "Generar QR" en barra de acciones funciona sin pedir DNI.

---

## Fase 2 — Borrado controlado (admin)

Después de Fase 1, añadir borrado/archivado con confirmación.

### Migración
- Añadir `deleted_at`, `deleted_by`, `archived_at`, `archived_by` a:
  `import_batches`, `people`, `event_participants`, `tickets`, `communication_logs`, `incidents`, `checkins`, `form_submissions`.
- Crear función SQL `delete_import_cascade(batch_id, mode)` con `mode in ('archive','delete_records','delete_full')` que:
  - Borra/archiva participantes, tickets, comm_logs, checkins, incidents asociados al batch.
  - Borra `people` solo si no tiene participaciones en otros batches.
  - Registra en `audit_logs`.
- Políticas RLS: solo `superadmin` o `admin_figurarte` pueden hacer UPDATE de `deleted_at`/`archived_at`.

### Server functions (`src/lib/admin-delete.functions.ts`)
- `deleteImportBatch({ batch_id, mode })`
- `deleteParticipants({ ids, hard })`
- `deleteTickets({ ids })`, `cancelTickets({ ids })`, `regenerateTickets({ ids })`
- `deleteCommunicationLogs({ ids })`, `archiveCommunicationLogs({ ids })`
- Cada una: rol-guard, dry-run que devuelve impacto, requiere `confirm_text === 'BORRAR'` para masivos > 10.

### UI
- Diálogo reusable `<DangerousActionDialog>` con preview de impacto + input "BORRAR".
- En `importaciones.$batchId.tsx`: dropdown "Archivar / Borrar registros / Borrar todo".
- En Solicitudes BulkActionsBar: "Borrar seleccionados", "Borrar QR", "Borrar comunicaciones".
- En Comunicaciones cola: borrado y archivado por selección.
- Listados filtran `deleted_at IS NULL` por defecto + toggle "Mostrar archivados".

---

## Fase 3 — Refinamientos opcionales

- Plantilla "Invitación público — El Perro Andaluz" creada vía seed/migración (ya existe botón "Crear plantilla sugerida" en el asistente; solo confirmar variables `{{evento}}`, `{{sesion}}`, etc., son las que renderiza `renderTemplate`).
- Pantalla "Generar QR" como flujo guiado independiente (selección → preview → confirmación) accesible desde sidebar.
- Envío Gmail real (queda fuera; ya hay infraestructura de cola + CSV export).

---

## Pregunta

¿Empiezo por **Fase 1** (desbloquear el flujo Solicitudes → Comunicar)? Es lo que resuelve el "0 destinatarios". Fase 2 (borrado controlado) la abordo en cuanto Fase 1 esté validada.
