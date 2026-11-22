# Horas de la entrada siempre en hora peninsular (Sevilla)

## Causa (confirmada en el código)
Los correos y WhatsApp calculan la hora fijando la zona "Europe/Madrid" (20:00). Pero las páginas de la entrada (enlace "Descargar mi entrada", página del QR y página de confirmación) muestran la hora según el reloj del móvil de quien la abre. En Canarias el móvil está una hora por detrás, así que la entrada dice 19:00. Tú la ves bien porque estás en hora peninsular.

## Qué cambia
- Todas las fechas y horas de las páginas públicas del asistente se muestran fijas en hora de Sevilla, abra quien abra la entrada desde donde sea: fecha, apertura de puertas, inicio y fin aprox.
- Junto a las horas se añade un aviso breve: "Hora peninsular (Sevilla)", para que nadie de Canarias dude.
- No se toca la base de datos, ni los envíos, ni el control de acceso. No hace falta reenviar nada: al publicar, los enlaces ya enviados mostrarán la hora correcta.

## Mensaje a quien ya ha escrito
Sugerencia de respuesta: "La hora correcta es la del correo: 20:00 h (hora de Sevilla). La entrada mostraba la hora de Canarias por el reloj del móvil; ya está corregido."

## Detalles técnicos
- Archivos: `src/routes/c.$token.entrada.tsx` (líneas 33, 158-168, también el texto de compartir), `src/routes/t.$qrToken.tsx` (82-92), `src/routes/c.$token.tsx` (146-147).
- Añadir `timeZone: MADRID_TZ` (de `communication-constants.ts`) a cada `toLocaleString/TimeString/DateString`, o reutilizar los helpers de formato ya existentes allí.
- Revisar también el panel interno (`dashboard.tsx` 103-104) con la misma corrección.
- Comprobar con Playwright usando `timezoneId: "Atlantic/Canary"` que la entrada muestra 20:00.
