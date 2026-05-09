-- C-3 fix: prevent demoting or deleting the last admin of a shared child.
--
-- The "Admins manage roles" FOR ALL policy lets any admin UPDATE or DELETE
-- any role row, including their own. No previous guard blocked an admin from
-- self-demoting (UPDATE role 'admin' → 'user') or deleting their own role row
-- while being the sole admin of a family with other members — leaving the
-- child permanently orphaned (zero admins, no way to manage it without a
-- manual DB fix).
--
-- The attack chain (after C-1 + C-2): a malicious actor who self-promoted
-- to admin (via the now-fixed self-INSERT bugs) could then demote the
-- legitimate admin and leave, permanently locking them out.
--
-- Fix: add a BEFORE UPDATE OR DELETE trigger that mirrors the guard inside
-- the leave_child and delete_my_account_data RPCs. Those RPCs already refuse
-- to let the sole admin leave while other members exist; this trigger closes
-- the same gap for direct UPDATE/DELETE on the table.
--
-- Trigger behaviour:
--   UPDATE: fires only when OLD.role = 'admin' AND NEW.role != 'admin'
--   DELETE: fires only when OLD.role = 'admin'
--   Allows the operation when:
--     - the child is not active (soft-deleted / purged) → no-op guard
--     - at least one other admin exists on the child → safe to proceed
--     - no other members exist (sole owner leaving their own child) → allowed
--   Raises when the affected row is the sole admin and other members exist.
--
-- Notes on cascade safety:
--   child_user_roles has NO FK to children (see migration 20260501182641),
--   so purge_expired_children does not cascade into this table and the
--   trigger is never fired from that path. The status = 'active' check is
--   present as defence-in-depth in case a FK is added in the future.
--
-- Existing RPCs (leave_child, delete_my_account_data) already check the sole-
-- admin condition before deleting; the trigger adds a server-enforced safety
-- net for any code path that bypasses the RPCs (e.g., direct UPDATE/DELETE
-- from an admin client, as Settings.tsx does for role changes and member
-- removal).

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _other_admins  int;
  _other_members int;
BEGIN
  -- Only guard transitions away from the 'admin' role.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role <> 'admin' OR NEW.role = 'admin' THEN RETURN NEW; END IF;
  ELSE -- DELETE
    IF OLD.role <> 'admin' THEN RETURN OLD; END IF;
  END IF;

  -- Skip guard for soft-deleted or already-purged children.
  IF NOT EXISTS (
    SELECT 1 FROM public.children WHERE id = OLD.child_id AND status = 'active'
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- How many other admins remain after this operation?
  SELECT COUNT(*) INTO _other_admins
  FROM public.child_user_roles
  WHERE child_id = OLD.child_id
    AND user_id <> OLD.user_id
    AND role = 'admin';

  -- How many other members (any role) remain?
  SELECT COUNT(*) INTO _other_members
  FROM public.child_users
  WHERE child_id = OLD.child_id
    AND user_id <> OLD.user_id;

  -- Block only when this is the sole admin AND others are still in the family.
  -- (Sole owner with no other members may leave/delete freely.)
  IF _other_admins = 0 AND _other_members > 0 THEN
    RAISE EXCEPTION
      'Cannot demote or remove the last admin of a shared child. Assign another admin first.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_child_user_roles_last_admin ON public.child_user_roles;
CREATE TRIGGER trg_child_user_roles_last_admin
  BEFORE UPDATE OR DELETE ON public.child_user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- ---------------------------------------------------------------------------
-- Rollback (manual):
--
--   DROP TRIGGER IF EXISTS trg_child_user_roles_last_admin ON public.child_user_roles;
--   DROP FUNCTION IF EXISTS public.prevent_last_admin_removal();
--
-- Note: rolling back re-opens C-3 (sole admin can self-demote, orphaning
-- shared children). Do not roll back without a compensating control.
-- ---------------------------------------------------------------------------
