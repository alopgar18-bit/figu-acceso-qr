Hay tres problemas distintos en lo que reportas:

## 1. Las invitaciones de acompañantes dan "404 Page not found"

El enlace que se envía es `https://figurarte.app/t/<qr_token>`. He comprobado que:
- La ruta `/t/$qrToken` existe en el código y está registrada en el router.
- El ticket del acompañante de tu captura existe en base de datos y no está revocado.

Por tanto, el 404 viene de que **la versión publicada (figurarte.app / figu-acceso-qr.lovable.app) todavía no incluye la ruta `/t/$qrToken`**: se añadió después de la última publicación. Al republicar el proyecto, ese mismo enlace abrirá la entrada del acompañante. Lo dejaré indicado al final, pero esto se resuelve con un Publish, no con código.

## 2. La entrada del acompañante debe verse igual que la del titular

Hoy hay dos páginas distintas:
- Titular → `src/routes/c.$token.entrada.tsx` (aplica `ticket_design`: cabecera con color de marca, avisos, instrucciones, footer, etc.).
- Acompañante → `src/routes/t.$qrToken.tsx` (tarjeta básica, sin diseño aplicado).

Plan:
- Extraer la maquetación de la entrada a un componente compartido `src/components/ticket-card.tsx` que renderice: cabecera (color de marca/diseño), fecha y hora, ubicación, asistente + DNI, bloque de zona/fila/asiento, QR, avisos (`design.notices` con fallback a `DEFAULT_TICKET_NOTICES`), instrucciones y footer.
- Reutilizar este componente desde `c.$token.entrada.tsx` (titular) y desde `t.$qrToken.tsx` (acompañante e individual del titular). Para el acompañante usa `holderName`, `dni` y `seat` de la persona acompañante, y `kind = "acompanante"` para el subtítulo.
- `getTicketByQr` ya devuelve `event.ticket_design` resuelto, así que el componente compartido recibe el diseño y se renderiza idéntico al del titular.

## 3. Asignar zona / fila / asiento por acompañante

Hoy los acompañantes ya tienen columnas `seat_zone`, `seat_row`, `seat_number` y la entrada las pinta, pero no hay UI individual para asignarlos (solo el import masivo de asientos por CSV).

Plan:
- En `src/routes/_authenticated/solicitudes.$participantId.tsx`, dentro del bloque "Acompañantes registrados", añadir por cada acompañante tres inputs (`Zona`, `Fila`, `Asiento`) que guarden al `onBlur` en `companions` mediante una nueva server function.
- Nueva server function `updateCompanionSeat` en `src/lib/tickets.functions.ts` (o `seats.functions.ts`): valida `{ companion_id, seat_zone, seat_row, seat_number }`, requiere rol superadmin/admin/coordinador, hace `update` en `companions` y registra `audit_logs` con `action: "companion.seat"`.
- Hook cliente `useUpdateCompanionSeat` que invalide `useParticipantCompanions(participantId)` tras guardar.
- Mostrar el resumen de asientos en el listado de acompañantes (ya disponible vía `formatSeat`-like helper).

Con esto, el seat asignado al acompañante aparecerá tanto en el email masivo (ya muestra `formatSeat`) como en su entrada `/t/<token>`, idéntica visualmente a la del titular.

## Archivos a tocar

- `src/components/ticket-card.tsx` (nuevo)
- `src/routes/c.$token.entrada.tsx` (refactor para usar `TicketCard`)
- `src/routes/t.$qrToken.tsx` (refactor para usar `TicketCard`)
- `src/lib/tickets.functions.ts` (nueva `updateCompanionSeat`)
- `src/lib/use-participants.ts` (nuevo hook `useUpdateCompanionSeat`, junto a los existentes)
- `src/routes/_authenticated/solicitudes.$participantId.tsx` (UI de asignación por acompañante)

## Después de implementar

Para que el 404 desaparezca en figurarte.app hay que **publicar** el proyecto: la ruta `/t/$qrToken` y los cambios visuales se despliegan en ese momento.
