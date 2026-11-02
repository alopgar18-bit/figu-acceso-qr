# Que las entradas abran bien ya (grabación en 1 hora)

## Diagnóstico (comprobado a las 18:30)
- Servidor y base de datos arriba: memoria 66 %, 16/60 conexiones, sin alertas ni reinicios, sin errores de la web en la última hora.
- La página de la entrada en sí es rápida: busca al invitado por su enlace con índice, y sus entradas y acompañantes también tienen índice.
- Lo que atasca la base de datos son pantallas del panel del equipo, que compiten con las entradas de los invitados:
  - Panel de inicio: cuenta inscritos, confirmados y accesos de **todas las sesiones** en cada visita. 2.471 veces, 1,5 s de media (hasta 3,8 s).
  - Accesos totales sin filtrar: 2,6 s. Recuentos por evento e informes: 4,3 s. Comunicaciones: 3–4 s, hasta 7,9 s.

## Ahora (antes de abrir puertas, unos 15 minutos)
1. **Panel de inicio**: sustituir las decenas de recuentos por sesión por una única consulta resumida en la base de datos, y solo para las próximas sesiones. Es la consulta que más carga genera.
2. **Recuento de accesos**: que nunca cuente todos los accesos de la historia; solo los de la sesión.
3. **Página de la entrada**: si tarda por un pico, reintentar sola un par de veces antes de mostrar error, con un mensaje claro ("Estamos cargando tu entrada, un momento") en lugar del error genérico.
4. Publicar y comprobar con 2–3 enlaces reales de entrada de la sesión de hoy que abren en menos de 1 segundo.

## Equipo, durante la grabación
- Cerrar pestañas de Panel de inicio, Comunicaciones, Informes y Solicitudes. Dejar solo control de acceso.
- No lanzar envíos, exportaciones Excel ni importaciones.
- Si un invitado no puede abrir la entrada: validarle por nombre/DNI en control de acceso.

## Después de la grabación
- Mismo arreglo (consulta resumida) para informes y listados de comunicaciones, sin recuento total exacto.
- Volver a medir las consultas lentas.

## Detalle técnico
- Nueva RPC `security definer` `public.dashboard_session_counts(_session_ids uuid[])` con comprobación `is_admin`, que devuelve por `session_id` total, confirmados y checkins en un solo `group by`; `dashboard.tsx` (líneas 83–137) la usa en lugar de `count: "exact"` por sesión.
- `checkins` siempre filtrado por `session_id`; índice `checkins(session_id)` si no existe.
- `c.$token.entrada.tsx` / `c.$token.tsx`: `retry` con espera corta en la carga y estado de "cargando" legible; sin cambios en `getConfirmation` ni en la lógica de estados.
- Sin cambios en estados, aforo ni comunicaciones.
