
-- Reglas de asignación automática vinculadas a un plano físico
CREATE TABLE public.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.venue_plans(id) ON DELETE CASCADE,
  attendee_type public.attendee_type NOT NULL,
  priority int NOT NULL DEFAULT 100,
  preferred_zone_ids uuid[] NOT NULL DEFAULT '{}',
  avoid_categories text[] NOT NULL DEFAULT ARRAY['reservado_camaras','bloqueado','reservado_movilidad_reducida','reservado_vip']::text[],
  keep_companions_together boolean NOT NULL DEFAULT true,
  allow_split_if_full boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, attendee_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_rules TO authenticated;
GRANT ALL ON public.assignment_rules TO service_role;
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment_rules_select_authenticated" ON public.assignment_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignment_rules_admin_write" ON public.assignment_rules
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_assignment_rules_plan ON public.assignment_rules(plan_id);
CREATE TRIGGER trg_assignment_rules_updated_at
  BEFORE UPDATE ON public.assignment_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Propuestas de asignación (borrador / aplicada)
CREATE TABLE public.assignment_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.event_sessions(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.venue_plans(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft', -- draft | applied | discarded
  total_participants int NOT NULL DEFAULT 0,
  total_assigned int NOT NULL DEFAULT 0,
  total_unassigned int NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_proposals TO authenticated;
GRANT ALL ON public.assignment_proposals TO service_role;
ALTER TABLE public.assignment_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment_proposals_select_authenticated" ON public.assignment_proposals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignment_proposals_admin_write" ON public.assignment_proposals
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_assignment_proposals_session ON public.assignment_proposals(session_id);
CREATE TRIGGER trg_assignment_proposals_updated_at
  BEFORE UPDATE ON public.assignment_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ítems de la propuesta (un asiento por participante o acompañante)
CREATE TABLE public.assignment_proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.assignment_proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.event_participants(id) ON DELETE CASCADE,
  seat_id uuid REFERENCES public.venue_seats(id) ON DELETE SET NULL,
  zone_id uuid REFERENCES public.venue_zones(id) ON DELETE SET NULL,
  row_label text,
  seat_number text,
  zone_name text,
  reason text,
  is_companion boolean NOT NULL DEFAULT false,
  companion_index int,
  unassigned_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_proposal_items TO authenticated;
GRANT ALL ON public.assignment_proposal_items TO service_role;
ALTER TABLE public.assignment_proposal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment_proposal_items_select_authenticated" ON public.assignment_proposal_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignment_proposal_items_admin_write" ON public.assignment_proposal_items
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE INDEX idx_assignment_proposal_items_proposal ON public.assignment_proposal_items(proposal_id);
CREATE INDEX idx_assignment_proposal_items_participant ON public.assignment_proposal_items(participant_id);
