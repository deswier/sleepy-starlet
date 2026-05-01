ALTER TABLE public.child_settings
ADD COLUMN IF NOT EXISTS use_age_default_wake_window boolean NOT NULL DEFAULT true;