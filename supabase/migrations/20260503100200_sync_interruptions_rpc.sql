-- Atomic sync of a sleep session's interruptions in a single round-trip.
-- Replaces the client-side "select existing → delete missing → loop upsert"
-- pattern in SleepForm which had no transaction and could lose data on
-- network failure mid-sync.
--
-- _interruptions is a JSON array of:
--   { id?: uuid, start_time: timestamptz, end_time: timestamptz | null,
--     settling_method_id: uuid | null }
-- Items without id are inserted; with id are updated. Existing rows whose
-- id is not in the input list are deleted.

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
  _kept_ids uuid[];
  _intr jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.user_has_session_access(_uid, _session_id) THEN
    RAISE EXCEPTION 'No access to this session';
  END IF;

  -- Collect ids of input items that map to existing rows.
  SELECT COALESCE(
           array_agg((value->>'id')::uuid)
             FILTER (WHERE value->>'id' IS NOT NULL AND value->>'id' <> ''),
           ARRAY[]::uuid[]
         )
  INTO _kept_ids
  FROM jsonb_array_elements(_interruptions);

  DELETE FROM public.sleep_interruptions
  WHERE sleep_session_id = _session_id
    AND id <> ALL(_kept_ids);

  FOR _intr IN SELECT * FROM jsonb_array_elements(_interruptions)
  LOOP
    IF _intr->>'id' IS NULL OR _intr->>'id' = '' THEN
      INSERT INTO public.sleep_interruptions(
        sleep_session_id, start_time, end_time, settling_method_id, created_by_user_id
      ) VALUES (
        _session_id,
        (_intr->>'start_time')::timestamptz,
        NULLIF(_intr->>'end_time', '')::timestamptz,
        NULLIF(_intr->>'settling_method_id', '')::uuid,
        _uid
      );
    ELSE
      UPDATE public.sleep_interruptions
      SET start_time = (_intr->>'start_time')::timestamptz,
          end_time = NULLIF(_intr->>'end_time', '')::timestamptz,
          settling_method_id = NULLIF(_intr->>'settling_method_id', '')::uuid
      WHERE id = (_intr->>'id')::uuid AND sleep_session_id = _session_id;
    END IF;
  END LOOP;
END;
$$;
