// Orden estándar de sesiones en el panel: primero la próxima sesión y el resto
// de futuras (la más cercana antes); debajo, las pasadas de la más reciente a
// la más antigua.
export function compareSessionsUpcomingFirst(
  a: { starts_at?: string | null },
  b: { starts_at?: string | null },
  now: number = Date.now(),
): number {
  const ta = a.starts_at ? new Date(a.starts_at).getTime() : NaN;
  const tb = b.starts_at ? new Date(b.starts_at).getTime() : NaN;
  const va = Number.isNaN(ta) ? -Infinity : ta;
  const vb = Number.isNaN(tb) ? -Infinity : tb;
  const fa = va >= now;
  const fb = vb >= now;
  if (fa && !fb) return -1;
  if (!fa && fb) return 1;
  return fa ? va - vb : vb - va;
}

export function sortSessionsUpcomingFirst<T extends { starts_at?: string | null }>(
  list: readonly T[] | null | undefined,
  now: number = Date.now(),
): T[] {
  return [...(list ?? [])].sort((a, b) => compareSessionsUpcomingFirst(a, b, now));
}
