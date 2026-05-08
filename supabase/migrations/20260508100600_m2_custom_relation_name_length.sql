-- M-2 fix: add length constraint to child_users.custom_relation_name.
--
-- The security-hardening migration (20260503100000) added CHECK constraints
-- to most user-input TEXT columns but omitted custom_relation_name. Without
-- a bound an attacker (including one joining via invite) can INSERT a
-- megabyte-sized string, consuming storage and potentially triggering
-- out-of-memory conditions in any query that fetches the column.

ALTER TABLE public.child_users
  ADD CONSTRAINT child_users_custom_relation_name_length
  CHECK (custom_relation_name IS NULL OR char_length(custom_relation_name) <= 100);

-- Rollback: ALTER TABLE public.child_users DROP CONSTRAINT child_users_custom_relation_name_length;
