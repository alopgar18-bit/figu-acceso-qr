## Problema

En **Comunicaciones → Envío masivo**, al elegir el canal **WhatsApp Business** el desplegable de plantillas aparece vacío ("No hay plantillas activas para este canal"), por lo que no puedes seleccionar `entrada_grabacin` y no se puede lanzar el envío.

Causa: la tabla `communication_templates` no tiene ninguna fila con `channel = 'whatsapp_business'`. La edge function `send-whatsapp` ya está cableada para usar siempre la plantilla aprobada en Wati (`entrada_grabacin`), pero la UI exige seleccionar una plantilla del catálogo antes de encolar.

## Solución

Crear (sembrar) en la base de datos la plantilla `entrada_grabacin` para que aparezca en el selector y se pueda usar en el envío masivo. No hay que tocar la edge function ni el flujo de envío.

### Pasos

1. **Migración SQL** que inserta en `communication_templates`:
   - `name`: `entrada_grabacin`
   - `channel`: `whatsapp_business`
   - `is_active`: `true`
   - `subject`: null
   - `body`: texto literal de la plantilla Wati (el mismo que ya existe en `src/lib/whatsapp-template.ts`) para que la previsualización funcione.
   - `variables`: lista de variables Wati (`nombre`, `programa`, `fecha`, `hora_acceso`, `hora_inicio`, `hora_fin`, `zona`, `fila`, `asiento`, `lugar`, `enlace_entrada`).
   - Idempotente (`ON CONFLICT (name) DO NOTHING` o equivalente).

2. **Verificación**: tras la migración, en `/comunicaciones/envio` con canal WhatsApp Business aparecerá `entrada_grabacin` en el selector, se mostrará la previsualización y el botón "Crear cola" quedará habilitado. El envío real ya usa la plantilla aprobada de Wati.

### Notas

- No se modifica la edge function `send-whatsapp` (sigue forzando `entrada_grabacin` como `template_name`, lo correcto).
- No se modifica `send-communication-dialog` ni el componente de envío masivo.
- Si más adelante se aprueban en Wati más plantillas, se añadirán como filas adicionales con el mismo patrón.
