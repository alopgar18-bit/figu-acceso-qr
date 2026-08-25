# Estabilizar las actualizaciones en el navegador normal

## Diagnóstico confirmado

- La aplicación actual no registra *service worker* ni mantiene cachés de aplicación en el navegador revisado.
- El HTML de producción ya se sirve con `no-cache, must-revalidate, max-age=0` y los archivos JavaScript/CSS llevan nombres versionados.
- El navegador normal sí conserva dos estados que incógnito estrena desde cero: la aplicación JavaScript de una pestaña abierta y la sesión de acceso en almacenamiento local.
- Actualmente no existe recuperación específica cuando una publicación deja una pestaña usando módulos de la versión anterior. Además, el botón general «Intentar otra vez» solo reintenta el árbol actual y puede conservar esa versión antigua.
- La sesión se restaura inicialmente con `getSession()`, pero no se revalida con el servidor antes de cargar permisos y datos. Una sesión persistida inválida puede terminar mostrando la pantalla genérica de error.

## Cambios

1. **Detector de nueva publicación**
   - Añadir un guardián global que detecte errores de carga de módulos/versiones antiguas (`vite:preloadError`, importaciones dinámicas y chunks no encontrados).
   - Ante ese caso, realizar una única recarga completa con control anti-bucle y petición sin caché para obtener la publicación vigente.
   - Comprobar al volver a una pestaña antigua si el documento de producción referencia una versión distinta; actualizarla de forma controlada para que las correcciones lleguen también al navegador normal.

2. **Recuperación de cachés antiguas**
   - Al arrancar, retirar registros y cachés heredados de versiones anteriores si existieran, aunque la versión actual ya no cree ninguno.
   - No borrar datos funcionales ni la sesión válida del usuario.

3. **Sesión persistida segura**
   - Revalidar la identidad al iniciar la aplicación, no confiar únicamente en la copia local.
   - Si el token ha caducado, intentar renovarlo una vez; si no es recuperable, limpiar únicamente la sesión inválida y llevar al inicio de sesión con un mensaje claro, en vez de provocar un error general.
   - Mantener la sesión cuando la renovación sea correcta para no interrumpir trabajos largos.

4. **Pantallas de recuperación**
   - Cambiar «Intentar otra vez» para que fuerce la carga de la versión actual, con protección frente a recargas infinitas.
   - Unificar los textos en español y distinguir «hay una versión nueva» de un error real de datos o servidor.

5. **Validación**
   - Probar una pestaña con versión antigua simulando un chunk retirado y confirmar que se recupera sola una única vez.
   - Probar sesión válida, token caducado recuperable y sesión inválida.
   - Verificar rutas de sesión, guardado e informes en navegador normal y confirmar que no se pierde la autenticación válida.
   - Revisar compilación, consola y peticiones finales sin errores.

## Archivos previstos

- Guardián de versión/carga en un módulo cliente independiente.
- Integración global en la raíz de la aplicación.
- Ajustes acotados en autenticación y en las dos pantallas generales de error.
- Sin cambios en datos, formularios, informes ni reglas de negocio.
