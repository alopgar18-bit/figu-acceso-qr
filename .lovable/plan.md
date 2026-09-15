# Por qué va lenta la plataforma y cómo evitarlo

## Qué ha pasado (comprobado en la base de datos ahora mismo)

El servidor está sano (memoria 60%, disco 35%, conexiones 15 de 60, sin reinicios). La lentitud no viene de falta de potencia, sino de **consultas repetidas muy pesadas** sobre el histórico de comunicaciones:

- La pantalla **Comunicaciones > Cola** lanza **7 consultas de recuento cada 5 segundos** mientras está abierta. Con una pestaña abierta se acumulan más de 11.000 ejecuciones.
- Cada uno de esos recuentos tarda de media **entre 1,4 y 2,3 segundos** (con picos de 8 s), porque recorre entero el histórico de comunicaciones (30.000 registros, 74 MB) sin un índice adecuado para el filtro que usa (canal + estado).
- Resultado: la base de datos pasa el día repitiendo las mismas cuentas lentas y **todo lo demás (informes, sesiones, formularios) se ralentiza detrás**.
- Además hay dos tablas internas creciendo sin limpieza: el historial de tareas programadas (161 MB) y las respuestas de llamadas externas (83 MB). Ocupan más que los propios datos del negocio y hacen el mantenimiento más lento.

También aparece como consulta pesada el listado de participantes por evento (5.000 ejecuciones, 1,2 s de media), usado en informes.

## Qué haremos para arreglarlo y que no se repita

### 1. Índices que faltan
Añadir índices pensados para los filtros reales:
- comunicaciones por canal + estado (+ fecha de envío)
- participantes por evento y por sesión
Con esto los recuentos pasan de segundos a milisegundos.

### 2. Un solo recuento en vez de siete
Sustituir las 7 consultas del aviso de cola por **una única función de servidor** que devuelva todas las cifras de golpe (ya existe una similar para la cola: se reutiliza el mismo enfoque).

### 3. Refresco inteligente
- Pasar el refresco de 5 s a **15 s**, y a **60 s** cuando no hay nada en curso.
- **Parar el refresco cuando la pestaña no está visible**, para que una pestaña olvidada no castigue la base de datos todo el día.

### 4. Limpieza y mantenimiento automático
- Tarea semanal que borra el historial de tareas programadas con más de 7 días y las respuestas de llamadas externas con más de 2 días.
- Limpieza inicial de lo ya acumulado (unos 240 MB).

### 5. Aviso de salud
Pequeña comprobación para detectar antes este patrón: si una pantalla repite la misma consulta lenta, queda registrado para revisarlo.

## Detalles técnicos

- Índices: `communication_logs (channel, status, sent_at DESC)`, `communication_logs (channel, status, created_at DESC)`, `event_participants (event_id, status)`, `event_participants (session_id, status)`.
- Nueva función `public.whatsapp_queue_status()` (SECURITY DEFINER, comprobación de admin) que devuelve locks, pendientes, enviados 2 h, fallidos, fallos de spam 24 h, último envío y ritmo 5 min en una sola llamada; `whatsapp-queue-status-banner.tsx` pasa a usarla.
- Polling con `document.visibilityState` y intervalo adaptativo (15 s activo / 60 s inactivo).
- Cron semanal: `delete from cron.job_run_details where end_time < now() - interval '7 days'` y purga de `net._http_response` > 2 días, más un borrado inicial.
- Sin cambios en la lógica de envío, estados de participante ni flujo de importación.
