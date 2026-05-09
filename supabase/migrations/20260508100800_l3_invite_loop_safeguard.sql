-- L-3 fix: add iteration cap to the invite-code collision loop.
--
-- The LOOP in create_child_invite has no upper bound. With 32^6 ≈ 10^9
-- possible codes and sparse usage this is practically fine, but a flood
-- of active codes (or a deliberate exhaustion attack) could spin the loop
-- indefinitely, burning CPU on the DB server. A cap of 100 is far above
-- any realistic collision probability while providing a clear failure mode.

CREATE OR REPLACE FUNCTION public.create_child_invite(
  _child_id uuid,
  _role     app_role DEFAULT 'user'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid      uuid := auth.uid();
  _code     text;
  _alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i         int;
  _attempts int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT public.has_child_role(_uid, _child_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can create invites';
  END IF;

  LOOP
    _attempts := _attempts + 1;
    IF _attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate a unique invite code; try again later';
    END IF;
    _code := '';
    FOR i IN 1..6 LOOP
      _code := _code || substr(_alphabet, floor(random() * length(_alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.child_invites WHERE code = _code);
  END LOOP;

  INSERT INTO public.child_invites (child_id, code, created_by_user_id, role)
  VALUES (_child_id, _code, _uid, _role);

  RETURN _code;
END;
$function$;

-- Rollback: re-run version from migration 20260501204805 (remove _attempts
-- counter and the IF _attempts > 100 guard block only).
