# Envío de comunicaciones sin QR

## Problema

Hoy, al "Crear cola" en Comunicaciones, el cliente fuerza `only_with_ticket: true`. Por eso los rechazados de aforo completo (que no tienen ticket porque nunca se les generó QR) se descartan como "sin QR" y la cola queda vacía. El servidor (`queueBulkInvitations`) ya soporta `only_with_ticket: false`; sólo falta exponerlo en la UI y evitar romper plantillas que sí dependen del QR.

## Cambios

### 1. UI · nuevo toggle "Permitir envíos sin QR/entrada"
En `src/routes/_authenticated/comunicaciones.envio.tsx`, dentro del bloque "5 · Crear cola de envío":

- Añadir checkbox **"Permitir envío a destinatarios sin QR"** (estado `allowWithoutTicket`, por defecto `false` para no cambiar el comportamiento actual).
- Pasar `only_with_ticket: !allowWithoutTicket` al `queueFn` en `handleQueue`.
- Cuando está activado:
  - Mostrar aviso amarillo: *"Las variables `{{enlace_entrada}}`, `{{zona}}`, `{{fila}}`, `{{asiento}}` se enviarán vacías en los destinatarios sin QR. Úsalo para avisos como aforo completo, lista de espera o cancelaciones."*
  - Detectar si la plantilla seleccionada usa `{{enlace_entrada}}` / `{{qr_url}}` / `{{zona}}` / `{{fila}}` / `{{asiento}}` y, si las usa, mostrar warning extra ("la plantilla incluye datos de entrada; los destinatarios sin QR los recibirán en blanco").
  - Forzar `send_per_companion: false` e `include_companions_in_titular: false` mientras esté activo (los acompañantes sólo tienen sentido con QR).

### 2. Contador de destinatarios coherente
El botón "Crear cola (N destinatarios)" calcula N como `effectiveParticipants.length` filtrado por email. Cuando `allowWithoutTicket = false`, restar también los `withoutTicket` para que el número coincida con lo que el servidor encolará. Cuando es `true`, mantener `effectiveParticipants.length` (con email).

### 3. Plantilla "Aforo completo / Rechazo" sugerida
Añadir un botón "Crear plantilla sugerida — Aforo completo" análogo a `handleCreateSuggestedTemplate`, que inserte una plantilla email sin variables de QR:

- Asunto: *"{{evento}} — Información sobre tu solicitud"*
- Cuerpo: el texto que ya usas para el 30 de junio (Estimado/a {{nombre}}, no se ha podido confirmar la plaza, lista de espera, etc.), con sólo `{{nombre}}`, `{{evento}}`, `{{sesion}}`, `{{fecha}}`.

### 4. Filtro rápido por estado
En el bloque "1 · Filtros" añadir chip rápido **"Solo rechazados / lista de espera"** que preselecciona los estados `rechazado` y `lista_espera`, para localizar rápido el público objetivo de este envío sin QR.

### 5. Documentación en pantalla
Texto corto bajo el toggle: *"Casos típicos: aforo completo, lista de espera, cancelaciones, recordatorios genéricos."*

## Detalles técnicos

- `queueBulkInvitations.inputSchema` ya admite `only_with_ticket` (default `true`). No requiere migración ni cambio en el servidor.
- `renderTemplate` (en `bulk-send.functions.ts`) reemplaza variables ausentes por cadena vacía, así que las plantillas sin QR no romperán.
- El validador `participant_ids ≤ 2000` ya está chunked en `handleQueue` (cambio anterior); se mantiene.
- `only_with_email` sigue ligado al canal (email vs whatsapp), no se toca.
- Sin cambios de BD, sin migración, sin tocar `communication_logs`.

## Resultado esperado

- En el envío del 30 de junio: seleccionas estado "Rechazado", eliges la plantilla de aforo completo, marcas "Permitir envío sin QR" y la cola se crea con los rechazados (con email) aunque no tengan ticket.
- Comportamiento por defecto sin marcar el toggle = idéntico al actual: sigue exigiendo QR para invitaciones.
