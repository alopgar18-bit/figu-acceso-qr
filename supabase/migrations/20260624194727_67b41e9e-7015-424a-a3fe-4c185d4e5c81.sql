-- 1. venues
CREATE TABLE public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venues TO authenticated;
GRANT ALL ON public.venues TO service_role;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venues_select_authenticated" ON public.venues
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "venues_admin_write" ON public.venues
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_venues_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. venue_plans
CREATE TABLE public.venue_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_plans TO authenticated;
GRANT ALL ON public.venue_plans TO service_role;
ALTER TABLE public.venue_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_plans_select_authenticated" ON public.venue_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "venue_plans_admin_write" ON public.venue_plans
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_venue_plans_venue ON public.venue_plans(venue_id);
CREATE TRIGGER trg_venue_plans_updated_at
  BEFORE UPDATE ON public.venue_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. venue_zones
CREATE TABLE public.venue_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_zones TO authenticated;
GRANT ALL ON public.venue_zones TO service_role;
ALTER TABLE public.venue_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_zones_select_authenticated" ON public.venue_zones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "venue_zones_admin_write" ON public.venue_zones
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_venue_zones_plan ON public.venue_zones(plan_id);
CREATE TRIGGER trg_venue_zones_updated_at
  BEFORE UPDATE ON public.venue_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. venue_seats
CREATE TABLE public.venue_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_plans(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.venue_zones(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_number text NOT NULL,
  default_category text NOT NULL DEFAULT 'libre',
  is_active boolean NOT NULL DEFAULT true,
  row_index int NOT NULL DEFAULT 0,
  col_index int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, zone_id, row_label, seat_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_seats TO authenticated;
GRANT ALL ON public.venue_seats TO service_role;
ALTER TABLE public.venue_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_seats_select_authenticated" ON public.venue_seats
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "venue_seats_admin_write" ON public.venue_seats
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_venue_seats_plan ON public.venue_seats(plan_id);
CREATE INDEX idx_venue_seats_zone ON public.venue_seats(zone_id);
CREATE TRIGGER trg_venue_seats_updated_at
  BEFORE UPDATE ON public.venue_seats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. event_sessions.venue_plan_id (opcional, legacy queda con NULL)
ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS venue_plan_id uuid REFERENCES public.venue_plans(id) ON DELETE SET NULL;

-- 6. event_participants.seat_locked
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS seat_locked boolean NOT NULL DEFAULT false;
