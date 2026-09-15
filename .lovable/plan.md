# Arreglar la lentitud de la plataforma (ventana de mantenimiento)

La sesión de hoy ya ha terminado (402 accesos validados), así que se puede ejecutar todo el mantenimiento sin riesgo.

## Qué ha pasado (comprobado en la base de datos)

El servidor está sano: memoria 60%, disco 35%, conexiones 15 de 60, sin reinicios. **No falta potencia.**

La lentitud viene de consultas repetidas y pesadas sobre el histórico de comunicaciones:

- La pantalla **Comunicaciones > Cola** lanza **7 recuentos cada 5 segundos** mientras esté abierta en cualquier pestaña (más de 11.000 ejecuciones registradas).
- Cada recuento tarda **1,4-2,3 s de media** (picos de 8 s): recorre entero el histórico (30.000 registros, 74 MB) porque falta un índice para el filtro canal+estado.
- Con una pestaña olvidada abierta, la base de datos repite esas cuentas todo el día y todo lo demás (informes, sesiones, formularios) se ralentiza detrás.
- Dos tablas internas crecen sin limpieza: historial de tareas programadas (161 MB) y respuestas de llamadas externas (83 MB); juntas ocupan más que los datos del negocio.

## Qué haremos ahora

1. **Índices que faltan** para comunicaciones (canal + estado + fecha) y participantes (evento/sesión + estado). Los recuentos pasan de segundos a milisegundos.
2. **Un solo recuento en vez de siete**: una función de servidor que devuelve todas las cifras del aviso de cola en una única llamada.
3. **Refresco inteligente** en esa pantalla: 15 s mientras hay envíos en curso, 60 s en reposo y **parada total cuando la pestaña no está visible**, para que una pestaña olvidada no vuelva a castigar la base de datos.
4. **Limpieza automática semanal** del historial de tareas y de respuestas externas, más una purga inicial de lo acumulado (~240 MB).
5. **Verificación**: medir de nuevo las consultas más lentas y confirmar que la pantalla de cola responde por debajo de medio segundo.

No se toca nada del flujo de envíos, estados de participante, importaciones ni control de acceso.

## Detalles técnicos

- Índices: `communication_logs (channel, status, sent_at DESC)`, `communication_logs (channel, status, created_at DESC)`, `event_participants (event_id, status)`, `event_participants (session_id, status)`.
- Nueva `public.whatsapp_queue_status()` (SECURITY DEFINER + comprobación de admin, patrón de `comm_queue_counts`) que devuelve locks, pendientes, enviados 2 h, fallidos 2 h, fallos de spam 24 h, último envío y ritmo 5 min en una sola llamada; `whatsapp-queue-status-banner.tsx` la consume y añade control por `document.visibilityState`.
- Cron semanal: purga de `cron.job_run_details` > 7 días y de `net._http_response` > 2 días, más borrado inicial por lotes.
- Verificación con `pg_stat_statements` tras aplicar los cambios.
