## 1. Excel jerárquico: PII y dónde descargarlo

La hoja **"Detalle"** del Excel **ya incluye** Tipo, Titular, Nombre, Apellidos, DNI, Email, Teléfono, Sesión, Estado, Zona, Fila, Asiento y Check-in. Cada titular va seguido de sus acompañantes indentados.

El problema es que **no es evidente desde dónde se baja**. Está en `Informes → [evento] → Descargar Excel`, pero la hoja "Detalle" aparece sin aviso dentro del mismo `.xlsx`.

**Cambios:**
- En `src/routes/_authenticated/informes.$eventId.tsx`, junto al botón "Descargar Excel" añadir un texto/tooltip: *"Incluye hoja Resumen, Sesiones, Asistentes, **Detalle (titulares + acompañantes)** e Incidencias"*.
- En `src/routes/_authenticated/informes.tsx` (listado de eventos), añadir un acceso directo "Descargar Excel" por evento.
- Respeta los permisos de visibilidad (PII) que ya están aplicados.

## 2. Envío individual a cada acompañante (ON por defecto)

Hoy `queueBulkInvitations` crea un correo por titular y mete a los acompañantes en un bloque dentro de ese correo. Pasamos a generar **un correo adicional por cada acompañante**, dirigido al email del titular, con el nombre del acompañante, su asiento y su QR/enlace individual.

**Backend — `src/lib/bulk-send.functions.ts`:**
- Añadir flag `send_per_companion: boolean` al `inputSchema` con **default `true`**.
- Cuando esté activo, tras encolar el correo del titular, iterar `compRows` y, por cada acompañante con `ticketByCompanion.get(c.id)`, crear un `communication_logs` adicional con:
  - `to_address`: email del titular (siempre).
  - `participant_id`: el del titular (para que aparezca en su histórico).
  - `metadata.companion_id` y `metadata.companion_name`: trazabilidad y dedupe.
  - Render del template con un `RenderContext` "centrado en el acompañante": `nombre`/`apellidos` = del acompañante, `qr` = token del ticket del acompañante, `qr_image`/`enlace_entrada` = `buildTicketUrl(token)` (página `t/$qrToken`), `acompanantes`/`acompanantes_html` = "" (para no listar al resto).
  - Dedupe: extender la query de `skip_already_queued` para considerar también logs previos cuyo `metadata->>companion_id` coincide.
- Resultado: nuevos contadores `queued_companions`, `skipped_no_companion_ticket`.

**Frontend — `src/components/send-communication-dialog.tsx`:**
- Toggle (Switch) **"Enviar también un correo individual por cada acompañante"**, **ON por defecto**.
- El valor se pasa como `send_per_companion` a `queueBulkInvitations`.
- En el toast/resumen final, mostrar también `queued_companions`.

**No se toca:**
- El template de email (sigue siendo el mismo); las variables `{{nombre}}`, `{{qr_image}}`, `{{enlace_entrada}}` se rellenan con los datos del acompañante en su correo.
- El modo "QR grupo": si no hay `companion_id` en tickets, no se encola nada por acompañante (skip silencioso).
- WhatsApp: en esta iteración el toggle solo aplica a canal email; deshabilitado para WhatsApp.

## Técnico

- Un único cambio en `bulk-send.functions.ts` (sin migración).
- `report-export.ts` no necesita cambios de columnas — solo UI/UX en las dos rutas de informes.
- Dedupe de companion logs vía `metadata->>'companion_id'` (filtro `.contains("metadata", { companion_id: c.id })` por chunks).
