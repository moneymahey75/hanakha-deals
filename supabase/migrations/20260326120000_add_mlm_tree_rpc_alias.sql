/*
  # Backward-compatible alias for MLM tree placement
  Ensures older clients calling add_user_to_mlm_tree still work.
*/

DROP FUNCTION IF EXISTS add_user_to_mlm_tree(uuid, text, text);

CREATE OR REPLACE FUNCTION add_user_to_mlm_tree(
  p_user_id uuid,
  p_sponsorship_number text,
  p_sponsor_sponsorship_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN add_user_to_mlm_tree_v2(p_user_id, p_sponsorship_number, p_sponsor_sponsorship_number);
END;
$$;

GRANT EXECUTE ON FUNCTION add_user_to_mlm_tree(uuid, text, text) TO authenticated;
