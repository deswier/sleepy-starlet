-- Fix session UPDATE/DELETE and has_session_edit_access:
-- the original "Owners and admins" policies (migration 20260501182641) and
-- the helper introduced in 20260508101000 only checked created_by_user_id,
-- which was too restrictive.
--
-- Correct permission model for 'user' role:
--   • Stop  (UPDATE end_time on an active session): allowed for any user/admin.
--     A partner can always wake the baby — they shouldn't need to be the one
--     who started the sleep.
--   • Edit  (UPDATE or DELETE a completed session): allowed only if the caller
--     created_by_user_id = auth.uid()   — they started the sleep
--     OR updated_by_user_id = auth.uid() — they ended / last edited the sleep
--   • Admin always has full access.

-- =========================================================
-- 1) Update the helper used by sleep_interruptions policies.
--    Old: user allowed only when created_by_user_id = _user_id.
--    New: also allowed when session is still active (end_time IS NULL)
--         or the user was the last to update it (updated_by_user_id).
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
    FROM   public.sleep_sessions   s
    JOIN   public.child_user_roles cur
           ON  cur.child_id = s.child_id
           AND cur.user_id  = _user_id
    WHERE  s.id = _session_id
      AND (
        cur.role = 'admin'::app_role
        OR (
          cur.role = 'user'::app_role
          AND (
            s.end_time IS NULL                    -- any user can stop active sleep
            OR s.created_by_user_id = _user_id    -- they started it
            OR s.updated_by_user_id = _user_id    -- they ended / last edited it
          )
        )
      )
  );
$$;

-- =========================================================
-- 2) sleep_sessions UPDATE — replace the old policy.
--    Same three-condition check for 'user' role.
-- =========================================================
DROP POLICY IF EXISTS "Owners and admins update sessions" ON public.sleep_sessions;

CREATE POLICY "Owners and admins update sessions"
  ON public.sleep_sessions FOR UPDATE TO authenticated
  USING (
    public.user_has_child_access(auth.uid(), child_id)
    AND (
      public.has_child_role(auth.uid(), child_id, 'admin')
      OR (
        public.has_child_role(auth.uid(), child_id, 'user')
        AND (
          end_time IS NULL                    -- stop any active sleep
          OR created_by_user_id = auth.uid() -- edit what they started
          OR updated_by_user_id = auth.uid() -- edit what they ended / last edited
        )
      )
    )
  );

-- =========================================================
-- 3) sleep_sessions DELETE — replace the old policy.
--    No end_time IS NULL here: deleting an active session is not a
--    supported flow (there is no delete button for active sessions in the UI).
-- =========================================================
DROP POLICY IF EXISTS "Owners and admins delete sessions" ON public.sleep_sessions;

CREATE POLICY "Owners and admins delete sessions"
  ON public.sleep_sessions FOR DELETE TO authenticated
  USING (
    public.user_has_child_access(auth.uid(), child_id)
    AND (
      public.has_child_role(auth.uid(), child_id, 'admin')
      OR (
        public.has_child_role(auth.uid(), child_id, 'user')
        AND (
          created_by_user_id = auth.uid()    -- they started it
          OR updated_by_user_id = auth.uid() -- they ended / last edited it
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Rollback (manual):
--
--   CREATE OR REPLACE FUNCTION public.has_session_edit_access(_user_id uuid, _session_id uuid)
--   RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--     SELECT EXISTS (
--       SELECT 1 FROM public.sleep_sessions s
--       JOIN public.child_user_roles cur ON cur.child_id = s.child_id AND cur.user_id = _user_id
--       WHERE s.id = _session_id
--         AND (cur.role = 'admin'::app_role
--          OR (cur.role = 'user'::app_role AND s.created_by_user_id = _user_id))
--     );
--   $$;
--
--   DROP POLICY IF EXISTS "Owners and admins update sessions" ON public.sleep_sessions;
--   CREATE POLICY "Owners and admins update sessions" ON public.sleep_sessions FOR UPDATE TO authenticated
--     USING (
--       public.user_has_child_access(auth.uid(), child_id)
--       AND (public.has_child_role(auth.uid(), child_id, 'admin')
--         OR (public.has_child_role(auth.uid(), child_id, 'user') AND created_by_user_id = auth.uid()))
--     );
--
--   DROP POLICY IF EXISTS "Owners and admins delete sessions" ON public.sleep_sessions;
--   CREATE POLICY "Owners and admins delete sessions" ON public.sleep_sessions FOR DELETE TO authenticated
--     USING (
--       public.user_has_child_access(auth.uid(), child_id)
--       AND (public.has_child_role(auth.uid(), child_id, 'admin')
--         OR (public.has_child_role(auth.uid(), child_id, 'user') AND created_by_user_id = auth.uid()))
--     );
-- ---------------------------------------------------------------------------
