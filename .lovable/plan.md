# Estabilidad durante la sesión de hoy + plan de arreglo

## Qué está pasando (comprobado ahora en la base de datos)

El servidor está sano: memoria 60%, disco 35%, conexiones 15 de 60, sin reinicios, base de datos respondiendo en 17 ms. **No falta potencia.**

La lentitud viene de consultas repetidas y pesadas sobre el histórico de comunicaciones:

- La pantalla **Comunicaciones > Cola** lanza **7 recuentos cada 5 segundos** mientras esté abierta en cualquier pestaña. Se han registrado más de 11.000 ejecuciones.
- Cada recuento tarda **1,4-2,3 s de media** (picos de 8 s) porque recorre entero el histórico (30.000 registros, 74 MB): falta un índice para el filtro canal+estado.
- Con una pestaña olvidada abierta, la base de datos repite esas cuentas todo el día y el resto (informes, sesiones, formularios) se ralentiza detrás.
- Dos tablas internas crecen sin limpieza: historial de tareas programadas (161 MB) y respuestas de llamadas externas (83 MB). No afectan hoy, pero conviene purgarlas.

El escaneo de acomodadores usa tablas distintas y pequeñas (entradas y check-ins), así que hoy no es el origen del problema.

## AHORA MISMO (0 riesgo, sin desplegar nada)

Recomendación para las próximas 2 horas: **no desplegar cambios**. Solo esto:

1. **Cerrar todas las pestañas de Comunicaciones > Cola** (tuyas y del equipo). Es la causa principal y el alivio es inmediato.
2. No abrir informes ni exportaciones a Excel mientras se escanea: son las otras consultas pesadas.
3. Mantener abierta solo la pantalla de control de acceso/escaneo.

Con eso la aplicación debería responder con normalidad para el escaneo.

## Opcional durante la sesión (bajo riesgo, si sigue lenta)

Crear los índices que faltan **sin bloquear escrituras** (creación en caliente). No detiene el escaneo ni los envíos; solo consume algo de CPU unos segundos sobre una tabla que no interviene en el control de acceso. Solo lo hago si me lo pides expresamente y si tras cerrar las pestañas sigue lenta.

## Después de cerrar puertas (ventana de mantenimiento)

1. **Índices definitivos** para comunicaciones (canal+estado+fecha) y participantes (evento/sesión+estado).
2. **Un solo recuento en vez de siete**: una función de servidor que devuelva todas las cifras del aviso de cola en una llamada.
3. **Refresco inteligente**: 15 s en curso, 60 s en reposo, y **parada total cuando la pestaña no está visible**, para que una pestaña olvidada no vuelva a castigar la base de datos.
4. **Limpieza automática semanal** del historial de tareas y de respuestas externas, más una purga inicial (~240 MB).

## Detalles técnicos

- Índices: `communication_logs (channel, status, sent_at DESC)`, `communication_logs (channel, status, created_at DESC)`, `event_participants (event_id, status)`, `event_participants (session_id, status)`. Si se aplican en caliente, con `CREATE INDEX CONCURRENTLY` fuera de migración transaccional; después de la sesión, como migración normal.
- Nueva `public.whatsapp_queue_status()` (SECURITY DEFINER + comprobación de admin) que devuelve locks, pendientes, enviados 2 h, fallidos, fallos de spam 24 h, último envío y ritmo 5 min en una sola llamada; `whatsapp-queue-status-banner.tsx` la consume y añade control por `document.visibilityState`.
- Cron semanal: purga de `cron.job_run_details` > 7 días y `net._http_response` > 2 días.
- Sin cambios en lógica de envío, estados de participante, importaciones ni flujo de escaneo.
