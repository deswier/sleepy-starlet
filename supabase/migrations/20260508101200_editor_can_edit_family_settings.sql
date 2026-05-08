-- Allow 'user' role to edit night-window settings, sleep places, and
-- settling methods. Introduce soft-delete for places/methods so that
-- removing an entry never NULLs historical session references.
--
-- Background:
--   C-B migration locked all four tables to admin-only. After discussion,
--   night-window + places + methods are shared day-to-day settings that
--   both partners (admin and user roles) should manage. Display toggles
--   (show_sleep_place etc.) remain admin-only.
--
-- Soft-delete rationale:
--   sleep_sessions.sleep_place_id and sleep_interruptions.settling_method_id
--   are FK with ON DELETE SET NULL. A hard DELETE would silently wipe
--   place/method attribution from every historical session that references
--   the row. Soft-delete (deleted_at timestamp) leaves the row in place so
--   JOINs in SleepDetail still return the name, while the row is hidden from
--   all "pick a place/method" dropdowns by filtering deleted_at IS NULL.
--   Physical DELETE is no longer exposed to clients; admin housekeeping can
--   run directly if needed.

-- =========================================================
-- 1) Soft-delete columns
-- =========================================================
ALTER TABLE public.sleep_places    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.settling_methods ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- =========================================================
-- 2) child_settings UPDATE — open to user role
--    (INSERT is trigger-only; SELECT is all linked users.)
-- =========================================================
DROP POLICY IF EXISTS "Admins update settings" ON public.child_settings;

CREATE POLICY "Admins and users update settings"
  ON public.child_settings FOR UPDATE TO authenticated
  USING (
    public.has_child_role(auth.uid(), child_id, 'admin')
    OR public.has_child_role(auth.uid(), child_id, 'user')
  );

-- =========================================================
-- 3) sleep_places — INSERT and UPDATE open to user role.
--    DELETE stays admin-only (soft-delete is done via UPDATE).
-- =========================================================
DROP POLICY IF EXISTS "Admins insert places" ON public.sleep_places;
DROP POLICY IF EXISTS "Admins update places" ON public.sleep_places;

CREATE POLICY "Admins and users insert places"
  ON public.sleep_places FOR INSERT TO authenticated
  WITH CHECK (
    public.has_child_role(auth.uid(), child_id, 'admin')
    OR public.has_child_role(auth.uid(), child_id, 'user')
  );

CREATE POLICY "Admins and users update places"
  ON public.sleep_places FOR UPDATE TO authenticated
  USING (
    public.has_child_role(auth.uid(), child_id, 'admin')
    OR public.has_child_role(auth.uid(), child_id, 'user')
  );

-- =========================================================
-- 4) settling_methods — same as sleep_places
-- =========================================================
DROP POLICY IF EXISTS "Admins insert methods" ON public.settling_methods;
DROP POLICY IF EXISTS "Admins update methods" ON public.settling_methods;

CREATE POLICY "Admins and users insert methods"
  ON public.settling_methods FOR INSERT TO authenticated
  WITH CHECK (
    public.has_child_role(auth.uid(), child_id, 'admin')
    OR public.has_child_role(auth.uid(), child_id, 'user')
  );

CREATE POLICY "Admins and users update methods"
  ON public.settling_methods FOR UPDATE TO authenticated
  USING (
    public.has_child_role(auth.uid(), child_id, 'admin')
    OR public.has_child_role(auth.uid(), child_id, 'user')
  );

-- ---------------------------------------------------------------------------
-- Rollback (manual):
--
--   ALTER TABLE public.sleep_places     DROP COLUMN IF EXISTS deleted_at;
--   ALTER TABLE public.settling_methods DROP COLUMN IF EXISTS deleted_at;
--
--   DROP POLICY IF EXISTS "Admins and users update settings" ON public.child_settings;
--   CREATE POLICY "Admins update settings" ON public.child_settings FOR UPDATE TO authenticated
--     USING (public.has_child_role(auth.uid(), child_id, 'admin'));
--
--   DROP POLICY IF EXISTS "Admins and users insert places" ON public.sleep_places;
--   DROP POLICY IF EXISTS "Admins and users update places" ON public.sleep_places;
--   CREATE POLICY "Admins insert places" ON public.sleep_places FOR INSERT TO authenticated
--     WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'));
--   CREATE POLICY "Admins update places" ON public.sleep_places FOR UPDATE TO authenticated
--     USING (public.has_child_role(auth.uid(), child_id, 'admin'));
--
--   DROP POLICY IF EXISTS "Admins and users insert methods" ON public.settling_methods;
--   DROP POLICY IF EXISTS "Admins and users update methods" ON public.settling_methods;
--   CREATE POLICY "Admins insert methods" ON public.settling_methods FOR INSERT TO authenticated
--     WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'));
--   CREATE POLICY "Admins update methods" ON public.settling_methods FOR UPDATE TO authenticated
--     USING (public.has_child_role(auth.uid(), child_id, 'admin'));
-- ---------------------------------------------------------------------------
