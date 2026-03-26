-- Add RPC to recompute MLM level counts for all sponsors

CREATE OR REPLACE FUNCTION recompute_all_mlm_level_counts()
RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT tup_sponsorship_number
    FROM tbl_user_profiles
    WHERE tup_sponsorship_number IS NOT NULL
  LOOP
    PERFORM upsert_mlm_level_counts(rec.tup_sponsorship_number);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_all_mlm_level_counts() TO authenticated, service_role;
