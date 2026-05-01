-- Drop wake window rules table and custom WW columns
DROP TABLE IF EXISTS public.wake_window_rules CASCADE;

ALTER TABLE public.child_settings
  DROP COLUMN IF EXISTS min_wake_window_minutes,
  DROP COLUMN IF EXISTS max_wake_window_minutes,
  DROP COLUMN IF EXISTS use_age_default_wake_window,
  DROP COLUMN IF EXISTS max_wake_window_minutes;
