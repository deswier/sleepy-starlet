-- 1. Roles enum + table
CREATE TYPE public.app_role AS ENUM ('viewer', 'user', 'admin');

CREATE TABLE public.child_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (child_id, user_id)
);

ALTER TABLE public.child_user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_child_role(_user_id uuid, _child_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_user_roles
    WHERE user_id = _user_id AND child_id = _child_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_child_role(_user_id uuid, _child_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.child_user_roles WHERE user_id = _user_id AND child_id = _child_id LIMIT 1;
$$;

CREATE POLICY "Linked users see roles" ON public.child_user_roles
  FOR SELECT TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

CREATE POLICY "Admins manage roles" ON public.child_user_roles
  FOR ALL TO authenticated
  USING (public.has_child_role(auth.uid(), child_id, 'admin'))
  WITH CHECK (public.has_child_role(auth.uid(), child_id, 'admin'));

CREATE POLICY "Self insert default role" ON public.child_user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2. Backfill: oldest link per child becomes admin, others default 'user'
INSERT INTO public.child_user_roles (child_id, user_id, role)
SELECT cu.child_id, cu.user_id,
  CASE WHEN cu.created_at = MIN(cu.created_at) OVER (PARTITION BY cu.child_id)
       THEN 'admin'::public.app_role ELSE 'user'::public.app_role END
FROM public.child_users cu
ON CONFLICT (child_id, user_id) DO NOTHING;

-- 3. Auto-create role row when a user is linked
CREATE OR REPLACE FUNCTION public.handle_child_user_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing_count int;
BEGIN
  SELECT COUNT(*) INTO _existing_count FROM public.child_user_roles WHERE child_id = NEW.child_id;
  INSERT INTO public.child_user_roles (child_id, user_id, role)
  VALUES (NEW.child_id, NEW.user_id, CASE WHEN _existing_count = 0 THEN 'admin' ELSE 'user' END)
  ON CONFLICT (child_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_child_user_link ON public.child_users;
CREATE TRIGGER on_child_user_link
  AFTER INSERT ON public.child_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_child_user_link();

-- 4. Update RLS for sleep_sessions: viewer read-only, user own, admin all
DROP POLICY IF EXISTS "Linked users insert sessions" ON public.sleep_sessions;
DROP POLICY IF EXISTS "Linked users update sessions" ON public.sleep_sessions;
DROP POLICY IF EXISTS "Linked users delete sessions" ON public.sleep_sessions;

CREATE POLICY "Users and admins insert sessions" ON public.sleep_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_child_access(auth.uid(), child_id)
    AND (public.has_child_role(auth.uid(), child_id, 'user')
      OR public.has_child_role(auth.uid(), child_id, 'admin'))
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "Owners and admins update sessions" ON public.sleep_sessions
  FOR UPDATE TO authenticated
  USING (
    public.user_has_child_access(auth.uid(), child_id)
    AND (public.has_child_role(auth.uid(), child_id, 'admin')
      OR (public.has_child_role(auth.uid(), child_id, 'user') AND created_by_user_id = auth.uid()))
  );

CREATE POLICY "Owners and admins delete sessions" ON public.sleep_sessions
  FOR DELETE TO authenticated
  USING (
    public.user_has_child_access(auth.uid(), child_id)
    AND (public.has_child_role(auth.uid(), child_id, 'admin')
      OR (public.has_child_role(auth.uid(), child_id, 'user') AND created_by_user_id = auth.uid()))
  );

-- 5. Children profile: only admin can update/delete
DROP POLICY IF EXISTS "Linked users update children" ON public.children;
DROP POLICY IF EXISTS "Linked users delete children" ON public.children;

CREATE POLICY "Admins update children" ON public.children
  FOR UPDATE TO authenticated
  USING (public.has_child_role(auth.uid(), id, 'admin'));

CREATE POLICY "Admins delete children" ON public.children
  FOR DELETE TO authenticated
  USING (public.has_child_role(auth.uid(), id, 'admin'));

-- 6. Invite attempts table for brute-force protection
CREATE TABLE public.invite_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  device_id text,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invite_attempts_user ON public.invite_attempts (user_id, attempted_at DESC);
CREATE INDEX idx_invite_attempts_device ON public.invite_attempts (device_id, attempted_at DESC);

ALTER TABLE public.invite_attempts ENABLE ROW LEVEL SECURITY;
-- Only the SECURITY DEFINER function reads/writes; deny-all by default (no policies => no access).

-- 7. Cooldown calculation helper
CREATE OR REPLACE FUNCTION public.invite_cooldown_remaining(_user_id uuid, _device_id text)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _fail_count int;
  _last_fail timestamptz;
  _cooldown_seconds int := 0;
BEGIN
  SELECT COUNT(*), MAX(attempted_at) INTO _fail_count, _last_fail
  FROM public.invite_attempts
  WHERE success = false
    AND attempted_at > now() - interval '24 hours'
    AND ((user_id IS NOT NULL AND user_id = _user_id)
         OR (device_id IS NOT NULL AND device_id = _device_id));

  IF _fail_count >= 10 THEN _cooldown_seconds := 4 * 60 * 60;
  ELSIF _fail_count >= 9 THEN _cooldown_seconds := 30 * 60;
  ELSIF _fail_count >= 8 THEN _cooldown_seconds := 15 * 60;
  ELSIF _fail_count >= 7 THEN _cooldown_seconds := 5 * 60;
  ELSIF _fail_count >= 6 THEN _cooldown_seconds := 60;
  ELSE RETURN 0;
  END IF;

  RETURN GREATEST(0, _cooldown_seconds - EXTRACT(EPOCH FROM (now() - _last_fail))::int);
END;
$$;

-- 8. Updated redeem function with attempt tracking + cooldown
DROP FUNCTION IF EXISTS public.redeem_child_invite(text, public.relation_type, text);

CREATE OR REPLACE FUNCTION public.redeem_child_invite(
  _code text,
  _relation public.relation_type DEFAULT 'other'::public.relation_type,
  _custom_relation_name text DEFAULT NULL,
  _device_id text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  UPDATE public.child_invites SET redeemed_at = now(), redeemed_by_user_id = _uid WHERE id = _inv.id;
  INSERT INTO public.invite_attempts (user_id, device_id, success) VALUES (_uid, _device_id, true);

  RETURN _inv.child_id;
END;
$$;

-- 9. Realtime
ALTER TABLE public.sleep_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.sleep_interruptions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sleep_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sleep_interruptions;
