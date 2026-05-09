-- C-B fix: enforce role checks on write policies that were previously gated
-- only on membership (user_has_child_access / user_has_session_access).
--
-- Before this migration any linked user — including viewers — could call the
-- Supabase API directly and:
--   • INSERT / UPDATE / DELETE sleep_interruptions (no role check)
--   • INSERT / UPDATE / DELETE sleep_places       (no role check)
--   • INSERT / UPDATE / DELETE settling_methods   (no role check)
--   • UPDATE child_settings                       (no role check)
--
-- Documented role model (CLAUDE.md):
--   admin  → can start/end sleep, edit any sleep, manage settings/members
--   user   → can start/end sleep, edit OWN sleep only
--   viewer → read-only everywhere
--
-- The sleep_sessions policies (migration 20260501182641) already implement
-- this model correctly; this migration applies the same logic to the four
-- remaining tables.

-- =========================================================
-- 1) Helper: does _user_id have edit rights on _session_id?
--    Mirrors the "Owners and admins update/delete sessions" RLS gate:
--      admin → any session of the child
--      user  → only sessions created by that user
--    viewer is excluded because their role row never satisfies the IN.
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_session_edit_access(
  _user_id    uuid,
  _session_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.sleep_sessions      s
    JOIN   public.child_user_roles    cur
           ON  cur.child_id = s.child_id
           AND cur.user_id  = _user_id
    WHERE  s.id = _session_id
      AND (
        cur.role = 'admin'::app_role
        OR (cur.role = 'user'::app_role AND s.created_by_user_id = _user_id)
      )
  );
$$;

-- =========================================================
-- 2) sleep_interruptions — role-gated write policies
-- =========================================================
DROP POLICY IF EXISTS "Linked users insert interruptions" ON public.sleep_interruptions;
DROP POLICY IF EXISTS "Linked users update interruptions" ON public.sleep_interruptions;
DROP POLICY IF EXISTS "Linked users delete interruptions" ON public.sleep_interruptions;

-- INSERT: caller must have edit access to the parent session AND must
-- self-attribute the row (created_by_user_id = auth.uid()).
-- Note: sync_session_interruptions is SECURITY DEFINER and bypasses RLS,
-- so the RPC path is unaffected; only direct client INSERTs are gated here.
CREATE POLICY "Users and admins insert interruptions"
  ON public.sleep_interruptions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_session_edit_access(auth.uid(), sleep_session_id)
    AND created_by_user_id = auth.uid()
  );

-- UPDATE / DELETE: edit access to the parent session is sufficient.
-- (admin touches any interruption; user touches interruptions in own sessions.)
CREATE POLICY "Users and admins update interruptions"
  ON public.sleep_interruptions FOR UPDATE TO authenticated
  USING (public.has_session_edit_access(auth.uid(), sleep_session_id));

CREATE POLICY "Users and admins delete interruptions"
  ON public.sleep_interruptions FOR DELETE TO authenticated
  USING (public.has_session_edit_access(auth.uid(), sleep_session_id));

-- =========================================================
-- 3) sleep_places — admin only for writes
-- =========================================================
DROP POLICY IF EXISTS "Linked users insert places" ON public.sleep_places;
DROP POLICY IF EXISTS "Linked users update places" ON public.sleep_places;
DROP POLICY IF EXISTS "Linked users delete places" ON public.sleep_places;

CREATE POLICY "Admins insert places"
  ON public.sleep_places FOR INSERT TO authenticated
  WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'));

CREATE POLICY "Admins update places"
  ON public.sleep_places FOR UPDATE TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'));

CREATE POLICY "Admins delete places"
  ON public.sleep_places FOR DELETE TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'));

-- =========================================================
-- 4) settling_methods — admin only for writes
-- =========================================================
DROP POLICY IF EXISTS "Linked users insert methods" ON public.settling_methods;
DROP POLICY IF EXISTS "Linked users update methods" ON public.settling_methods;
DROP POLICY IF EXISTS "Linked users delete methods" ON public.settling_methods;

CREATE POLICY "Admins insert methods"
  ON public.settling_methods FOR INSERT TO authenticated
  WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'));

CREATE POLICY "Admins update methods"
  ON public.settling_methods FOR UPDATE TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'));

CREATE POLICY "Admins delete methods"
  ON public.settling_methods FOR DELETE TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'));

-- =========================================================
-- 5) child_settings — admin only for UPDATE
--    (INSERT is already trigger-only; SELECT is read-all-linked-users.)
-- =========================================================
DROP POLICY IF EXISTS "Linked users update settings" ON public.child_settings;

CREATE POLICY "Admins update settings"
  ON public.child_settings FOR UPDATE TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'));

-- ---------------------------------------------------------------------------
-- Rollback (manual):
--
--   DROP FUNCTION IF EXISTS public.has_session_edit_access(uuid, uuid);
--
--   DROP POLICY IF EXISTS "Users and admins insert interruptions" ON public.sleep_interruptions;
--   DROP POLICY IF EXISTS "Users and admins update interruptions" ON public.sleep_interruptions;
--   DROP POLICY IF EXISTS "Users and admins delete interruptions" ON public.sleep_interruptions;
--   CREATE POLICY "Linked users insert interruptions" ON public.sleep_interruptions FOR INSERT TO authenticated
--     WITH CHECK (public.user_has_session_access(auth.uid(), sleep_session_id));
--   CREATE POLICY "Linked users update interruptions" ON public.sleep_interruptions FOR UPDATE TO authenticated
--     USING (public.user_has_session_access(auth.uid(), sleep_session_id));
--   CREATE POLICY "Linked users delete interruptions" ON public.sleep_interruptions FOR DELETE TO authenticated
--     USING (public.user_has_session_access(auth.uid(), sleep_session_id));
--
--   DROP POLICY IF EXISTS "Admins insert places" ON public.sleep_places;
--   DROP POLICY IF EXISTS "Admins update places" ON public.sleep_places;
--   DROP POLICY IF EXISTS "Admins delete places" ON public.sleep_places;
--   CREATE POLICY "Linked users insert places" ON public.sleep_places FOR INSERT TO authenticated WITH CHECK (public.user_has_child_access(auth.uid(), child_id));
--   CREATE POLICY "Linked users update places" ON public.sleep_places FOR UPDATE TO authenticated USING (public.user_has_child_access(auth.uid(), child_id));
--   CREATE POLICY "Linked users delete places" ON public.sleep_places FOR DELETE TO authenticated USING (public.user_has_child_access(auth.uid(), child_id));
--
--   DROP POLICY IF EXISTS "Admins insert methods" ON public.settling_methods;
--   DROP POLICY IF EXISTS "Admins update methods" ON public.settling_methods;
--   DROP POLICY IF EXISTS "Admins delete methods" ON public.settling_methods;
--   CREATE POLICY "Linked users insert methods" ON public.settling_methods FOR INSERT TO authenticated WITH CHECK (public.user_has_child_access(auth.uid(), child_id));
--   CREATE POLICY "Linked users update methods" ON public.settling_methods FOR UPDATE TO authenticated USING (public.user_has_child_access(auth.uid(), child_id));
--   CREATE POLICY "Linked users delete methods" ON public.settling_methods FOR DELETE TO authenticated USING (public.user_has_child_access(auth.uid(), child_id));
--
--   DROP POLICY IF EXISTS "Admins update settings" ON public.child_settings;
--   CREATE POLICY "Linked users update settings" ON public.child_settings FOR UPDATE TO authenticated
--     USING (public.user_has_child_access(auth.uid(), child_id));
-- ---------------------------------------------------------------------------
