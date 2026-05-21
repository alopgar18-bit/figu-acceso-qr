# Configuración de campos obligatorios por evento/sesión

## Objetivo
Eliminar la rigidez actual (DNI, email, teléfono, nombre, apellidos siempre obligatorios) y permitir que cada evento — y opcionalmente cada sesión — decida qué campos son visibles, obligatorios, opcionales u ocultos. Corregir además el mapeo automático del importador y el error `gen_random_bytes`.

## Alcance funcional
- Editor de **Evento**: nueva sección "Campos del formulario y requisitos" con matriz por campo (Mostrar / Obligatorio / Usar en importación / Usar en informes).
- Editor de **Sesión**: toggle "Heredar campos del evento". Si se desactiva, misma matriz a nivel sesión.
- **Formulario público** `/e/:slug/inscripcion`: se construye dinámicamente a partir de la config resuelta (sesión → evento → defaults).
- **Importador Excel/CSV**: 
  - Muestra "Requisitos de esta sesión" antes de importar (obligatorios / opcionales).
  - Solo exige mapeo de campos marcados como obligatorios+importables para esa sesión.
  - Corrige el auto-mapeo (`Apellido` → `last_name`, nunca a `dni`).
  - No genera QR durante la importación salvo `status = confirmado` **y** se cumplan los obligatorios.
  - Sustituye `gen_random_bytes` por `crypto.randomUUID()` en el backend (TS).
- **QR / Confirmación**: bloquea generación solo si faltan campos obligatorios *configurados para esa sesión*, con mensaje listando los campos.
- **Check-in**: no marca error por campos no obligatorios; alerta si falta uno obligatorio.
- **Informes**: incluye todos los campos disponibles; vacíos como "—", no como error.

## Campos base
`first_name, last_name, dni, email, phone, birth_date, photo_url, social_media, city, province, gender, profession, notes, special_needs, companions, consent_privacy, consent_participation, consent_image, consent_future_processes`

## Modelo de datos (migración)
Añadir dos columnas JSONB:

```sql
ALTER TABLE public.events
  ADD COLUMN field_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.event_sessions
  ADD COLUMN inherit_event_fields boolean NOT NULL DEFAULT true,
  ADD COLUMN field_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Forma del JSON (por campo):
```json
{
  "first_name": { "visible": true, "required": true,  "in_import": true,  "in_report": true },
  "dni":        { "visible": true, "required": false, "in_import": true,  "in_report": true },
  ...
}
```
Defaults sensatos (en código, no en BD): solo `first_name` requerido; el resto visible+opcional. Consentimientos: `consent_privacy` requerido por defecto, el resto opcionales.

## Resolución de config
Helper `resolveFieldRequirements(event, session?)`:
1. Empieza con defaults base.
2. Aplica `event.field_requirements`.
3. Si `session && !session.inherit_event_fields` → aplica `session.field_requirements` encima.

Se usa en: formulario público, importador (cliente+servidor), confirmación/QR, check-in, informes.

## Cambios por archivo (resumen)
- **migración** nueva en `supabase/migrations/`
- **`src/lib/field-requirements.ts`** (nuevo): tipos, defaults, `resolveFieldRequirements`, lista de campos.
- **`src/components/field-requirements-editor.tsx`** (nuevo): matriz reutilizable.
- **`src/components/event-form.tsx`**: añadir sección.
- **`src/components/session-form.tsx`**: toggle herencia + sección.
- **`src/routes/e.$slug.inscripcion.tsx`** + **`src/lib/public-forms.functions.ts`**: render dinámico, validación condicional.
- **`src/lib/import-constants.ts`**: arreglar `guessTarget` (separar `apellido` de `dni`, ya está, pero revisar normalización con/ sin "s").
- **`src/routes/_authenticated/importaciones.nueva.tsx`**: panel "Requisitos de esta sesión", validación según config, no exigir DNI globalmente.
- **`src/lib/imports.functions.ts`**: 
  - sustituir `gen_random_bytes` (en realidad usamos `crypto.getRandomValues`, revisar) por `crypto.randomUUID()`.
  - validar filas contra config resuelta del evento/sesión.
  - emitir QR solo si confirmado + cumple obligatorios.
- **`src/lib/confirmation.functions.ts`**: bloquear emisión de QR si faltan campos obligatorios.
- **`src/routes/_authenticated/control-acceso.$sessionId.tsx`**: tolerar campos vacíos.
- **`src/lib/report-export.ts`** / `informes.$eventId.tsx`: mostrar todos los campos, vacíos como "—".

## Lo que NO cambia
- No se tocan usuarios, ni se borran datos.
- No se modifica RLS (las columnas nuevas heredan políticas existentes).
- Datos actuales: tras la migración, todos los eventos quedan con `field_requirements = {}` → se aplican defaults (solo `first_name` requerido). Esto es intencional y coincide con la nueva regla.

## Validación post-cambio
1. Crear evento "demo" sin obligar DNI → importar el XLSX de ejemplo con solo nombre/apellido/teléfono/email → debe completarse sin errores.
2. Marcar DNI obligatorio en otro evento → mismo XLSX debe avisar "falta mapear DNI".
3. Formulario público de un evento sin DNI obligatorio → permite enviar sin DNI.
4. Confirmar participación sin campo obligatorio configurado → bloquea QR con mensaje.

## Tamaño estimado
1 migración + ~3 archivos nuevos + ediciones en ~8 archivos. Es un cambio mediano-grande pero acotado.
