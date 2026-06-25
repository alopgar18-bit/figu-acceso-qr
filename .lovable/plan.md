## Causa

El enlace `/c/73526c9f…` abre la sesión **"Grabación 30 de junio"** del evento *EL PERRO ANDALUZ by Manu Sánchez*. En `event_sessions`:

- `starts_at = 2026-06-30 16:00 UTC` ✅
- `ends_at = 2026-06-24 18:30 UTC` ❌ (mismo valor que la sesión del 24, en el pasado)

`src/lib/confirmation.functions.ts` línea 78 comprueba `session.ends_at < now()` y devuelve el código `evento_cerrado`, que es lo que pinta el candado "EVENTO CERRADO". Las sesiones 10/17/24 jun tienen `ends_at` correcto (starts + 2 h 30 min), así que esto es solo un dato mal grabado en esta sesión, no un bug de la lógica.

## Fix (solo dato, sin tocar código)

Actualizar la sesión `5c523d92-6458-4cdd-8223-d7de18c41ac2` para alinear el `ends_at` con la duración del resto (2 h 30 min → 18:30 UTC del mismo día):

```sql
UPDATE event_sessions
SET ends_at = '2026-06-30 18:30:00+00'
WHERE id = '5c523d92-6458-4cdd-8223-d7de18c41ac2';
```

Tras esto, el mismo enlace cargará la pantalla normal de confirmación / ticket en lugar del candado. No hace falta reenviar enlaces — los tokens siguen siendo válidos.

## Verificación

1. `SELECT id, name, starts_at, ends_at FROM event_sessions WHERE id='5c523d92-…'` → confirmar `ends_at = 2026-06-30 18:30`.
2. Abrir `https://figurarte.app/c/73526c9f214c4528b01f140bc097ec33ba63a8ac3805461db9317c28577ef163` en incógnito y confirmar que ya no aparece "EVENTO CERRADO".

## Fuera de alcance

- No se modifica `confirmation.functions.ts` ni la lógica de cierre — funciona como debe.
- No se cambian las otras sesiones del evento.
- Si quieres, en una iteración futura, puedo añadir una validación en la edición de sesiones que impida guardar `ends_at < starts_at` para evitar que vuelva a ocurrir, pero no entra en esta entrega urgente.
