/*
  # Enforce Unique Usernames

  1. Changes
    - Add a partial unique index on normalized tbl_user_profiles.tup_username
    - Enforces case-insensitive uniqueness while ignoring null/blank usernames

  2. Purpose
    - Keeps username availability checks race-safe
    - Prevents duplicate usernames from direct DB writes, admin edits, or concurrent customer updates
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_tbl_user_profiles_username_unique_lower
  ON tbl_user_profiles (LOWER(BTRIM(tup_username)))
  WHERE tup_username IS NOT NULL AND BTRIM(tup_username) <> '';

COMMENT ON INDEX idx_tbl_user_profiles_username_unique_lower
  IS 'Enforces case-insensitive uniqueness for non-empty user profile usernames.';
