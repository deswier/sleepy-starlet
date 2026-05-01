-- 1) Fix the trigger: cast text literals to app_role
CREATE OR REPLACE FUNCTION public.handle_child_user_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing_count int;
BEGIN
  SELECT COUNT(*) INTO _existing_count FROM public.child_user_roles WHERE child_id = NEW.child_id;
  INSERT INTO public.child_user_roles (child_id, user_id, role)
  VALUES (NEW.child_id, NEW.user_id, (CASE WHEN _existing_count = 0 THEN 'admin' ELSE 'user' END)::app_role)
  ON CONFLICT (child_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 2) Add role to invites
ALTER TABLE public.child_invites ADD COLUMN IF NOT EXISTS role app_role NOT NULL DEFAULT 'user';

-- 3) New invite creation with role
CREATE OR REPLACE FUNCTION public.create_child_invite(_child_id uuid, _role app_role DEFAULT 'user')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_child_role(_uid, _child_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can create invites';
  END IF;

  LOOP
    _code := '';
    FOR i IN 1..6 LOOP
      _code := _code || substr(_alphabet, floor(random()*length(_alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.child_invites WHERE code = _code);
  END LOOP;

  INSERT INTO public.child_invites (child_id, code, created_by_user_id, role)
  VALUES (_child_id, _code, _uid, _role);

  RETURN _code;
END;
$function$;

-- 4) Update redeem function to apply invite's role (override default 'user')
CREATE OR REPLACE FUNCTION public.redeem_child_invite(_code text, _relation relation_type DEFAULT 'other'::relation_type, _custom_relation_name text DEFAULT NULL::text, _device_id text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _inv record;
  _cooldown int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  _cooldown := public.invite_cooldown_remaining(_uid, _device_id);
  IF _cooldown > 0 THEN
    RAISE EXCEPTION 'COOLDOWN:%', _cooldown;
  END IF;

  SELECT * INTO _inv FROM public.child_invites WHERE code = upper(_code) FOR UPDATE;

  IF NOT FOUND OR _inv.redeemed_at IS NOT NULL OR _inv.revoked_at IS NOT NULL OR _inv.expires_at < now() THEN
    INSERT INTO public.invite_attempts (user_id, device_id, success) VALUES (_uid, _device_id, false);
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;

  IF EXISTS (SELECT 1 FROM public.child_users WHERE child_id = _inv.child_id AND user_id = _uid) THEN
    UPDATE public.child_invites SET redeemed_at = now(), redeemed_by_user_id = _uid WHERE id = _inv.id;
    INSERT INTO public.invite_attempts (user_id, device_id, success) VALUES (_uid, _device_id, true);
    RETURN _inv.child_id;
  END IF;

  INSERT INTO public.child_users (child_id, user_id, relation_type, custom_relation_name)
  VALUES (_inv.child_id, _uid, _relation, _custom_relation_name);

  -- Override the default 'user' role with the invite's role
  UPDATE public.child_user_roles SET role = _inv.role
    WHERE child_id = _inv.child_id AND user_id = _uid;

  UPDATE public.child_invites SET redeemed_at = now(), redeemed_by_user_id = _uid WHERE id = _inv.id;
  INSERT INTO public.invite_attempts (user_id, device_id, success) VALUES (_uid, _device_id, true);

  RETURN _inv.child_id;
END;
$function$;

-- 5) Allow admins to remove other members from a family
CREATE POLICY "Admins remove members"
ON public.child_users
FOR DELETE
TO authenticated
USING (has_child_role(auth.uid(), child_id, 'admin'::app_role));

-- Also allow admins to delete the corresponding role row
CREATE POLICY "Admins delete role rows"
ON public.child_user_roles
FOR DELETE
TO authenticated
USING (has_child_role(auth.uid(), child_id, 'admin'::app_role));