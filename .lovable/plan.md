Dos temas distintos que hay que atacar por separado.

## 1. "Solo 37 con 3 formularios abiertos"

Lo que veo en base de datos para la sesión del 29 de julio (`bceffbaf-…`):
- 4 formularios publicados: Villarrasa, Arahal, General compromisos, Córdoba.
- Solicitudes recibidas: 20 titulares + 17 acompañantes = **37 personas** → el "37" cuadra.
- Reparto real por formulario: Arahal 19, Villarrasa 1, General 0, Córdoba 0.
- Última solicitud: hoy 18:44. No hay más entrando después.

O sea el número está bien contado; el problema real es que muchísima gente está viendo la pantalla **"NO SE PUDO CARGAR EL FORMULARIO / Error temporal"** (la captura que reenviaste) y abandona sin inscribirse. Ese mensaje sale de `getPublicFormBySlug` cuando cualquiera de las lecturas al backend falla o supera el timeout del Worker.

Plan de estabilización del formulario público (`src/lib/forms.functions.ts` → `getPublicFormBySlug`):
- **Consulta única de arranque en paralelo**: hoy hace 4 queries secuenciales (form → event → sessions → legal_texts). Lanzarlas con `Promise.all` una vez conocido `event_id`/`session_id` para reducir latencia y ventana de fallo.
- **Reintento en el servidor** ante errores transitorios (`fetch failed`, `TimeoutError`, `502/503/504`) con 2 reintentos y backoff corto (~150ms/400ms) antes de devolver `error_temporal`.
- **Cache corto en el cliente**: subir `staleTime` a `60_000` en `useQuery` de `f.$formSlug.tsx` y añadir `refetchOnWindowFocus:false` para no recargar si el usuario cambia de pestaña.
- **Log estructurado**: en cada rama de error del servidor imprimir `slug`, `phase` (`form|event|sessions|legal`) y `code`, para poder ver en logs si el pico es en una tabla concreta.
- **Aviso al equipo en la UI admin**: en el panel de formularios de la sesión, mostrar bajo cada formulario el contador de solicitudes de las últimas 24h (ya lo tenemos calculado en `listEventForms` — basta con exponerlo) para que Javier vea de un vistazo cuáles reciben tráfico y cuáles no.

Con esto se reduce muchísimo la superficie de "error temporal" y, si vuelve a pasar, quedará claro en logs qué consulta se cae para poder atacarla en un segundo pase.

## 2. "No me crea el informe" (detalle Excel)

`exportReportDetailExcel` en `src/lib/report-export.ts` descarga TODOS los participantes / acompañantes / checkins / incidencias del **evento entero** con `.eq("event_id", eventId)` y luego filtra por sesión en memoria. Para El Perro Andaluz eso son miles de filas por 4 tablas → tiempo excedido / PostgREST cae → toast "Error generando detalle".

Plan:
- **Filtrar por sesión en la propia query** cuando `opts.sessionId` está definido:
  - `event_participants`: añadir `.eq("session_id", opts.sessionId)`.
  - `companions`: ya se hace por chunks de `participant_id`, queda igual (se beneficia automáticamente).
  - `checkins`: añadir `.eq("session_id", opts.sessionId)`.
  - `incidents`: añadir `.eq("session_id", opts.sessionId)`.
- **Bajar tamaño de página** de `fetchPaged` de 1000 a 500 (más resiliente a timeouts intermedios), manteniendo la paginación.
- **Reintento por página** ante error de red/timeout dentro de `fetchPaged` (2 intentos con espera corta), para que un blip no aborte todo el export.
- **Mensaje de error útil**: en el `catch` de `handleDetail` (`src/routes/_authenticated/informes.$eventId.tsx`) mostrar el mensaje real del error (`toast.error(e.message ?? "Error generando detalle")`) para que en el móvil se vea qué falló si vuelve a ocurrir.

No toco la lógica de negocio ni las hojas del Excel — solo cómo se traen los datos.

## Verificación

- Volver a abrir un formulario del 29-jul en incógnito varias veces seguidas: no debe caer al "error temporal".
- En Informes → sesión del 29-jul → botón "Excel detallado (titulares + acompañantes)": debe generar el `.xlsx` en pocos segundos.
- Repetir el detalle también con la sesión del 22-jul (la que ayer tuve que sacarte a mano) para confirmar que ya funciona desde la app.