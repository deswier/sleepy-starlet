ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS time_format TEXT NOT NULL DEFAULT 'system'
    CHECK (time_format IN ('system', 'h12', 'h24'));
