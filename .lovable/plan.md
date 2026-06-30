# Por qué la plantilla `entrada_grabacin` no muestra Zona/Fila/Asiento

La plantilla SÍ tiene los placeholders `{{zona}}`, `{{fila}}`, `{{asiento}}`, pero el motor de envío no los rellena:

- En `src/lib/bulk-send.functions.ts`, las consultas a `event_participants` NO traen los campos `seat_zone / seat_row / seat_number` (sí los traen para `companions`, no para el titular).
- El tipo `RenderContext` en `src/lib/communication-constants.ts` tampoco tiene `zona / fila / asiento`, así que aunque se pasaran, `renderTemplate()` los dejaría vacíos por tipo.
- La previsualización en `comunicaciones.envio.tsx` sí los rellena ad-hoc (líneas 663-665), por eso el problema no era visible al previsualizar con un asistente con asiento — pero al encolar el envío real, llegaban vacíos.

Resultado: cualquier envío masivo (email o WhatsApp) usando una plantilla con `{{zona}}/{{fila}}/{{asiento}}` deja esas líneas en blanco para el titular. Los acompañantes sí salen bien porque su flujo aparte ya carga el asiento.

# Cambios a aplicar (mínimos, sin tocar UI)

## 1. `src/lib/communication-constants.ts`
Añadir al `RenderContext`:
```ts
zona?: string | null;
fila?: string | null;
asiento?: string | null;
```
Añadir a `WHATSAPP_VARIABLES` / `EMAIL_VARIABLES` los tres tokens con descripción ("Zona del asiento", etc.) para que se vean en la lista de variables del editor.

## 2. `src/lib/bulk-send.functions.ts`
- En `queueBulkSend` (línea ~155 y ~163): añadir `seat_zone, seat_row, seat_number` al `select` de `event_participants` y al tipo `PartRow`.
- En `resendInvitations` (línea ~576): mismo añadido.
- Al construir cada `ctx` (líneas ~300 y ~725) añadir:
  ```ts
  zona: p.seat_zone ?? "",
  fila: p.seat_row ?? "",
  asiento: p.seat_number ?? "",
  ```
- Para los acompañantes, ya tenemos `c.seat_zone/row/number`: añadir los mismos campos al `compCtx` para que la plantilla también muestre el asiento del acompañante (líneas ~390 y ~785).

## 3. Verificación
1. Previsualizar la plantilla `entrada_grabacin` con un asistente que tenga asiento asignado → debe mostrar Zona/Fila/Asiento (ya funcionaba).
2. Encolar un envío real de prueba a un destinatario con asiento y comprobar en `communication_logs.body` que el cuerpo ya incluye los valores (no `Zona: \nFila: \n`).
3. Para Javier (test pendiente del 2/07): tras aprobarlo y reenviar, debe ver su zona/fila/asiento.

No requiere cambios en BD, ni en plantillas, ni en la UI de envío. Solo en el renderizado del cuerpo en el backend.
