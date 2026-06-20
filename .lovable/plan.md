# Por qué aparece "Esta página no se cargó"

Esa pantalla **no es un diseño nuestro**: es el **fallback de emergencia del servidor** (`src/lib/error-page.ts` + envoltorio en `src/server.ts`). Solo se muestra cuando el worker que sirve la web **no consigue renderizar la página en el servidor** (SSR) y devuelve un HTTP 500. Lo que ves en español ("Esta página no se cargó / Intentar otra vez / Ir a casa") es la traducción automática del navegador del texto inglés original ("This page didn't load / Try again / Go home").

En los logs del worker de la última hora **no hay ningún 500 registrado** en `/f/...`, todas las peticiones han devuelto 200. Eso, junto con que te ocurre de forma **intermitente**, encaja con una de estas tres causas típicas:

1. **Cold start / despliegue en curso**: si justo al cargar coincide con un redeploy o el worker arranca en frío, la primera request puede fallar antes de inicializar.
2. **Red móvil inestable**: una respuesta cortada se interpreta como error de carga.
3. **Excepción puntual durante el render SSR** del formulario (`/f/$formSlug`) que el sistema engulle sin loguearla porque la ruta **no tiene `loader` ni `errorComponent`**, así que cualquier throw durante el render del servidor llega al fallback del worker sin dejar rastro útil.

La causa #3 es la única sobre la que podemos actuar. Y de paso, conviene asegurarse de que un error futuro **sí quede registrado** para diagnosticarlo si vuelve.

## Plan de acción

### 1. Blindar la ruta `/f/$formSlug`
- Añadir `errorComponent` y `notFoundComponent` propios (ahora mismo no los tiene), con un mensaje claro en español y botón "Intentar otra vez" + "Ir al inicio". Así, si el render falla, el usuario ve **nuestra** pantalla (con marca FIGURARTE) en lugar del fallback genérico del worker.
- Envolver el `head()` para que nunca pueda lanzar (params son strings, pero por si acaso).
- Mover la carga del formulario a un `loader` con `ensureQueryData` (patrón canónico TanStack). Beneficio: si `getPublicFormBySlug` falla, salta a `errorComponent` con stack trace en logs, en vez de pintar y luego romper en cliente.

### 2. Hacer `getPublicFormBySlug` y `submitPublicFormBySlug` defensivos
- Revisar que ambas server functions **capturen errores externos** (Supabase, validaciones) y devuelvan un shape tipado `{ ok: false, code }` en lugar de hacer throw. Hoy un throw en SSR cae al fallback del worker.
- Loguear con `console.error(error)` el `Error` crudo dentro del `.handler()` para que aparezca en Server Logs.

### 3. Diagnóstico instantáneo si vuelve a pasar
- Añadir, dentro del wrapper de SSR (`src/server.ts`), un `console.error` extra con la URL y el `request-id` cuando se devuelva el fallback, para correlacionar el incidente con los logs.
- Comprobar que el listener global de errores (`src/lib/error-capture.ts`) está armado y consumiendo el último error capturado al construir el fallback.

### 4. Verificación
- `bunx tsc --noEmit` para asegurar tipos.
- Cargar `/f/<slug-real>` 5-10 veces seguidas en sandbox con Playwright + recargas en frío para forzar cold start y confirmar que devuelve 200 siempre.
- Si vuelve a aparecer la pantalla, ya tendremos el stack trace en Server Logs y podremos corregir la raíz exacta en el siguiente turno.

## Detalle técnico (interno)

- Ruta afectada: `src/routes/f.$formSlug.tsx` (sin `loader`, sin `errorComponent`).
- Wrapper: `src/server.ts` + `src/lib/error-page.ts` (genera el HTML que ves).
- Server fns a endurecer: `src/lib/forms.functions.ts` (`getPublicFormBySlug`) y `src/lib/public-forms.functions.ts` (`submitPublicFormBySlug`).
- No tocamos lógica de negocio del formulario ni el envío real; solo capas de carga, error y logging.

## Lo que NO voy a hacer
- No cambiar el diseño del formulario ni los campos.
- No tocar el flujo de envío ni la validación de datos del solicitante/acompañantes.
- No modificar nada relacionado con validación de acceso, aforo o exportación de informes.
