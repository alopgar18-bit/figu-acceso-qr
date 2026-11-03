# Auditoría de rendimiento y limpieza de paneles

## Qué he encontrado

1. **Panel de inicio (dashboard)**: muestra recuentos globales de toda la historia (solicitudes, check-ins, incidencias) y una guía de "primeros pasos" que se vuelve a calcular **cada minuto** con unas 9 consultas a la base de datos. No aporta nada a la operativa diaria y carga la plataforma mientras alguien lo tenga abierto.
2. **Ficha de evento (listado de sesiones)**: los números por sesión se calculan descargando todos los participantes del evento. La base de datos solo devuelve 1.000 filas por consulta, así que en eventos grandes (30.000 inscritos) **los números salen cortados**. Además, "Check-ins" solo cuenta a quien tiene estado de acceso validado: **no suma los acompañantes ni las entradas por incidencia**. Por eso no coincide con quien asistió de verdad.
3. **Control de acceso**: se refresca cada 5 segundos y descarga todos los participantes y todos los check-ins de la sesión. Es la pantalla principal del día de grabación, así que **no se quita**; solo se aligera.
4. **Comunicaciones e Informes**: ya se optimizaron. Quedan algunos recuentos lentos de los registros de envíos (3–8 s) cuando se abre la pantalla sin filtrar por sesión.

5. **Entrada del invitado (lo que más reclamaciones genera)**: cada vez que un invitado abre su enlace, la plataforma consulta su entrada **entre 2 y 3 veces seguidas**: una al preparar la página, otra al mostrarla y otra más si entra por el enlace de confirmación y se le redirige. Cada una de esas consultas hace 6 lecturas a la base de datos, una detrás de otra. Cuando se envían cientos de correos o WhatsApps a la vez y todos abren el enlace en el mismo minuto, eso multiplica la carga por 15–18 y aparecen los errores. Ayer añadimos reintentos, pero no se ha quitado la causa.

## Propuesta

### 0. Prioridad 1: entradas que abran siempre
- **Una sola lectura por apertura**: los datos que se preparan al cargar la página se reutilizan al mostrarla, sin volver a pedirlos. La redirección desde el enlace de confirmación pasa los datos directamente.
- **Lectura agrupada en la base de datos**: participante, sesión, evento, diseño de la entrada, QR y acompañantes se piden en una única consulta, en lugar de 6 seguidas.
- **El diseño de la entrada se guarda en memoria unos minutos**, porque es igual para todos los invitados de una sesión.
- **Mensajes claros en lugar de errores**: "Enlace no válido", "Entrada anulada" y "Sesión ya celebrada (entrada histórica)" se muestran como páginas explicativas, no como fallos.
- **Revisión de enlaces enviados**: antes de cada envío masivo, la cola avisa si alguna plantilla tiene el enlace de entrada vacío o roto. Así no se repite el caso de los enlaces de cancelación vacíos.
- **Prueba de carga**: simular 500 aperturas simultáneas en la vista previa y medir tiempos antes y después.

### A. Quitar lo que no se usa
- **Panel de inicio**: lo sustituyo por una página sencilla de "Próximas sesiones": solo las 3–5 sesiones más cercanas, cada una con aforo, aprobados, asistentes reales y accesos directos a Control de acceso, Solicitudes e Informe. Sin refresco automático (hay un botón "Actualizar").
- **Guía de primeros pasos**: la elimino del panel. Ya conocéis la plataforma.
- **Recuentos globales históricos** (todas las solicitudes o check-ins de siempre): los elimino.

### B. Corregir los asistentes reales en los listados de sesiones
- Crear un único resumen por sesión calculado en la base de datos: solicitudes, aprobados, confirmados y **asistentes reales**. Asistentes reales = check-ins válidos + acompañantes validados + entradas por incidencia. Es el mismo criterio que ya usan los informes.
- Usarlo en la ficha de evento, en el listado de sesiones y en el nuevo panel de inicio. Así todos los números coinciden con el informe.

### C. Aligerar el control de acceso sin cambiar cómo funciona
- El refresco de cada 5 s pide solo el resumen de cifras, no todas las filas.
- La lista completa de asistentes se carga una vez y luego solo se piden los nuevos check-ins.
- El refresco se pausa cuando la pestaña no está visible.
- El escaneo y la validación de QR no se tocan.

### D. Pausar refrescos en segundo plano
- Ninguna pantalla administrativa vuelve a consultar la base de datos si la pestaña está oculta (Informes, Importaciones, Cola).

## Qué NO se toca
Formularios públicos, entradas de invitados, escaneo y validación, importaciones, envíos de email y WhatsApp, aforo, estados de participantes y butacas.

## Cuándo aplicarlo
Fuera de días de grabación. Publicar después de comprobar en la vista previa que las cifras de una sesión pasada (por ejemplo, la de ayer) coinciden con su informe.

## Detalles técnicos
- Nueva RPC `session_summary_counts(_session_ids uuid[])`, con SECURITY DEFINER y comprobación `is_admin`/asignación. Usa conteos agregados en el servidor e índices existentes y nuevos (`checkins(session_id, result)`). Sustituye a `useSessionStats` (está limitado a 1.000 filas) y a `dashboard_session_counts`.
- `dashboard.tsx`: reescritura mínima. Se quita `AdminOnboarding` y `useOnboardingState` (y `use-onboarding.ts` si no queda en uso).
- `use-access.ts`: dividir `useSessionDashboard` en una consulta de cifras (RPC, refresco de 5 s) y otra de filas (incremental por `checked_in_at`). Usar `refetchIntervalInBackground: false`.
- Revisar `slow_queries` antes y después para confirmar la mejora.
