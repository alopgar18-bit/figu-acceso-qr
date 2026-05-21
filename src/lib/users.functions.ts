import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireRole } from "./role-guards";

const ROLES = [
  "superadmin",
  "admin_figurarte",
  "coordinador",
  "validador",
  "cliente_productora",
] as const;

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(255),
  phone: z.string().max(50).optional().nullable(),
  roles: z.array(z.enum(ROLES)).min(1).max(5),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreateUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
    ]);

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "No se pudo crear el usuario");
    }
    const userId = created.user.id;

    // Profile is created by trigger handle_new_user; update phone/name to be safe.
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: userId,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone ?? null,
      });
    if (profileErr) throw new Error(profileErr.message);

    const rolesRows = data.roles.map((role) => ({ user_id: userId, role }));
    const { error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .insert(rolesRows);
    if (rolesErr) throw new Error(rolesErr.message);

    return { id: userId };
  });

const UpdateRolesSchema = z.object({
  user_id: z.string().uuid(),
  roles: z.array(z.enum(ROLES)).max(5),
});

export const updateUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateRolesSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
    ]);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    if (data.roles.length) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert(data.roles.map((role) => ({ user_id: data.user_id, role })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const ToggleActiveSchema = z.object({
  user_id: z.string().uuid(),
  is_active: z.boolean(),
});

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ToggleActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [
      "superadmin",
      "admin_figurarte",
    ]);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.is_active })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });