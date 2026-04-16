/*
  # Get email by sponsorship number (for login)

  Allows customer login using sponsorship number by resolving it to the user's email.
  This mirrors `get_email_by_username` and is safe to expose (returns only user_id + email).

  Note: uses normalization so inputs like `SP31117144` and `31117144` both match.
*/

DROP FUNCTION IF EXISTS public.get_email_by_sponsorship(text);
CREATE OR REPLACE FUNCTION public.get_email_by_sponsorship(p_sponsorship text)
RETURNS TABLE (
  user_id uuid,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS 'SELECT
  up.tup_user_id as user_id,
  u.tu_email as email
FROM tbl_user_profiles up
INNER JOIN tbl_users u ON u.tu_id = up.tup_user_id
WHERE up.tup_user_id IS NOT NULL
  AND (
    lower(btrim(up.tup_sponsorship_number)) = lower(btrim(p_sponsorship))
    OR (
      CASE
        WHEN lower(btrim(up.tup_sponsorship_number)) LIKE ''sp%'' THEN substr(lower(btrim(up.tup_sponsorship_number)), 3)
        ELSE lower(btrim(up.tup_sponsorship_number))
      END
    ) = (
      CASE
        WHEN lower(btrim(p_sponsorship)) LIKE ''sp%'' THEN substr(lower(btrim(p_sponsorship)), 3)
        ELSE lower(btrim(p_sponsorship))
      END
    )
  )
LIMIT 1';

REVOKE ALL ON FUNCTION public.get_email_by_sponsorship(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_sponsorship(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_email_by_sponsorship(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_sponsorship(text) TO service_role;

COMMENT ON FUNCTION public.get_email_by_sponsorship(text) IS 'Get user email from sponsorship number for login authentication.';

