
-- 1) Wake window rules: historical record of WW thresholds per child
CREATE TABLE public.wake_window_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('default','custom')),
  min_minutes integer NOT NULL,
  max_minutes integer NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid
);

CREATE INDEX wake_window_rules_child_idx ON public.wake_window_rules (child_id, effective_from DESC);

ALTER TABLE public.wake_window_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Linked users see ww rules"
  ON public.wake_window_rules FOR SELECT TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

CREATE POLICY "Linked users insert ww rules"
  ON public.wake_window_rules FOR INSERT TO authenticated
  WITH CHECK (public.user_has_child_access(auth.uid(), child_id));

CREATE POLICY "Linked users update ww rules"
  ON public.wake_window_rules FOR UPDATE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

CREATE POLICY "Linked users delete ww rules"
  ON public.wake_window_rules FOR DELETE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

-- 2) Add settling method to interruptions (per spec)
ALTER TABLE public.sleep_interruptions
  ADD COLUMN settling_method_id uuid REFERENCES public.settling_methods(id) ON DELETE SET NULL;
