-- =========================================================
-- Soft-delete + account-deletion infrastructure.
-- Adds 30-day restore window for children, fixes user-attribution FKs
-- so deleting a user no longer blocks on sleep records, and provides
-- RPCs that the UI uses for membership / account-deletion flows.
-- =========================================================

-- 1) Children: soft-delete columns.
ALTER TABLE public.children
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deleted')),
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN deletion_scheduled_at timestamptz;

CREATE INDEX idx_children_active ON public.children(id) WHERE status = 'active';
CREATE INDEX idx_children_deletion_scheduled ON public.children(deletion_scheduled_at)
  WHERE status = 'deleted';

-- 2) Drop the deletion blocks on user-attribution columns. Without these
--    changes auth.users.delete fails the moment any sleep record references
--    the user. SET NULL keeps the data for other family members and just
--    blanks the "created by" attribution.
ALTER TABLE public.sleep_sessions
  DROP CONSTRAINT sleep_sessions_created_by_user_id_fkey,
  ADD CONSTRAINT sleep_sessions_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_sessions
  DROP CONSTRAINT sleep_sessions_updated_by_user_id_fkey,
  ADD CONSTRAINT sleep_sessions_updated_by_user_id_fkey
    FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sleep_interruptions
  DROP CONSTRAINT sleep_interruptions_created_by_user_id_fkey,
  ADD CONSTRAINT sleep_interruptions_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2b) child_user_roles was created without explicit FKs. Add them now so that
