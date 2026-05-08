-- C-A / H-C fix: restrict child_invites SELECT to admins only.
--
-- The previous policy "Linked users see invites" used:
--     USING (public.user_has_child_access(auth.uid(), child_id))
-- so every linked user — including viewers — could read every invite row,
-- exposing the `code`, `role`, and creator/redeemer user_ids.
--
-- C-A (privilege escalation): combined with role-bearing invite codes
-- (`child_invites.role`) and the public `redeem_child_invite` RPC, a viewer
-- could read an admin-role invite, sign up a second account, and redeem the
-- code before the intended recipient — landing as full admin on the child.
-- Even a `user`-role invite let a viewer escalate to "user" on a parallel
-- account.
--
-- H-C (information disclosure): even without redemption, viewers learn when
-- admins generate invites, which roles are being handed out, and the user
-- IDs of creators and redeemers.
--
-- The H-3 migration (20260508100400) already locked UPDATE to admins. This
-- migration finishes the lockdown by aligning SELECT with the same gate.
-- INSERT was already admin-only via create_child_invite (which checks
-- has_child_role 'admin' before INSERTing) plus the existing INSERT policy
-- that also requires user_has_child_access + created_by_user_id = auth.uid().
--
-- Frontend impact: Settings.tsx fires the invites SELECT inside load() for
-- all roles, but only renders the result behind canManageMembers(role). With
-- this policy, non-admins receive an empty array (RLS filter, not an error)
-- and the unused state is harmless. NewChild.tsx redeem flow uses the
-- SECURITY DEFINER `redeem_child_invite` RPC which bypasses RLS — unaffected.

DROP POLICY IF EXISTS "Linked users see invites" ON public.child_invites;

CREATE POLICY "Admins see invites"
  ON public.child_invites FOR SELECT TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'));

-- ---------------------------------------------------------------------------
-- Rollback (manual; run only if a regression is detected):
--
--   DROP POLICY IF EXISTS "Admins see invites" ON public.child_invites;
--
--   CREATE POLICY "Linked users see invites" ON public.child_invites
--     FOR SELECT TO authenticated
--     USING (public.user_has_child_access(auth.uid(), child_id));
--
-- Note: rolling back re-opens C-A (viewers can read+redeem admin invites
-- from a second account) and H-C (invite metadata leak). Do not roll back
-- without a compensating control.
-- ---------------------------------------------------------------------------
