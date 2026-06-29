## Objetivo
Eliminar el falso "SIN ROL ASIGNADO" que aparece al refrescar token o al recargar, sin esconder fallos reales de permisos.

## Cambios

### 1. `src/hooks/use-auth.tsx` — endurecer carga de roles
- Ignorar eventos `TOKEN_REFRESHED` e `INITIAL_SESSION` cuando el `user.id` no cambia (no recargar roles ni limpiar estado).
- En `loadRoles`:
  - Si la consulta a `get_my_roles` falla, **no** sobrescribir `roles` con `[]`; mantener el valor anterior y marcar `rolesError`.
  - Reintento automático con backoff (250 ms, 750 ms, 2 s) antes de dar por vacío.
  - Solo considerar "sin rol" cuando la respuesta es exitosa y el array está realmente vacío.
- Exponer `rolesLoading`, `rolesError` y `reloadRoles()` desde el contexto.

### 2. `src/routes/_authenticated.tsx` (o gate equivalente) — UX del bloqueo
- Mientras `rolesLoading` o exista `rolesError` reciente, mostrar spinner durante un grace period de ~2 s en lugar de la pantalla "Sin rol".
- Pantalla "Sin rol" solo si tras el grace period seguimos sin roles y sin error.
- Añadir botón **"Reintentar"** que llama a `reloadRoles()`.
- Si hubo `rolesError`, mostrar toast discreto ("No se pudieron cargar tus permisos, reintentando…") para no esconder fallos reales.

### 3. Mitigación inmediata para el usuario
- Indicar en la respuesta final que cierre sesión y vuelva a entrar para desbloquear la sesión actual mientras se despliega el fix.

## Fuera de alcance
- No se tocan políticas RLS, ni `get_my_roles`, ni la tabla `user_roles`.
- No se modifica la lógica de envío masivo ni la cola de comunicaciones.

## Validación
- Forzar `TOKEN_REFRESHED` (esperar ~1 h o invalidar token) → la UI no parpadea a "Sin rol".
- Simular fallo de red en `get_my_roles` (DevTools offline) → spinner + toast + reintento, nunca pantalla "Sin rol".
- Login limpio de un usuario sin roles reales → sí muestra "Sin rol" tras el grace period.
