-- C-1 fix: block direct client INSERT on public.child_users.
--
-- The previous policy "Insert own link or to a shared child" had the predicate
--     WITH CHECK (user_id = auth.uid() OR public.user_has_child_access(auth.uid(), child_id))
-- The first branch let any authenticated user link themselves to ANY child by
-- knowing the child_id (a UUID guess / leak / screenshot). Because every
-- per-child SELECT/UPDATE policy delegates to user_has_child_access — which
-- checks the existence of a child_users row — that single INSERT granted full
-- read access to a stranger's family data and (via the handle_child_user_link
-- trigger) a 'user'-role row that allows writing sleep sessions.
--
-- The only legitimate INSERT paths are the two SECURITY DEFINER RPCs:
--   - public.create_child_with_link  (initial owner link on child creation)
--   - public.redeem_child_invite     (invite-code redemption)
-- Both run with definer privileges and therefore bypass RLS, so denying every
-- INSERT at the policy layer does not break them. No client code performs a
-- direct INSERT into child_users (verified by grep: only SELECT in
-- ChildContext.tsx + Settings.tsx, and admin-gated DELETE in Settings.tsx).
--
-- This migration touches only INSERT. SELECT / UPDATE / DELETE policies and
-- the prevent_child_user_key_change trigger are left untouched.

DROP POLICY IF EXISTS "Insert own link or to a shared child" ON public.child_users;

CREATE POLICY "Block direct insert; use RPCs"
  ON public.child_users FOR INSERT TO authenticated
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Rollback (manual; run only if a regression is detected):
--
--   DROP POLICY IF EXISTS "Block direct insert; use RPCs" ON public.child_users;
--
--   CREATE POLICY "Insert own link or to a shared child"
--     ON public.child_users FOR INSERT TO authenticated
--     WITH CHECK (user_id = auth.uid() OR public.user_has_child_access(auth.uid(), child_id));
--
-- Note: rolling back re-opens C-1. Do not roll back without a compensating
-- control (e.g., moving the missing flow into a SECURITY DEFINER RPC first).
-- ---------------------------------------------------------------------------
