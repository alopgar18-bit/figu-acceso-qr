// Normaliza un teléfono a formato internacional sin "+", optimizado para España.
// - Quita espacios, guiones, paréntesis y signos "+".
// - Si queda como móvil/fijo español de 9 dígitos (empieza por 6/7/9), antepone "34".
// - Si ya viene como "34XXXXXXXXX" (11 dígitos), se respeta.
// - Cualquier otra forma → null (no se envía).
export function normalizarTelefonoES(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  // 9 dígitos españoles
  if (/^[679]\d{8}$/.test(digits)) return "34" + digits;
  // Ya con prefijo 34 + 9 dígitos
  if (/^34[679]\d{8}$/.test(digits)) return digits;
  return null;
}