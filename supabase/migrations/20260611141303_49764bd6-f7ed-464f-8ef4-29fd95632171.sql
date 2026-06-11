
DROP FUNCTION IF EXISTS public.checkout_pos_order(jsonb, text, numeric);
DROP TABLE IF EXISTS public.pos_payments CASCADE;
DROP TABLE IF EXISTS public.pos_order_lines CASCADE;
DROP TABLE IF EXISTS public.pos_orders CASCADE;
DROP TABLE IF EXISTS public.pos_products CASCADE;
DROP TABLE IF EXISTS public.pos_categories CASCADE;
