-- Performance indexes for hot queries.
-- Addresses code review finding #20.

-- "Find active sleep" — used by CurrentSleep on every page load and realtime tick.
-- Partial index keeps it small even after thousands of completed sessions.
CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON public.sleep_sessions(child_id)
  WHERE end_time IS NULL;

-- "Find open interruption for active sleep" — used in CurrentSleep.load().
CREATE INDEX IF NOT EXISTS idx_interruptions_open
  ON public.sleep_interruptions(sleep_session_id)
  WHERE end_time IS NULL;

-- Heatmap range query on interruptions by time window.
CREATE INDEX IF NOT EXISTS idx_interruptions_start_time
  ON public.sleep_interruptions(start_time);

-- useChildRole lookup is by (child_id, user_id). The unique PK on the table is
-- typically (id) but the composite is the actual access pattern.
CREATE INDEX IF NOT EXISTS idx_child_user_roles_lookup
  ON public.child_user_roles(child_id, user_id);
