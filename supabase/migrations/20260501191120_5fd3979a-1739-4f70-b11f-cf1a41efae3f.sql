CREATE OR REPLACE FUNCTION public.invite_cooldown_remaining(_user_id uuid, _device_id text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;