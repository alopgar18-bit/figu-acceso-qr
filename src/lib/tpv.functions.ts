import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole } from "./role-guards";

const STAFF = ["superadmin", "admin_figurarte", "coordinador"] as const;

export const listPosCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRole(context.supabase, context.userId, [...STAFF]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: cats, error: e1 }, { data: prods, error: e2 }] = await Promise.all([
      supabaseAdmin
        .from("pos_categories")
        .select("id, name, color, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("pos_products")
        .select("id, category_id, name, price_gross, vat_rate, color, sort_order")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return {
      categories: cats ?? [],
      products: (prods ?? []).map((p) => ({
        ...p,
        price_gross: Number(p.price_gross),
        vat_rate: Number(p.vat_rate),
      })),
    };
  });

const CheckoutInput = z.object({
  lines: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  payment_method: z.enum(["cash", "card"]),
  tendered: z.number().nonnegative().optional(),
});

export const checkoutPosOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CheckoutInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, [...STAFF]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("checkout_pos_order", {
      _lines: data.lines,
      _payment_method: data.payment_method,
      _tendered: data.tendered ?? null,
    });
    if (error) throw new Error(error.message);
    const r = result as {
      order_id: string;
      order_number: number;
      order_date: string;
      total_gross: string | number;
      change_amount: string | number | null;
    };
    return {
      order_id: r.order_id,
      order_number: r.order_number,
      order_date: r.order_date,
      total_gross: Number(r.total_gross),
      change_amount: r.change_amount == null ? null : Number(r.change_amount),
    };
  });

export const listTodayPosSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRole(context.supabase, context.userId, [...STAFF]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Madrid "today"
    const today = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }),
    )
      .toISOString()
      .slice(0, 10);
    const { data, error } = await supabaseAdmin
      .from("pos_orders")
      .select(
        "id, order_number, order_date, status, total_gross, closed_at, pos_payments(method, amount)",
      )
      .eq("order_date", today)
      .eq("status", "paid")
      .order("order_number", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((o) => ({
      ...o,
      total_gross: Number(o.total_gross),
      pos_payments: (o.pos_payments ?? []).map((p: { method: string; amount: string | number }) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
    }));
  });