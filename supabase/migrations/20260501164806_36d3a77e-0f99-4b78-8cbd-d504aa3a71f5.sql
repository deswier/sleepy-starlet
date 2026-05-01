-- Invites for sharing a child profile with another caregiver
CREATE TABLE public.child_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  redeemed_at timestamptz,
  redeemed_by_user_id uuid,
  revoked_at timestamptz
);

CREATE INDEX idx_child_invites_child ON public.child_invites(child_id);
CREATE INDEX idx_child_invites_code ON public.child_invites(code);

ALTER TABLE public.child_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Linked users see invites"
ON public.child_invites FOR SELECT TO authenticated
USING (public.user_has_child_access(auth.uid(), child_id));

CREATE POLICY "Linked users insert invites"
ON public.child_invites FOR INSERT TO authenticated
WITH CHECK (public.user_has_child_access(auth.uid(), child_id) AND created_by_user_id = auth.uid());

CREATE POLICY "Linked users revoke invites"
ON public.child_invites FOR UPDATE TO authenticated
USING (public.user_has_child_access(auth.uid(), child_id));

CREATE POLICY "Linked users delete invites"
ON public.child_invites FOR DELETE TO authenticated
USING (public.user_has_child_access(auth.uid(), child_id));

-- Generate a 6-char alphanumeric invite code (letters+digits, no ambiguous chars)
CREATE OR REPLACE FUNCTION public.create_child_invite(_child_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.user_has_child_access(_uid, _child_id) THEN
    RAISE EXCEPTION 'No access to this child';
  END IF;

  LOOP
    _code := '';
    FOR i IN 1..6 LOOP
      _code := _code || substr(_alphabet, floor(random()*length(_alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.child_invites WHERE code = _code);
  END LOOP;

  INSERT INTO public.child_invites (child_id, code, created_by_user_id)
  VALUES (_child_id, _code, _uid);

  RETURN _code;
END;
$$;

-- Redeem an invite, linking caller to the child
CREATE OR REPLACE FUNCTION public.redeem_child_invite(_code text, _relation relation_type DEFAULT 'other', _custom_relation_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _inv FROM public.child_invites WHERE code = upper(_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid code'; END IF;
  IF _inv.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Code already used'; END IF;
  IF _inv.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Code revoked'; END IF;
  IF _inv.expires_at < now() THEN RAISE EXCEPTION 'Code expired'; END IF;

  -- Already linked? Just return the child id
  IF EXISTS (SELECT 1 FROM public.child_users WHERE child_id = _inv.child_id AND user_id = _uid) THEN
    UPDATE public.child_invites SET redeemed_at = now(), redeemed_by_user_id = _uid WHERE id = _inv.id;
    RETURN _inv.child_id;
  END IF;

  INSERT INTO public.child_users (child_id, user_id, relation_type, custom_relation_name)
  VALUES (_inv.child_id, _uid, _relation, _custom_relation_name);

  UPDATE public.child_invites SET redeemed_at = now(), redeemed_by_user_id = _uid WHERE id = _inv.id;

  RETURN _inv.child_id;
END;
$$;
