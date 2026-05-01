CREATE OR REPLACE FUNCTION public.create_child_with_link(
  _name text,
  _birth_date date,
  _gender gender_type,
  _relation relation_type,
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
  INSERT INTO public.children (name, birth_date, gender)
  VALUES (_name, _birth_date, _gender)
  RETURNING id INTO new_child_id;

  INSERT INTO public.child_users (child_id, user_id, relation_type, custom_relation_name)
  VALUES (new_child_id, auth.uid(), _relation, _custom_relation_name);

  -- Default child_settings row should be created via trigger if it exists; otherwise create here
  INSERT INTO public.child_settings (child_id)
  VALUES (new_child_id)
  ON CONFLICT (child_id) DO NOTHING;

  RETURN new_child_id;
END;
$$;