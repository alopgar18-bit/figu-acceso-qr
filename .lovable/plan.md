## Foco: sesión del 24 de junio + lógica preventiva

Solo la sesión del 24. Lo anterior se ignora. **Cero reenvíos de WhatsApp**: corregimos el asiento en BD y la URL de "Abrir entrada" que ya recibió cada invitado mostrará el asiento nuevo la próxima vez que la abra.

### Por qué no hay que reenviar

La página `/c/:token/entrada` (`src/routes/c.$token.entrada.tsx`) lee `seat_zone`, `seat_row`, `seat_number` desde `event_participants` / `companions` **en cada visita**, vía `confirmation.functions.ts`. El `confirmation_token` no cambia al mover de asiento → el mismo enlace ya enviado por WhatsApp sigue funcionando y refleja el asiento corregido automáticamente. Lo mismo aplica al QR (`/t/:qrToken`) y al OG (`/og/c/:token`).

## 1. Resolución asistida del 24/06

### Catálogo del teatro (`venue_seats`)

Tabla maestra con las ~762 butacas del Cartuja Center parseadas del Excel del plano (hoja "Table 3"). Una sola vez en migración:

```text
venue_seats(id, venue_id, zone, row, number,
            section, floor, access_door,
            is_accessible, is_reduced_view, is_hidden, notes)
UNIQUE (venue_id, zone, row, number)
```

### Pantalla `/_authenticated/sesiones.$sessionId.plano`

- **Plano SVG** del Cartuja Center por zonas (Platea Preferente, Baja, Alta, Palco, Club).
- **Colores**: verde libre · azul ocupado · rojo conflicto · gris fantasma (asiento en BD no en plano) · rayado accesible / visibilidad reducida / oculto.
- **KPIs**: aforo, ocupados, libres, conflictos, fantasmas, % por zona.
- **Hover**: ocupante(s) — nombre + tipo + DNI.
- **Click en rojo** → drawer con todos los implicados, sugerencia, botones "Aplicar" / "Editar manualmente" / "Marcar revisado".
- **Buscar** por nombre/DNI para localizar a alguien.
- **Filtros**: solo conflictos, solo libres, por zona.
- **Banner explícito en la cabecera**: "Los cambios actualizan la entrada del invitado automáticamente. No se reenvía ningún WhatsApp."

### Motor de sugerencias

Para cada conflicto, propone una resolución **manteniendo a cada persona en su zona original**:

1. **Grupos juntos**: titular + acompañantes se reubican como bloque contiguo en la misma fila o filas adyacentes de su zona.
2. **Antigüedad**: si chocan grupos distintos, gana el de `created_at` más antiguo; el otro se mueve al hueco libre más cercano de su zona conservando a sus acompañantes contiguos.
3. **Duplicado de la misma persona** (mismo DNI / nombre normalizado): se fusiona dejando el registro con más estado (token, comunicaciones, check-in) y liberando el otro asiento — **el token superviviente se preserva** para no romper el enlace ya enviado.
4. **Accesibilidad**: respeta `is_accessible`; si la persona no la necesita, libera la butaca.
5. **Zona sin hueco libre**: marca "requiere upgrade/downgrade" y propone zona adyacente con aviso explícito; nada se mueve sin tu OK.

Botón global **"Aplicar todas las sugerencias seguras"** (sólo las que no cambian de zona).

Cada cambio queda en `audit_logs` con el plan original → **undo** disponible 24 h.

**Lo que NO hace** (explícito en el código):
- No regenera `confirmation_token` ni `qr_token`.
- No inserta en `communication_logs`.
- No llama a `send-whatsapp`.
- No toca `status` ni `confirmed_at` del participante.

## 2. Prevención a futuro

Una vez la sesión del 24 esté limpia:

- **Trigger** `check_seat_available` sobre `event_participants` y `companions`: si el asiento ya está ocupado en esa sesión, falla devolviendo el ocupante actual.
- **Aviso** (no bloqueo) si el asiento no existe en `venue_seats`.
- **Importador Excel**: pre-valida en cliente y pinta los conflictos sobre el plano antes de permitir confirmar.
- **Envío de entradas**: si el asiento de un participante choca con otro al lanzar la comunicación, se marca `bloqueada` con motivo y no se envía hasta resolver.

## Orden de ejecución

1. Migración: `venue_seats` + `unaccent` + `normalize_name` + seed del Cartuja Center desde el plano.
2. Server fns: `getSessionOccupancy(sessionId)`, `suggestSeatResolution(conflictId)`, `applySeatPlan(plan)` (preserva tokens, no toca comms), `mergeDuplicatePeople(ids)` (preserva token superviviente).
3. Pantalla `/_authenticated/sesiones.$sessionId.plano`.
4. Resolver asistidamente los conflictos del 24 de junio.
5. Activar triggers + validaciones del importador y del envío.

Resultado: el invitado pulsa el botón "Abrir entrada" del WhatsApp que ya tiene y ve su asiento nuevo. Cero mensajes adicionales.
