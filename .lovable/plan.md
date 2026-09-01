# Separar preparación y envío de comunicaciones

## Objetivo
Que crear una tanda, reintentar registros o descargar archivos `.eml` nunca autorice un envío automático. Solo una acción explícita sobre **Enviar cola** podrá iniciarlo.

## Cambios
1. Usar `programado` como estado de **preparado, aún no autorizado** y reservar `pendiente` para una tanda cuyo envío ya ha sido autorizado.
2. Cambiar todos los puntos de creación y reintento para dejar las comunicaciones en `programado`.
3. Al pulsar **Enviar cola**, autorizar solo los registros seleccionados —o toda la cola del canal—, pasarlos a `pendiente` y enviar únicamente esos identificadores.
4. Mantener el autoencadenado y el vigilante exclusivamente para registros `pendiente`, de modo que puedan recuperar una tanda ya iniciada pero nunca arrancar una tanda recién preparada.
5. Ajustar la pantalla para mostrar por defecto los elementos preparados y contabilizarlos correctamente.
6. Aplicar una migración segura que establezca `programado` como valor por defecto en nuevos registros y deje detenidos como preparados los pendientes que todavía no hayan comenzado a enviarse.

## Verificación
- Crear una comunicación y comprobar que permanece en la cola sin llamadas al proveedor.
- Exportar `.eml` y comprobar que no cambia su estado.
- Pulsar **Enviar cola** y comprobar que solo la selección autorizada pasa a envío.
- Confirmar que una tanda autorizada interrumpida sí puede ser retomada por el vigilante.
