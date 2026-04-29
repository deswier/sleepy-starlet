CREATE OR REPLACE FUNCTION public.create_child_with_link(
  _name text,
  _birth_date date,
  _gender gender_type,
  _relation relation_type
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _child_id uuid;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.children (name, birth_date, gender)
  VALUES (_name, _birth_date, _gender)
  RETURNING id INTO _child_id;

  INSERT INTO public.child_users (child_id, user_id, relation_type)
  VALUES (_child_id, _uid, _relation);

  RETURN _child_id;
END;
$$;