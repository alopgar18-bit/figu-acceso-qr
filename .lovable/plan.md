# Publicar y recuperar las 5 personas que faltan (sin reimportar)

## Respuesta corta
- **Publicar: sí.** En figurarte.app los cambios nuevos solo funcionan después de publicar: personas repetidas permitidas, informe de duplicados y butacas por zona + fila + butaca. En la vista previa ya funcionan.
- **Reimportar el Excel completo: no.** La sesión de Canarias ya tiene 508 personas con QR. Si subes otra vez el archivo, las butacas ya ocupadas darían cientos de errores y se mezclarían lotes. Además, podrían aparecer entradas repetidas.

## Qué falta de verdad
Faltan 5 personas que se unieron por error a otra ficha (filas 174, 198, 200, 234 y 397). Las 17 personas repetidas en el Excel y los 4 errores "VIS 2" ya tienen su entrada.

## Pasos
1. Publicar ahora, fuera del horario de grabación.
2. Crear solo esas 5 inscripciones en "Grabación 25 de Nov Canarias", cada una con su QR y la butaca original del Excel (zona + fila + butaca).
3. Antes de crearlas, comprobar si alguna de esas butacas está ocupada. Si lo está, no se toca y se avisa en una lista para que decidas.
4. Confirmar el total: 513 personas con QR.
5. Invitaciones: enviarlas solo a esas 5, o filtrar por sesión y estado "aceptado_pendiente_envio" para que no se repitan envíos.

## Detalles técnicos
- Las inscripciones se crean con la misma lógica que usa la importación (IDs fijos, estado aceptado_pendiente_envio). El aviso de butaca duplicada sigue activo.
- No hay cambios en el diseño de la base de datos.
