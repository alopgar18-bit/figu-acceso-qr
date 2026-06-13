## Objetivo

Que el botón **2 · Generar QR faltantes** del envío masivo cree también un ticket por cada acompañante registrado, siempre que la sesión esté configurada en modo `qr_propio` (un QR por persona). En sesiones `mismo_qr` no se generan QR de acompañantes (solo el del titular/grupo), respetando la configuración.

## Cambios

### 1. `src/lib/tickets.functions.ts` — `generateMissingTickets`

Reescribir el handler para que, además del titular:

1. Lea la sesión y obtenga `companions_qr_mode`.
2. Cargue todos los `companions` de los participantes objetivo.
3. Cargue los `tickets` activos agrupados por `(participant_id, companion_id)` — no solo por `participant_id` como ahora.
4. Para cada participante sin ticket de titular: insertar el ticket de titular (igual que hoy, con `qr_payload.kind = "titular"` cuando hay acompañantes, o `"grupo"` cuando es `mismo_qr`).
5. Si `companions_qr_mode = "qr_propio"`: para cada `companion` sin ticket activo asociado a su `companion_id`, insertar un ticket con `participant_id`, `companion_id`, `qr_token`, `qr_payload = { kind: "acompanante", index }`.
6. Devolver contadores ampliados: `{ generated_titulars, generated_companions, skipped_titulars, skipped_companions, mode, errors }`.

Mantener el límite de inserción razonable (batch de 5000 participantes ya existente). Reutilizar `genToken()`.

### 2. `src/routes/_authenticated/comunicaciones.envio.tsx`

- En el query `ticketsQ`, contar también los QR de acompañantes para el resumen (opcional; mínimo, no romper el conteo actual de "Sin QR" del titular).
- En `handleGenerateMissingQr`, mostrar en el toast los dos contadores: `Generados X titulares y Y acompañantes (Z ya existían)`. Si la sesión es `mismo_qr`, añadir una nota: "Sesión en modo 'un QR para el grupo': no se generan QR por acompañante".
- (Opcional, pequeño) Añadir bajo el botón un texto explicativo que aclare el comportamiento según el modo de la sesión.

### 3. Coherencia con el resto

- `bulk-send.functions.ts` ya está preparado: lee `tickets` con `companion_id` y construye `ticketByCompanion`. En cuanto existan esos tickets, el toggle "Enviar también un correo individual por cada acompañante" y el bloque "Incluir acompañantes (nombre + QR) en el email del titular" funcionarán automáticamente.
- No se tocan `confirmation.functions.ts` (ya genera correctamente al confirmar desde el enlace público) ni el esquema de BD.

## Resultado esperado

Tras pulsar **Generar QR faltantes** en una sesión `qr_propio` con participantes importados:

- Cada titular tendrá su ticket.
- Cada acompañante registrado tendrá su propio ticket con `companion_id`.
- Al enviar con cualquiera de los dos toggles de acompañantes, los QR se incluyen / se mandan por separado sin caer en `skipped_no_companion_ticket`.
