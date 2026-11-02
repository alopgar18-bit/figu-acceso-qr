# Rendimiento: entradas que no abren (grabación en 1 hora)

## Diagnóstico (comprobado a las 18:28)
- Servidor y base de datos arriba: memoria 66 %, disco 38 %, 16/60 conexiones, sin alertas de agotamiento ni reinicios.
- Sin errores registrados en la última hora en el servidor de la web.
- Lo que sí carga la base de datos son pantallas del panel de administración, no las entradas:
  - Panel de inicio (dashboard): cuenta inscritos, confirmados y accesos de **cada sesión** en cada visita. 2.471 llamadas, 1,5 s de media (hasta 3,8 s).
  - Comunicaciones (logs y cola): 3–4 s por carga, hasta 7,9 s.
  - Recuentos por evento e informes: 4,3 s de media.
  - Recuento de accesos (checkins) completo: 2,6 s.
- Cuando varias de estas pantallas están abiertas a la vez, la base de datos se satura y la página de la entrada de los invitados tarda o falla.
- Sin confirmar: si alguno de los avisos de invitados viene de una entrada de sesión ya pasada ("Evento cerrado") o de un enlace mal formado. Primer paso: pedir 1–2 enlaces concretos y comprobarlos.

## Fase 1 — Ahora, sin publicar nada (hasta cerrar puertas)
1. Equipo: cerrar todas las pestañas del Panel de inicio, Comunicaciones, Informes y Solicitudes. Dejar abierta solo la pantalla de control de acceso.
2. No lanzar envíos masivos, exportaciones Excel ni importaciones durante la grabación.
3. Comprobar en directo 2–3 enlaces de entrada de invitados que han llamado (con su nombre o enlace) y medir el tiempo de carga.
4. Si un invitado no puede abrirla: el acomodador puede validarle por nombre/DNI en control de acceso.

## Fase 2 — Después de la grabación (requiere publicar)
1. Panel de inicio: sustituir los recuentos por sesión por una única consulta resumida en el servidor, y mostrar solo próximas sesiones.
2. Comunicaciones: limitar los listados a los últimos registros con paginación real y sin recuento total exacto.
3. Recuentos de informes y accesos: usar funciones resumidas de la base de datos con índices por sesión/evento.
4. Página de entrada del invitado: revisar que solo hace las lecturas mínimas y añadir un mensaje claro de "reintentar" si tarda.
5. Volver a medir las consultas lentas y confirmar que bajan a menos de 200 ms.

## Detalle técnico
- Consultas lentas detectadas: `count exact` de PostgREST sobre `event_participants` por `session_id`/`event_id`, `checkins` sin filtro, y `communication_logs` con joins laterales y orden por `created_at`. Evaluadas bajo RLS (función de admin por fila).
- Origen principal: `src/routes/_authenticated/dashboard.tsx` (líneas 83–137) y pantallas de comunicaciones.
- Solución: RPCs `security definer` con comprobación de admin que devuelvan conteos agregados (`group by session_id`), `count: "estimated"` o sin recuento en listados, e índices compuestos donde EXPLAIN muestre seq scan.
- No se despliega ningún cambio durante la sesión.
