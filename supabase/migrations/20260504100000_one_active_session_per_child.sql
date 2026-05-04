-- Enforce at most one ongoing (end_time IS NULL) sleep session per child.
-- Prevents concurrent "Start Sleep" clicks from creating duplicate active sessions.
CREATE UNIQUE INDEX one_active_session_per_child
  ON sleep_sessions (child_id)
  WHERE end_time IS NULL;
