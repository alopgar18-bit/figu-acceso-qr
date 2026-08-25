# Estabilizar sesión e informe del 2 de septiembre

## Situación confirmada

- La sesión **“Grabación 2 de septiembre”** existe, está programada, tiene aforo 700 y 47 solicitudes; no falta ni está dañada.
- El evento acumula 25.767 participantes, 24.562 comunicaciones y 2.845 consentimientos históricos, por lo que cualquier consulta accidental del evento completo es costosa.
- Las rutas privadas se están renderizando también en servidor y las capturas corresponden a los dos manejadores genéricos de error global, no a un mensaje funcional de la sesión.
- La edición de sesiones se hace directamente desde el navegador. Los administradores pueden modificar; el rol coordinador solo tiene permiso de lectura en `event_sessions`, aunque la interfaz le permite entrar en edición.
- El informe lanza varias consultas paginadas en paralelo; el filtro de sesión existe, pero la consulta de consentimientos vuelve a obtener todos los identificadores y la opción de todo el evento puede generar una carga excesiva.

## Cambios

1. **Evitar los fallos al abrir rutas privadas**
   - Desactivar el renderizado servidor del área autenticada para que sesión e informes se carguen únicamente después de restaurar la sesión del usuario en el navegador.
   - Mantener la pantalla dentro del panel durante reintentos, con mensajes en español y sin sustituir toda la aplicación por el error genérico.

2. **Estabilizar carga y guardado de sesión**
   - Mantener una consulta ligera y reintentable para cargar evento y sesión.
   - Pasar el guardado a una función de servidor autenticada que valide el rol y los campos permitidos.
   - Autorizar de forma explícita a administradores y coordinadores asignados al evento, sin ampliar acceso a otros eventos ni aceptar cambios de identidad/evento enviados por el cliente.
   - Deshabilitar el botón mientras guarda, conservar el formulario si falla y mostrar el error concreto con acción de reintento.

3. **Hacer el informe seguro para eventos grandes**
   - Seleccionar automáticamente la sesión cuando se llega desde su contexto, evitando cargar accidentalmente las 25.767 personas del evento.
   - Separar el resumen del detalle: cargar primero KPI mediante consultas agregadas y dejar los datos nominales para la exportación.
   - Consultar participantes, consentimientos, comunicaciones, check-ins e incidencias siempre filtrados por sesión y en lotes acotados; eliminar la lectura previa no paginada de todos los identificadores.
   - Mantener “Todas las sesiones” como acción explícita, con carga por lotes y sin bloquear la página.

4. **Verificación en producción**
   - Probar con sesión autenticada: abrir la sesión del 2 de septiembre, modificar un campo reversible, guardar, recargar y confirmar persistencia.
   - Probar por separado con administrador y coordinador asignado.
   - Abrir el informe filtrado por la sesión, validar los 47 titulares actuales y generar el Excel detallado.
   - Confirmar que no aparecen errores 500, que un usuario no asignado no puede editar y que el build queda correcto.

## Detalles técnicos

- Archivos principales: layout autenticado, ruta de edición de sesión, `session-form`, hooks/funciones de sesiones, ruta y lógica de informes.
- Se añadirá una migración mínima solo si hace falta ajustar la política de actualización; conservará RLS y limitará el acceso a asignaciones válidas.
- No se cambiarán estados, aforo, participantes ni datos reales de la sesión durante la corrección; la prueba de guardado será reversible.
