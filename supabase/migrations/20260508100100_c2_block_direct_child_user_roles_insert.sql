-- C-2 fix: block direct client INSERT on public.child_user_roles.
--
-- The previous policy "Self insert default role" had the predicate
--     WITH CHECK (user_id = auth.uid())
-- with no constraint on the role value and no membership check. That let any
-- authenticated user insert a child_user_roles row claiming any role on any
-- child_id they could name — including 'admin' on a child they have no
-- relationship with.
--
-- Standalone impact (independent of C-1): every admin-gated RPC checks
-- has_child_role(auth.uid(), child_id, 'admin'), which reads child_user_roles
-- directly. So a planted 'admin' row was enough to invoke soft_delete_child,
-- restore_child, create_child_invite, etc. on a stranger's child.
--
-- Combined with C-1, an attacker could pre-empt the handle_child_user_link
-- trigger (which uses ON CONFLICT DO NOTHING) by inserting an 'admin' role
-- row before joining child_users. Although redeem_child_invite UPDATEs the
-- role back to the invited value, the standalone path above was always
-- exploitable.
--
-- The only legitimate INSERT paths are:
--   - handle_child_user_link trigger (AFTER INSERT on child_users; SECURITY DEFINER)
--   - the historical backfill in migration 20260501182641 (runs at migration time)
-- Both bypass RLS. No client code performs a direct INSERT into
-- child_user_roles (verified by grep: only SELECT in ChildContext.tsx,
-- DeletedChildren.tsx, Settings.tsx, Profile.tsx; admin-gated UPDATE/DELETE
-- in Settings.tsx, both already covered by "Admins manage roles").
--
-- This migration touches only the broken self-INSERT policy. SELECT and the
-- "Admins manage roles" FOR ALL policy (which still grants admins INSERT /
-- UPDATE / DELETE) are left untouched.

DROP POLICY IF EXISTS "Self insert default role" ON public.child_user_roles;

CREATE POLICY "Block direct insert; use trigger or RPC"
  ON public.child_user_roles FOR INSERT TO authenticated
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Rollback (manual; run only if a regression is detected):
--
--   DROP POLICY IF EXISTS "Block direct insert; use trigger or RPC" ON public.child_user_roles;
--
--   CREATE POLICY "Self insert default role" ON public.child_user_roles
--     FOR INSERT TO authenticated
--     WITH CHECK (user_id = auth.uid());
--
-- Note: rolling back re-opens C-2 (planting fake admin rows on arbitrary
-- child_ids). Do not roll back without a compensating control.
-- ---------------------------------------------------------------------------
