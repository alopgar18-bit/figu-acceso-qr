# Arreglar el error al enviar la cola (303 correos)

## Qué ha pasado

Al pulsar "Enviar TODA la cola (303)", la plataforma manda de golpe la lista completa
de los 303 envíos en la propia dirección de la petición. Esa dirección se vuelve
enorme (más de 11.000 caracteres, como se ve en el mensaje rojo) y el servidor la
rechaza antes de procesar nada. El resultado es el aviso críptico
"TypeError: error sending request" y ningún correo sale.

Lo mismo puede ocurrir con la cola de WhatsApp, porque usa el mismo mecanismo.

## Qué se va a cambiar

1. **Trocear la consulta**: en lugar de pedir los 303 registros de una vez, se piden
   en bloques de 100. Así la petición nunca es demasiado larga, sea cual sea el
   tamaño de la cola (300, 1.000 o 5.000 envíos).
2. **Aplicarlo también a la continuación automática**: cuando la tanda se
   reanuda por tramos, la lista de pendientes se pasa igualmente troceada.
3. **Igual para WhatsApp**: mismo arreglo en la cola de WhatsApp.
4. **Mensaje de error entendible**: si un envío falla, en vez del texto técnico se
   mostrará un aviso claro en español con el motivo y qué hacer
   ("No se pudo iniciar la tanda: … Vuelve a pulsar Enviar cola"), dejando el
   detalle técnico solo en el registro interno.

## Lo que NO se toca

- Nada de estados de participantes, importaciones, asientos ni control de acceso.
- No se envía ningún correo automáticamente: sigue haciendo falta pulsar
  "Enviar cola" como hasta ahora.

## Detalle técnico

- `supabase/functions/send-email/index.ts` (líneas ~228-236 y el encadenado
  ~295-310): sustituir el `.in("id", body.ids)` único por un bucle de chunks de
  100 ids acumulando resultados; la autollamada de continuación ya pasa
  `remainingIds`, que se leerá igualmente troceado.
- `supabase/functions/send-whatsapp/index.ts` (líneas ~131-137 y ~324-330):
  mismo troceado.
- `src/routes/_authenticated/comunicaciones.cola.tsx`: en los `catch` de las
  acciones de envío, mostrar mensaje en español con el detalle recortado en vez
  del error crudo.

## Comprobación

Tras el cambio, lanzar la cola pendiente actual y verificar que los envíos pasan
a "enviado" y que el contador baja.
