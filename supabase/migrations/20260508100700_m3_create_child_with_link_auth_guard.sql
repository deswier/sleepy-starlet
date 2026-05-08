-- M-3 fix: add auth.uid() null guard to create_child_with_link.
--
-- The SECURITY DEFINER function bypasses RLS but had no explicit
-- auth.uid() IS NULL check. Every other recent RPC guards this at the
-- top. Today Supabase rejects unauthenticated RPC calls at the API
-- gateway, but the function should be self-contained: if auth.uid()
-- returns NULL (misconfiguration, grant change, or future internal
-- caller), the INSERT into child_users would store NULL as user_id,
-- making the new child immediately orphaned (no owner, no way to manage).

CREATE OR REPLACE FUNCTION public.create_child_with_link(
  _name                 text,
  _birth_date           date,
  _gender               gender_type,
  _relation             relation_type,
  _custom_relation_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_child_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.children (name, birth_date, gender)
  VALUES (_name, _birth_date, _gender)
  RETURNING id INTO new_child_id;

  INSERT INTO public.child_users (child_id, user_id, relation_type, custom_relation_name)
  VALUES (new_child_id, auth.uid(), _relation, _custom_relation_name);

  INSERT INTO public.child_settings (child_id)
  VALUES (new_child_id)
  ON CONFLICT (child_id) DO NOTHING;

  RETURN new_child_id;
END;
$$;

-- Rollback: re-run the version in migration 20260501135844 (remove the
-- auth.uid() IS NULL guard block only).
