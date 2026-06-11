
-- ========== TPV / POS module ==========

-- Categories
CREATE TABLE public.pos_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_categories TO authenticated;
GRANT ALL ON public.pos_categories TO service_role;
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_categories read for staff" ON public.pos_categories FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_categories admin write" ON public.pos_categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Products
CREATE TABLE public.pos_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.pos_categories(id) ON DELETE RESTRICT,
  name text NOT NULL,
  price_gross numeric(10,2) NOT NULL CHECK (price_gross >= 0),
  vat_rate numeric(5,2) NOT NULL DEFAULT 10.00,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_products TO authenticated;
GRANT ALL ON public.pos_products TO service_role;
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_products read for staff" ON public.pos_products FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_products admin write" ON public.pos_products FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Orders
CREATE TABLE public.pos_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number int,
  order_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Madrid')::date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  total_gross numeric(10,2) NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_date, order_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_orders TO authenticated;
GRANT ALL ON public.pos_orders TO service_role;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_orders staff read" ON public.pos_orders FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_orders staff insert" ON public.pos_orders FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_orders admin update" ON public.pos_orders FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "pos_orders admin delete" ON public.pos_orders FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Order lines
CREATE TABLE public.pos_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.pos_products(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  unit_price_gross_snapshot numeric(10,2) NOT NULL,
  vat_rate_snapshot numeric(5,2) NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  line_total_gross numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_order_lines TO authenticated;
GRANT ALL ON public.pos_order_lines TO service_role;
ALTER TABLE public.pos_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_order_lines staff read" ON public.pos_order_lines FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_order_lines staff insert" ON public.pos_order_lines FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_order_lines admin write" ON public.pos_order_lines FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Payments
CREATE TABLE public.pos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('cash','card')),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  tendered numeric(10,2),
  change_amount numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_payments TO authenticated;
GRANT ALL ON public.pos_payments TO service_role;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos_payments staff read" ON public.pos_payments FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_payments staff insert" ON public.pos_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]));
CREATE POLICY "pos_payments admin write" ON public.pos_payments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_pos_categories_updated BEFORE UPDATE ON public.pos_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pos_products_updated BEFORE UPDATE ON public.pos_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pos_orders_updated BEFORE UPDATE ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Server-assigned order_number per day
CREATE OR REPLACE FUNCTION public.checkout_pos_order(
  _lines jsonb,
  _payment_method text,
  _tendered numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _order_id uuid;
  _order_date date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  _order_number int;
  _total numeric(10,2) := 0;
  _line jsonb;
  _prod record;
  _qty int;
  _line_total numeric(10,2);
  _amount numeric(10,2);
  _change numeric(10,2);
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.has_any_role(_actor, ARRAY['superadmin','admin_figurarte','coordinador']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _payment_method NOT IN ('cash','card') THEN RAISE EXCEPTION 'bad_method'; END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 THEN RAISE EXCEPTION 'empty_order'; END IF;

  SELECT COALESCE(MAX(order_number), 0) + 1 INTO _order_number
  FROM public.pos_orders WHERE order_date = _order_date;

  INSERT INTO public.pos_orders (order_number, order_date, status, total_gross, closed_at, created_by)
  VALUES (_order_number, _order_date, 'paid', 0, now(), _actor)
  RETURNING id INTO _order_id;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _qty := (_line->>'quantity')::int;
    IF _qty <= 0 THEN CONTINUE; END IF;
    SELECT id, name, price_gross, vat_rate INTO _prod
    FROM public.pos_products WHERE id = (_line->>'product_id')::uuid AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found: %', _line->>'product_id'; END IF;
    _line_total := ROUND(_prod.price_gross * _qty, 2);
    _total := _total + _line_total;
    INSERT INTO public.pos_order_lines (
      order_id, product_id, name_snapshot, unit_price_gross_snapshot,
      vat_rate_snapshot, quantity, line_total_gross
    ) VALUES (
      _order_id, _prod.id, _prod.name, _prod.price_gross,
      _prod.vat_rate, _qty, _line_total
    );
  END LOOP;

  UPDATE public.pos_orders SET total_gross = _total WHERE id = _order_id;

  _amount := _total;
  IF _payment_method = 'cash' AND _tendered IS NOT NULL THEN
    _change := GREATEST(_tendered - _total, 0);
  END IF;

  INSERT INTO public.pos_payments (order_id, method, amount, tendered, change_amount)
  VALUES (_order_id, _payment_method, _amount, _tendered, _change);

  RETURN jsonb_build_object(
    'order_id', _order_id,
    'order_number', _order_number,
    'order_date', _order_date,
    'total_gross', _total,
    'change_amount', _change
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkout_pos_order(jsonb, text, numeric) TO authenticated;

-- Seed sample data
INSERT INTO public.pos_categories (name, color, sort_order) VALUES
  ('Cafés', '#8b5e3c', 1),
  ('Refrescos', '#1d4ed8', 2),
  ('Cervezas', '#ca8a04', 3),
  ('Bocadillos', '#16a34a', 4),
  ('Dulces', '#db2777', 5);

INSERT INTO public.pos_products (category_id, name, price_gross, vat_rate, sort_order)
SELECT c.id, p.name, p.price, p.vat, p.ord FROM public.pos_categories c
JOIN (VALUES
  ('Cafés','Café solo', 1.30, 10, 1),
  ('Cafés','Café con leche', 1.50, 10, 2),
  ('Cafés','Cortado', 1.40, 10, 3),
  ('Cafés','Café americano', 1.60, 10, 4),
  ('Refrescos','Coca-Cola', 2.20, 10, 1),
  ('Refrescos','Coca-Cola Zero', 2.20, 10, 2),
  ('Refrescos','Fanta Naranja', 2.20, 10, 3),
  ('Refrescos','Agua 50cl', 1.20, 10, 4),
  ('Cervezas','Caña', 1.80, 10, 1),
  ('Cervezas','Tercio', 2.50, 10, 2),
  ('Cervezas','Sin alcohol', 2.20, 10, 3),
  ('Bocadillos','Bocadillo jamón', 4.50, 10, 1),
  ('Bocadillos','Bocadillo tortilla', 4.00, 10, 2),
  ('Bocadillos','Bocadillo lomo', 4.80, 10, 3),
  ('Dulces','Croissant', 1.60, 10, 1),
  ('Dulces','Napolitana', 1.80, 10, 2),
  ('Dulces','Magdalena', 1.20, 10, 3)
) AS p(cat, name, price, vat, ord) ON p.cat = c.name;

CREATE INDEX pos_products_category_idx ON public.pos_products(category_id, sort_order);
CREATE INDEX pos_orders_date_idx ON public.pos_orders(order_date, order_number);
CREATE INDEX pos_order_lines_order_idx ON public.pos_order_lines(order_id);
CREATE INDEX pos_payments_order_idx ON public.pos_payments(order_id);
