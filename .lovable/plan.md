Añadir en la cabecera de la página de edición de sesión (`/eventos/$eventId/sesiones/$sessionId`) un botón **"Pasar a QR los que tengan butaca"** — el mismo que hoy solo existe en la página de asignación.

## Qué se hace

En `src/routes/_authenticated/eventos.$eventId.sesiones.$sessionId.tsx`, dentro del `PageHeader > actions`, entre "Ver plano" y "Enviar invitaciones":

- Botón que llama a `promoteAssignedSeatsToQR({ session_id: sessionId })` (server function ya existente en `src/lib/seats.functions.ts`).
- Muestra un spinner mientras corre y un toast al terminar con el desglose (promovidos, QR emitidos, ya con entrada, cancelados omitidos, total con butaca).
- Invalida las queries de la sesión para refrescar contadores.

No se toca nada de la lógica de negocio — solo se expone el botón en un segundo sitio para no tener que ir a la vista de asignación.

## Detalles técnicos

- Importar `useServerFn` de `@tanstack/react-start`, `useMutation` + `useQueryClient` de `@tanstack/react-query`, `promoteAssignedSeatsToQR` de `@/lib/seats.functions`, y los iconos `CheckCircle2` / `Loader2` de `lucide-react`.
- Extraer un pequeño componente local `PromoteSeatsButton({ sessionId })` idéntico al de `sesiones.$sessionId.asignacion.tsx` para mantener consistencia.
