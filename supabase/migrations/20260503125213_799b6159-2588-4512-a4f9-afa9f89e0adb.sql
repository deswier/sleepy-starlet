CREATE OR REPLACE FUNCTION public.sync_session_interruptions(
  _session_id uuid,
  _interruptions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _keep_ids uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.user_has_session_access(_uid, _session_id) THEN
    RAISE EXCEPTION 'No access to this session';
  END IF;

  -- Collect ids of items the client wants to keep (with non-null id).
  SELECT COALESCE(array_agg((elem->>'id')::uuid) FILTER (WHERE elem->>'id' IS NOT NULL), '{}')
    INTO _keep_ids
  FROM jsonb_array_elements(COALESCE(_interruptions, '[]'::jsonb)) AS elem;

  -- Delete interruptions that are no longer present.
  DELETE FROM public.sleep_interruptions
  WHERE sleep_session_id = _session_id
    AND NOT (id = ANY(_keep_ids));

  -- Upsert each interruption.
  INSERT INTO public.sleep_interruptions
    (id, sleep_session_id, start_time, end_time, settling_method_id, created_by_user_id)
  SELECT
    COALESCE((elem->>'id')::uuid, gen_random_uuid()),
    _session_id,
    (elem->>'start_time')::timestamptz,
    NULLIF(elem->>'end_time', '')::timestamptz,
    NULLIF(elem->>'settling_method_id', '')::uuid,
    _uid
  FROM jsonb_array_elements(COALESCE(_interruptions, '[]'::jsonb)) AS elem
  ON CONFLICT (id) DO UPDATE SET
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    settling_method_id = EXCLUDED.settling_method_id;
END;
$$;