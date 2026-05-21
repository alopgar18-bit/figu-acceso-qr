# Envío masivo de invitaciones con QR

Ampliar el módulo de comunicaciones para permitir, desde una importación / sesión / evento, enviar invitaciones individuales con QR a todos los participantes seleccionados, con cola y reintentos. Incluye correcciones al mapeo de importación y limpieza de DNIs mal mapeados.

## Alcance

1. **Corrección de mapeo de importación**
   - `src/lib/import-constants.ts`: en `guessTarget`, ignorar "Marca temporal", "Timestamp", "Fecha de envío" (no mapear a `dni`).
   - Aviso en el wizard si una columna detectada como `dni` contiene valores tipo fecha.
   - Acción admin en detalle de importación: **"Limpiar DNI con marcas temporales"** que vacía `people.dni` cuando coincide con regex de fecha (sin borrar personas ni participaciones).

2. **Generación de QR en lote** (sin `gen_random_bytes`)
   - Nueva server function `generateMissingTickets({ event_id, session_id, participant_ids? })`.
   - Para cada participante sin ticket activo crea fila en `tickets` con `qr_token = gen_random_uuid()` concatenado.
   - No exige DNI/email/teléfono. Devuelve `{ generated, skipped, errors }`.

3. **Asistente de envío masivo** (`/comunicaciones/envio`)
   - Paso 1 — Destinatarios: filtros por evento, sesión, import_batch_id, estado, tiene email, tiene QR, estado de envío. Resumen con conteos.
   - Paso 2 — QR: detecta cuántos faltan, botón "Generar QR faltantes".
   - Paso 3 — Plantilla: selector de plantilla activa. Botón "Crear plantilla sugerida" que inserta **"Invitación público — El Perro Andaluz"**.
   - Paso 4 — Previsualización con datos reales del primer destinatario, conteo de omitidos.
   - Paso 5 — Crear cola: inserta filas en `communication_logs` con estado `pendiente` (renderiza subject/body). Si Gmail no configurado, queda en `pendiente` con aviso.
   - Paso 6 — Resultado por estado.

4. **Plantilla con fallback de nombre vacío**
   - Extender `renderTemplate`: si `nombre` está vacío, reemplazar "Hola {{nombre}}," → "Hola,".

5. **Botones de entrada**
   - Detalle de importación → "Enviar invitaciones a esta importación" (preselecciona `import_batch_id`).
   - Detalle de sesión → "Enviar invitaciones a esta sesión".
   - En lista de participantes: "Ver entrada", "Copiar enlace de entrada", "Reenviar invitación".

6. **Cola de envíos** (`/comunicaciones/cola`)
   - Tabla con destinatario, estado, error, fecha, acción "Reintentar" (resetea estado a `pendiente`).

7. **Gmail**
   - Solo detección. Si no hay secrets `GMAIL_*`, banner "Gmail no configurado" con instrucciones. No implementar OAuth ahora.
   - Botón "Exportar CSV de la cola" como workaround para envío manual.

## Lo que NO se toca

- No se cambian usuarios, roles, formularios públicos ni informes.
- No se borra ningún dato existente.
- No se hacen DNI/email/teléfono obligatorios globales.
- No se activa WhatsApp API ni modo offline.
- No se implementa OAuth de Google ahora (solo el andamiaje de cola).

## Migración SQL necesaria

- Añadir a `communication_logs`: `batch_id uuid` (referencia lógica a `import_batches`) para poder filtrar por importación.
- Índice en `(event_id, session_id, status)`.
- Confirmar que no hay residuos de `gen_random_bytes` (ya verificado).

## Archivos a crear / editar

- crear: `src/lib/tickets.functions.ts`, `src/lib/bulk-send.functions.ts`, `src/routes/_authenticated/comunicaciones.envio.tsx`, `src/routes/_authenticated/comunicaciones.cola.tsx`
- editar: `src/lib/import-constants.ts`, `src/lib/communication-constants.ts`, `src/routes/_authenticated/importaciones.$batchId.tsx`, `src/routes/_authenticated/eventos.$eventId.sesiones.$sessionId.tsx`, `src/routes/_authenticated/comunicaciones.tsx`, `src/components/app-sidebar.tsx`
- migración: nueva en `supabase/migrations/`
