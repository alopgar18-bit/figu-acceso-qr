// Misma lógica que src/lib/phone.ts, pero para Deno (Edge Functions).
export function normalizarTelefonoES(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (/^[679]\d{8}$/.test(digits)) return "34" + digits;
  if (/^34[679]\d{8}$/.test(digits)) return digits;
  return null;
}