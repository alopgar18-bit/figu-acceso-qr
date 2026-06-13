## Objetivo

Que el email del **titular** incluya, al final, un bloque con cada acompañante mostrando su **nombre + QR embebido** (imagen), independientemente del toggle de "envío individual a acompañantes" (que se mantiene).

## Estado actual

`buildCompanionsBlocks` en `src/lib/bulk-send.functions.ts` ya genera un bloque HTML con la lista de acompañantes, pero solo con un enlace "Ver entrada", **sin la imagen del QR**. Además, el bloque solo aparece si la plantilla usa explícitamente `{{acompanantes_html}}` o `{{acompanantes}}`, cosa que muchas plantillas no hacen.

## Cambios

### 1. `src/lib/bulk-send.functions.ts`
- Modificar `buildCompanionsBlocks` para que cada item del HTML incluya:
  - Nombre del acompañante (+ asiento si lo hay).
  - Imagen `<img>` del QR usando `buildQrImageUrl(buildTicketUrl(token))` con tamaño compacto (~180px), alineada y con estilos inline email-safe.
  - Enlace "Ver entrada" debajo de la imagen como fallback.
- Si un acompañante no tiene ticket, mostrarlo sin QR (no romper el bloque).
- **Auto-append**: tras renderizar `body` con la plantilla, si el titular tiene acompañantes y el body resultante **no contiene** ya `acompanantes_html` ni `acompanantes` renderizados (heurística: comprobar antes del render si la plantilla incluye `{{acompanantes` ), concatenar `compBlocks.html` (o `compBlocks.text` para WhatsApp) al final del body. Así funciona automáticamente sin tocar plantillas.
- En WhatsApp, mantener el comportamiento texto-only (no imágenes), pero asegurando que el listado se añade al final si la plantilla no lo incluye.
- Añadir nuevo flag opcional `include_companions_in_titular` (default `true`) al `inputSchema` para poder desactivarlo desde la UI.

### 2. `src/routes/_authenticated/comunicaciones.envio.tsx`
- Añadir un segundo toggle independiente: **"Incluir acompañantes (nombre + QR) en el email del titular"**, ON por defecto.
- Pasar el nuevo flag a `queueBulkInvitations`.
- Mantener el toggle existente `sendPerCompanion` tal cual; ambos pueden combinarse.

### 3. Sin cambios
- Schema, plantillas existentes, hoja "Detalle" del informe, envío individual a acompañantes, WhatsApp/email flujos restantes.

## Resultado

Al enviar invitación masiva por email:
- El titular recibe **un email** con su propio QR y, al final, un bloque visible con el nombre y QR de cada acompañante.
- Si además está activo el toggle de envío individual, recibe **emails adicionales** (uno por acompañante) al mismo buzón. Los dos comportamientos son independientes.
