# Correo de Pilar Sánchez: qué pasó y cómo cerrarlo

## Qué ha pasado (comprobado en el registro de envíos)
- Pilar Sánchez Sánchez estaba en la sesión del 18 de noviembre, pero el 14/11 se le anuló la reserva por aforo (su ficha está como "cancelado por el asistente", sin butaca).
- El 17/11 a las 20:01 (hora de Sevilla) salió un envío manual de refuerzo ("refuerzo_17nov": 92 correos a 69 direcciones). A Pilar le llegó un correo con su nombre en el saludo pero con las entradas de **Francisco Chanivet Osuna y su acompañante** (Platea fila 7, butacas 8 y 9). Fue un error de ese envío puntual, no del importador ni de los envíos normales de la plataforma.
- A las 21:53 de ese día ya se mandó una corrección ("correccion_17nov", 45 correos a 32 direcciones) que avisaba de ese fallo. Pilar la recibió, pero ha contestado al primer correo.
- "En dos fichas": el acompañante de Francisco se creó como entrada separada ("Acompañante de Francisco Chanivet Osuna"). Ahora mismo esa ficha y la de Pilar están canceladas; la de Francisco sigue activa en fila 7 butaca 8.

## Lo que haré
1. Sacar la lista exacta de quién recibió entradas de otra persona el 17/11: comparar el destinatario con los nombres y enlaces de entrada dentro de cada correo.
2. Confirmar que ninguna de esas entradas sigue abierta para quien no es su dueño. Si alguna lo está, generar un enlace nuevo para el dueño (el viejo dejaría de valer). Esto no cambia butacas ni estados.
3. Revisar la butaca 9 de Platea fila 7: está libre porque el acompañante está cancelado. Confirmar con Francisco si sigue viniendo acompañado.
4. Dejarte en el chat una respuesta corta para Pilar y la lista de afectados. No mando ningún correo sin que me lo digas.
5. Para que no se repita: los envíos de grupo solo salen desde la cola de la plataforma, con comprobación de que el correo del destinatario coincide con el de la ficha de cada entrada incluida. Nada de envíos manuales con su propio texto.

## Detalle técnico
- Fuente: communication_logs (metadata.kind = refuerzo_17nov / correccion_17nov), event_participants y people de la sesión c4272f17.
- Paso 1: buscar confirmation_token y nombres en el body comparados con person_id/to_address.
- Paso 2: rotar confirmation_token solo en las fichas cuyo enlace salió a otra persona.
- Paso 5: añadir la comprobación en la función de envío agrupado (bulk-send.functions.ts / tickets.functions.ts) y una prueba que rechace un grupo si alguna entrada tiene un correo distinto al del destinatario.
