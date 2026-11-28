# Nuevos textos: Entrada y Lista de espera

## Qué se cambia
Solo el contenido de dos plantillas de correo HTML que ya existen (no se toca código ni el envío):

- **INVITACION** — asunto actual "Tu invitación para {{evento}} {{fecha_larga}}" (se mantiene).
- **LISTA DE ESPERA** — asunto nuevo: "Tu invitación está en estado pendiente para {{evento}} {{fecha_larga}}".

Las plantillas antiguas de fechas concretas (22.10, 15.10…) no se tocan.

## Texto 01 — Entrada (con etiquetas)
- Título: Tu invitación para {{evento}} {{fecha_larga}}
- "¡Ya queda menos para formar parte de la grabación en directo del programa {{evento}}!" + párrafo de ilusión.
- "La grabación será {{fecha_larga}}"
- Horario con viñetas "• ":
  - Apertura de puertas: {{hora_acceso}} h
  - Inicio de la grabación aproximado: {{hora_inicio}} h
  - Inicio de la grabación en directo: {{hora_directo}} h
  - Finalización estimada: {{hora_fin}} h
- Aviso de horarios orientativos.
- Lugar de grabación: {{ubicacion}}. {{direccion}}
- Mayores de 18, asistencia gratuita.
- Entrada: enlace inline "Pulsa aquí" + botón teal "Descargar mi entrada" a {{enlace_entrada}}; se conservan {{acompanantes_html}} si estaba en la plantilla actual.
- "En caso de no poder acudir, indícalo en la parte inferior de tu código QR…"
- Cierre: "Gracias por formar parte del público de {{evento}}."

## Texto 02 — Lista de espera / En reserva
- Título: Tu invitación está en estado pendiente para {{evento}} {{fecha_larga}}.
- Aforo limitado + enlace al formulario https://16escalones.es/publico/ (como botón/enlace).
- Hoy se han enviado las invitaciones; las entradas liberadas se asignan a los siguientes de la lista.
- Si hay asientos se comunicará; sin correo con entrada y QR no hay acceso al teatro.
- Cierre con {{evento}}.

## Correcciones mínimas de redacción
Corrijo erratas sin cambiar el sentido ("Condigo" → "código", "no tiene de acceso" → "no tendrá acceso", "dispongamos asientos" → "dispongamos de asientos", "no pueda" → "no puedan"). Se unifica el trato de "tú" como el resto de la plataforma (el texto mezcla "tú" y "usted").

## Formato
Mismo diseño que las plantillas actuales: tablas 600px, Arial, CSS inline, logo y color teal #0d7377, sin subrayados en la apertura.

## Comprobación
- Guardar las dos plantillas, abrir la vista previa con la sesión del 3 de diciembre y confirmar que fecha, horas y lugar salen con los datos de esa sesión y el enlace de entrada funciona.
- No se envía ningún correo.

## Detalle técnico
Actualización de `body` y `subject` en `communication_templates` (ids 8106df3d… y 861a81cb…), conservando el resto de etiquetas del HTML actual.
