-- H-4 fix: atomic member removal via SECURITY DEFINER RPC.
--
-- Settings.tsx removeMember() previously issued two sequential client-side
-- deletes (child_user_roles then child_users). Problems:
--   1. Non-transactional: a failure after the first delete left the member in
--      child_users with no role row — an inconsistent state.
--   2. Not durable: a removed member could immediately re-insert a child_users
--      row (before C-1 was fixed) and rejoin with a fresh trigger-created role.
--   3. Relied purely on the client's isAdmin guard; no server-side role check
--      before the raw deletes.
--
-- This RPC wraps both deletes in one transaction, enforces admin access
-- server-side, blocks self-removal (use leave_child instead), and lets the
-- C-3 trigger (prevent_last_admin_removal) raise if removing this member
-- would orphan the child.

CREATE OR REPLACE FUNCTION public.remove_child_member(
  _child_id       uuid,
  _member_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_child_role(auth.uid(), _child_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can remove members';
  END IF;

  -- Self-removal must go through leave_child so the last-owner invariant
  -- and child-deletion cascade are handled correctly.
  IF _member_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use leave_child to remove yourself from a child';
  END IF;

  -- Verify the target is actually a member (fail loudly rather than silently).
  IF NOT EXISTS (
    SELECT 1 FROM public.child_users
    WHERE child_id = _child_id AND user_id = _member_user_id
  ) THEN
    RAISE EXCEPTION 'User is not a member of this child';
  END IF;

  -- The prevent_last_admin_removal trigger fires here and raises if removing
  -- this member's admin role would leave the child with no admin.
  DELETE FROM public.child_user_roles
  WHERE child_id = _child_id AND user_id = _member_user_id;

  DELETE FROM public.child_users
  WHERE child_id = _child_id AND user_id = _member_user_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS public.remove_child_member(uuid, uuid);
-- (Restore direct-delete pattern in Settings.tsx removeMember if needed.)
-- ---------------------------------------------------------------------------
