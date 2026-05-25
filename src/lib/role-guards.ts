import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AppRole =
  | "superadmin"
  | "admin_figurarte"
  | "coordinador"
  | "validador"
  | "cliente_productora";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Server-side role check. Reads user_roles using the request-scoped
 * Supabase client (RLS lets users read their own roles). Throws
 * ForbiddenError if the user lacks every allowed role.
 */
export async function requireRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  allowed: AppRole[],
): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) {
    // Surface the underlying Supabase error so production issues
    // (JWT validation, RLS, network) are diagnosable instead of opaque.
    console.error("[requireRole] user_roles select failed", {
      userId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new ForbiddenError(
      `No se pudieron verificar permisos: ${error.message}${error.code ? ` (${error.code})` : ""}`,
    );
  }
  const roles = (data ?? []).map((r) => r.role as AppRole);
  const ok = roles.some((r) => allowed.includes(r));
  if (!ok) throw new ForbiddenError("No tienes permisos para esta acción");
  return roles;
}

export function isAdminRole(roles: AppRole[]): boolean {
  return roles.includes("superadmin") || roles.includes("admin_figurarte");
}

export function isCoordinatorOrAdmin(roles: AppRole[]): boolean {
  return isAdminRole(roles) || roles.includes("coordinador");
}