-- Enforce at most one ongoing (end_time IS NULL) interruption per sleep session.
-- Mirrors one_active_session_per_child for the interruptions table.
-- Prevents concurrent "Pause" taps or multi-device races from inserting two
-- active interruptions for the same session.
CREATE UNIQUE INDEX one_active_interruption_per_session
  ON sleep_interruptions (sleep_session_id)
  WHERE end_time IS NULL;
