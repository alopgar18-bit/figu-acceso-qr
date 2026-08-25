# Revisión y corrección completa del error recurrente en producción

## Diagnóstico confirmado

- La pantalla actual no identifica la causa real: el límite global de `src/routes/__root.tsx` presenta cualquier excepción de React, autenticación, datos o código como si fuera una versión antigua. Por eso «Cargar versión actual» puede reaparecer aunque no haya ningún problema de caché.
- Los formularios repiten la misma mezcla de causas en su límite local: un fallo real de carga también se etiqueta como posible «versión nueva».
- El mecanismo de recarga de `src/lib/client-recovery.ts` solo compara módulos iniciales del documento y usa una ventana anti-bucle de 15 segundos. No confirma que la recarga haya resuelto el fallo ni conserva un diagnóstico de la excepción que reaparece.
- La publicación sirve HTML con `no-cache` y recursos versionados, y no existe un *service worker* activo en el código actual. Esto descarta que todo el problema sea simplemente «la caché del navegador».
- Hay módulos `*.functions.ts` que mezclan declaraciones `createServerFn` con constantes y funciones ejecutables en el mismo archivo. En TanStack Start esos módulos deben ser envoltorios finos; el transformado y la división de código de producción pueden dejar referencias ausentes aunque desarrollo y comprobación de tipos funcionen. `forms.functions.ts`, utilizado por todos los formularios públicos, es uno de los casos confirmados; la auditoría preliminar muestra más casos en accesos, confirmaciones, importaciones, asientos y comunicaciones.
- Las rutas de sesión e informe ya tienen estados de error locales para sus consultas. Que aparezca el límite global indica que también existe una excepción fuera del error normal de la consulta; recargar oculta temporalmente el síntoma, pero no corrige esa excepción.
- El informe todavía construye en el navegador un conjunto amplio de participantes, accesos, comunicaciones, incidencias y consentimientos mediante muchas peticiones paginadas. Aunque filtre por sesión, esta arquitectura aumenta las probabilidades de timeout, consumo de memoria y carreras de autenticación.

## Plan de corrección

### 1. Obtener un diagnóstico inequívoco en producción

- Añadir un identificador de incidencia por fallo y registrar ruta, publicación, tipo de error, módulo/operación y fase (`carga de módulo`, `autenticación`, `server function`, `consulta`, `renderizado`).
- Conservar el `Error` original y su traza tanto en cliente como en servidor, sin registrar datos personales ni tokens.
- Mostrar al usuario un mensaje y una acción distintos según la causa:
  - **Versión antigua confirmada:** actualización automática una sola vez.
  - **Sesión caducada:** renovar o volver al acceso.
  - **Datos/servidor:** reintentar solo la operación, sin recargar toda la aplicación.
  - **Error inesperado:** referencia de incidencia y recuperación segura.
- Mantener límites locales en sesiones, informes y formularios para impedir que un fallo acotado derribe toda la aplicación.

### 2. Corregir la división de código de las funciones de servidor

- Auditar todos los archivos que declaran `createServerFn`.
- Convertir cada `*.functions.ts` en un envoltorio fino: solo importaciones, tipos borrables y declaraciones exportadas de funciones de servidor.
- Trasladar esquemas, constantes, generadores y helpers ejecutables a módulos `*.server.ts` o módulos de constantes adecuados; los handlers los importarán sin exponer código privilegiado al cliente.
- Priorizar los módulos que intervienen en los fallos observados: formularios públicos, sesiones, informes/exportaciones y autenticación; después completar el resto para eliminar la misma clase de error de toda la plataforma.

### 3. Sustituir la recarga indiscriminada por recuperación controlada

- Limitar la recarga automática exclusivamente a errores confirmados de chunk/importación o a una publicación distinta.
- Introducir un identificador estable de compilación/publicación y comparar la versión cargada con la vigente, en lugar de inferirla solo a partir de los módulos iniciales del HTML.
- Registrar el intento y el resultado de actualización; si el mismo error reaparece tras cargar la misma publicación, detener el bucle y mostrar el diagnóstico real.
- Hacer que «Cargar versión actual» fuerce de verdad una navegación limpia incluso dentro de la ventana anti-bucle, pero sin borrar sesión ni datos funcionales.
- Retirar la limpieza global de todas las cachés como respuesta habitual; conservar solo una migración puntual y segura para residuos heredados.

### 4. Estabilizar autenticación y peticiones

- Centralizar las peticiones autenticadas para que un `401` intente una única renovación de sesión y repita la operación una vez.
- Evitar renovaciones concurrentes entre el proveedor de autenticación, el guardián de pestaña y las llamadas de servidor.
- Si la sesión no es recuperable, limpiar solo la sesión inválida, guardar la ruta de retorno y llevar al acceso con un mensaje claro.
- Clasificar timeouts, falta de conexión, límites del backend y errores de permisos para que no lleguen como excepciones genéricas al límite global.

### 5. Aligerar sesiones, informes y formularios

- **Sesiones:** mantener lecturas ligeras para cabecera/formulario, aislar guardado y acciones pesadas, y reintentar solo la petición fallida.
- **Informes:** mover agregados KPI al servidor/base de datos, devolver datos resumidos y paginar el detalle; no cargar miles de filas y consentimientos en memoria para mostrar la pantalla. Mantener la exportación detallada como proceso separado y filtrado obligatoriamente por sesión.
- **Formularios:** separar datos esenciales de inscripción de textos secundarios, devolver códigos funcionales en vez de lanzar excepciones, y ofrecer reintento local sin recargar ni perder lo escrito. Mantener la respuesta de duplicado como agradecimiento.
- Verificar índices y planes de las consultas exactas utilizadas por la sesión del 2 de septiembre antes de introducir cualquier cambio de base de datos.

### 6. Pruebas de regresión y despliegue seguro

- Añadir pruebas de producción para los cuatro escenarios: chunk retirado, sesión caducada recuperable/no recuperable, timeout de datos y excepción real de renderizado.
- Probar en navegador normal con sesión persistida y pestaña antigua, además de incógnito: sesiones, guardar cambios, informe del 2 de septiembre, formulario público, envío duplicado y exportación.
- Simular una publicación nueva con una pestaña abierta: debe actualizarse una sola vez y continuar en la misma ruta.
- Verificar que un error de consulta muestra reintento local y que nunca activa una falsa actualización de versión.
- Revisar compilación de producción, trazas, consola, peticiones y recursos generados; comprobar que no quedan referencias ausentes en chunks.
- Publicar primero la instrumentación y las correcciones estructurales, observar referencias de incidencia; después desplegar la optimización de informes. Confirmar en el dominio real con la sesión persistida antes de darlo por cerrado.

## Resultado esperado

- Ningún usuario tendrá que pulsar repetidamente «Cargar versión actual» ni usar `Ctrl+Shift+R`.
- Las publicaciones nuevas se recuperarán automáticamente una sola vez.
- Los fallos de sesión, datos o permisos se resolverán o reintentarán en su propia pantalla sin derribar la aplicación.
- Sesiones, informes y formularios quedarán protegidos contra la misma clase de fallo de producción, con trazabilidad suficiente para identificar cualquier incidencia futura.
