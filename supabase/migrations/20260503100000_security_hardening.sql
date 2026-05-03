-- Security hardening: tighten RLS policies and add input validation.
-- Addresses code review findings #2, #3, #4, #37, #38.

-- =========================================================
-- 1) children: drop permissive INSERT policy
-- =========================================================
-- Direct INSERT was allowed for any authenticated user. Creation must go
-- through create_child_with_link RPC (which atomically links the caller).
-- Otherwise an attacker could spam orphan rows + cascade-create defaults
-- via handle_new_child trigger.
DROP POLICY IF EXISTS "Authenticated users can create children" ON public.children;

-- =========================================================
-- 2) child_users: prevent key changes on own link
-- =========================================================
-- The previous UPDATE policy let users change child_id/user_id columns,
-- effectively transferring access. Trigger enforces immutability of keys.
DROP POLICY IF EXISTS "Update own link" ON public.child_users;
CREATE POLICY "Update own link"
  ON public.child_users FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_child_user_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.child_id <> OLD.child_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change child_id or user_id of an existing link';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_child_users_key_immutable ON public.child_users;
CREATE TRIGGER trg_child_users_key_immutable
  BEFORE UPDATE ON public.child_users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_child_user_key_change();

-- =========================================================
-- 3) profiles: restrict visibility to family members
-- =========================================================
-- Previously any authenticated user could see ALL profiles' display_name
-- and language. Now visible only to self + users sharing at least one child.
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles of family members"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.child_users cu1
      JOIN public.child_users cu2 ON cu1.child_id = cu2.child_id
      WHERE cu1.user_id = auth.uid() AND cu2.user_id = profiles.id
    )
  );

-- =========================================================
-- 4) Input length / format constraints
-- =========================================================
-- TEXT columns had no upper bound — clients could insert megabytes.
-- Bounds reflect realistic UI limits.
ALTER TABLE public.children
  ADD CONSTRAINT children_name_length
  CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.children
  ADD CONSTRAINT children_photo_url_format
  CHECK (photo_url IS NULL OR photo_url ~ '^https?://');

ALTER TABLE public.sleep_sessions
  ADD CONSTRAINT sessions_comment_length
  CHECK (comment IS NULL OR char_length(comment) <= 1000);

ALTER TABLE public.sleep_interruptions
  ADD CONSTRAINT interruptions_comment_length
  CHECK (comment IS NULL OR char_length(comment) <= 1000);

ALTER TABLE public.sleep_places
  ADD CONSTRAINT places_name_length
  CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.settling_methods
  ADD CONSTRAINT methods_name_length
  CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_length
  CHECK (display_name IS NULL OR char_length(display_name) <= 100);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_url_format
  CHECK (avatar_url IS NULL OR avatar_url ~ '^https?://');
