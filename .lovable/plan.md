# Sesiones ordenadas, etiquetas en el asunto y vista previa por sesión

## 1. Sesiones de la más reciente a la más antigua
Todas las listas y desplegables de sesiones del panel (Sesiones, Envío masivo, Solicitudes, Informes, Control de acceso, Importaciones, Incidencias, Diseño de entradas, formularios, portal del cliente, asignación de equipo, inicio) pasan a ordenarse por fecha descendente.
Excepción: la página pública de inscripción `/e/$slug`, donde el público elige sesión, se mantiene en orden cronológico (primero la próxima). Dímelo si también la quieres invertida.

## 2. Nuevo campo de sesión "Inicio de grabación en directo"
- Campo nuevo en el formulario de sesión (hora, texto tipo "19:30"), junto a hora de acceso y hora fin.
- Nueva etiqueta `{{hora_directo}}` disponible en plantillas de email, WhatsApp asistido y en el listado de etiquetas del editor.
- Si la sesión no lo tiene relleno, la etiqueta queda vacía (y la vista previa avisa de "campo sin rellenar").
- Al duplicar una sesión se copia también.

## 3. Etiquetas en el asunto
- El editor de plantillas muestra las etiquetas disponibles también para el asunto y permite insertarlas ahí (`{{fecha}}`, `{{sesion}}`, `{{hora_acceso}}`, `{{hora_directo}}`…).
- El envío ya rellena el asunto por persona; se revisa que todas las etiquetas (incluidas las nuevas) se sustituyen igual en asunto y cuerpo, y que el envío de email nunca sale con `{{…}}` sin rellenar.
- Así una plantilla tipo "Tu invitación para {{evento}} · {{fecha}}" sirve para todas las semanas sin duplicarla.

## 4. Vista previa con selector de sesión
- En el editor de plantillas y en la vista previa de Envío masivo, un desplegable "Previsualizar con sesión" (ordenado de más reciente a más antigua).
- Al elegir sesión se rellenan asunto y cuerpo con sus datos reales (evento, fecha, horas, lugar, instrucciones) y un asistente de ejemplo de esa sesión (nombre, butaca, enlaces de entrada/cancelación) si lo hay.
- Las etiquetas que queden sin dato se resaltan para detectarlas antes de enviar.
- Solo lectura: la vista previa no crea envíos ni toca la cola.

## Detalles técnicos
- Migración: `ALTER TABLE event_sessions ADD COLUMN live_start_time text` (nullable, no rompe nada). Regenerar tipos.
- `session-form.tsx`, `sessions.functions.ts` (guardar), `duplicate-session-dialog.tsx` (copiar).
- `communication-constants.ts`: añadir `{{hora_directo}}` a la lista de etiquetas y a `renderTemplate`; `bulk-send.functions.ts` incluir `live_start_time` en el contexto; `supabase/functions/send-email` y `_shared/wati-format.ts` aceptar el alias (WhatsApp Business solo si la plantilla de Meta usa esa variable).
- Orden: cambiar `.order("starts_at", { ascending: true })` / `.order("starts_at")` a `ascending: false` en hooks y rutas listados, y ordenar en cliente los desplegables que agrupan sesiones.
- Vista previa: consulta ligera de una sesión + un participante de ejemplo con ticket; reutiliza `renderTemplate`.
- No se publica ni se despliega durante una sesión en curso.