-- hard-deleting a child or auth.users row cleans up role rows automatically
-- (otherwise they'd linger as orphans).
ALTER TABLE public.child_user_roles
  ADD CONSTRAINT child_user_roles_child_id_fkey
    FOREIGN KEY (child_id) REFERENCES public.children(id) ON DELETE CASCADE,
  ADD CONSTRAINT child_user_roles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- =========================================================
-- 3) RPC: soft-delete a child (admin/owner only).
-- =========================================================
CREATE OR REPLACE FUNCTION public.soft_delete_child(_child_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_child_role(auth.uid(), _child_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only owners can delete a child';
  END IF;
  UPDATE public.children
     SET status = 'deleted',
         deleted_at = now(),
         deleted_by_user_id = auth.uid(),
         deletion_scheduled_at = now() + INTERVAL '30 days'
   WHERE id = _child_id AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_child(uuid) TO authenticated;

-- =========================================================
-- 4) RPC: restore a soft-deleted child (admin/owner only, ≤30 days).
-- =========================================================
CREATE OR REPLACE FUNCTION public.restore_child(_child_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _scheduled timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_child_role(auth.uid(), _child_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only owners can restore a child';
  END IF;
  SELECT deletion_scheduled_at INTO _scheduled FROM public.children WHERE id = _child_id;
  IF _scheduled IS NULL OR _scheduled < now() THEN
    RAISE EXCEPTION 'Restore window has expired';
  END IF;
  UPDATE public.children
     SET status = 'active',
         deleted_at = NULL,
         deleted_by_user_id = NULL,
         deletion_scheduled_at = NULL
   WHERE id = _child_id AND status = 'deleted';
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_child(uuid) TO authenticated;

-- =========================================================
-- 5) RPC: leave a child (remove self from membership).
-- Blocked if I'm the sole admin AND other members exist (would orphan
-- the child for those members). Editors/viewers always allowed.
-- =========================================================
CREATE OR REPLACE FUNCTION public.leave_child(_child_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
  _other_admins int;
  _other_members int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.child_users
     WHERE child_id = _child_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  _is_admin := public.has_child_role(auth.uid(), _child_id, 'admin'::app_role);
  SELECT COUNT(*) INTO _other_admins FROM public.child_user_roles
   WHERE child_id = _child_id AND role = 'admin' AND user_id <> auth.uid();
  SELECT COUNT(*) INTO _other_members FROM public.child_users
   WHERE child_id = _child_id AND user_id <> auth.uid();

  IF _is_admin AND _other_admins = 0 AND _other_members > 0 THEN
    RAISE EXCEPTION 'You are the only owner — assign another or delete the child';
  END IF;

  DELETE FROM public.child_user_roles
   WHERE child_id = _child_id AND user_id = auth.uid();
  DELETE FROM public.child_users
   WHERE child_id = _child_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_child(uuid) TO authenticated;

-- =========================================================
-- 6) RPC: preview my account deletion. Returns JSON for an honest UI.
-- Three buckets:
--   blocking         — I'm sole admin & other members exist (BLOCKS deletion)
--   solo_destructive — I'm sole member (child + history will be permanently lost)
--   unlink           — others remain (I'll just be removed)
-- =========================================================
CREATE OR REPLACE FUNCTION public.account_deletion_check()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
STABLE
AS $$
DECLARE
  _blocking jsonb;
  _solo jsonb;
  _unlink jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
    INTO _blocking
    FROM public.children c
    JOIN public.child_user_roles cur
      ON cur.child_id = c.id AND cur.user_id = auth.uid() AND cur.role = 'admin'
   WHERE c.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.child_user_roles cur2
        WHERE cur2.child_id = c.id AND cur2.role = 'admin'
          AND cur2.user_id <> auth.uid()
     )
     AND EXISTS (
       SELECT 1 FROM public.child_users cu2
        WHERE cu2.child_id = c.id AND cu2.user_id <> auth.uid()
     );

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
    INTO _solo
    FROM public.children c
    JOIN public.child_users cu ON cu.child_id = c.id AND cu.user_id = auth.uid()
   WHERE c.status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM public.child_users cu2
        WHERE cu2.child_id = c.id AND cu2.user_id <> auth.uid()
     );

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)), '[]'::jsonb)
    INTO _unlink
    FROM public.children c
    JOIN public.child_users cu ON cu.child_id = c.id AND cu.user_id = auth.uid()
   WHERE c.status = 'active'
     AND EXISTS (
       SELECT 1 FROM public.child_users cu2
        WHERE cu2.child_id = c.id AND cu2.user_id <> auth.uid()
     )
     AND NOT (
       EXISTS (
         SELECT 1 FROM public.child_user_roles cur
          WHERE cur.child_id = c.id AND cur.user_id = auth.uid() AND cur.role = 'admin'
       ) AND NOT EXISTS (
         SELECT 1 FROM public.child_user_roles cur2
          WHERE cur2.child_id = c.id AND cur2.role = 'admin'
            AND cur2.user_id <> auth.uid()
       )
     );

  RETURN jsonb_build_object(
    'blocking', _blocking,
    'solo_destructive', _solo,
    'unlink', _unlink,
    'is_blocked', jsonb_array_length(_blocking) > 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.account_deletion_check() TO authenticated;

-- =========================================================
-- 7) RPC: data-side cleanup of my account.
-- Re-validates blocking conditions (defensive against UI desync).
-- Returns the user_id so the Edge Function can complete with auth.admin.deleteUser.
-- =========================================================
CREATE OR REPLACE FUNCTION public.delete_my_account_data()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _check jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT public.account_deletion_check() INTO _check;
  IF (_check->>'is_blocked')::boolean THEN
    RAISE EXCEPTION 'Cannot delete account: you are the only owner of a shared child';
  END IF;

  -- Permanently delete children where I'm the sole member; cascade handles
  -- child_users, child_user_roles, child_settings, sleep_sessions, etc.
  DELETE FROM public.children
   WHERE id IN (
     SELECT c.id
       FROM public.children c
       JOIN public.child_users cu ON cu.child_id = c.id AND cu.user_id = _uid
      WHERE c.status IN ('active', 'deleted')
        AND NOT EXISTS (
          SELECT 1 FROM public.child_users cu2
           WHERE cu2.child_id = c.id AND cu2.user_id <> _uid
        )
   );

  -- Invalidate any pending invites I created for shared families.
  UPDATE public.child_invites
     SET revoked_at = now()
   WHERE created_by_user_id = _uid
     AND revoked_at IS NULL AND redeemed_at IS NULL;

  -- Remove my membership rows from the remaining (shared) children.
  DELETE FROM public.child_user_roles WHERE user_id = _uid;
  DELETE FROM public.child_users WHERE user_id = _uid;
  DELETE FROM public.profiles WHERE id = _uid;

  RETURN _uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;

-- =========================================================
-- 8) Maintenance: hard-delete soft-deleted children whose 30-day window
-- has elapsed. Wire up via pg_cron or Supabase Scheduled Functions, e.g.:
--   select cron.schedule('purge-children', '0 3 * * *',
--     $$ select public.purge_expired_children() $$);
-- =========================================================
CREATE OR REPLACE FUNCTION public.purge_expired_children()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  WITH d AS (
    DELETE FROM public.children
     WHERE status = 'deleted' AND deletion_scheduled_at < now()
     RETURNING 1
  ) SELECT count(*) INTO _n FROM d;
  RETURN COALESCE(_n, 0);
END;
$$;
