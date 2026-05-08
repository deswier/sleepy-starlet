-- H-3 fix: restrict child_invites UPDATE (revoke) to admins only.
--
-- The previous policy "Linked users revoke invites" used:
--     USING (public.user_has_child_access(auth.uid(), child_id))
-- meaning any member — including viewers — could flip revoked_at / redeemed_at
-- on any invite, allowing a malicious member to silently deny codes the admin
-- was distributing. The RPC create_child_invite already required admin role,
-- but RLS is the actual enforcement boundary, not the RPC.

DROP POLICY IF EXISTS "Linked users revoke invites" ON public.child_invites;

CREATE POLICY "Admins revoke invites"
  ON public.child_invites FOR UPDATE TO authenticated
  USING  (public.has_child_role(auth.uid(), child_id, 'admin'))
  WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'));

-- ---------------------------------------------------------------------------
-- Rollback (manual):
--
--   DROP POLICY IF EXISTS "Admins revoke invites" ON public.child_invites;
--
--   CREATE POLICY "Linked users revoke invites" ON public.child_invites
--     FOR UPDATE TO authenticated
--     USING (public.user_has_child_access(auth.uid(), child_id));
-- ---------------------------------------------------------------------------
