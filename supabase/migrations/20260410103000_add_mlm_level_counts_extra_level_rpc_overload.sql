-- PostgREST resolves RPC functions using named parameters and may require a specific argument order.
-- Provide an overload that matches (p_level, p_sponsorship_numbers) and delegates to the original.

CREATE OR REPLACE FUNCTION get_mlm_level_counts_for_sponsors_at_level(
  p_level int,
  p_sponsorship_numbers text[]
)
RETURNS TABLE (
  sponsorship_number text,
  level_count int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $sql$
  SELECT *
  FROM public.get_mlm_level_counts_for_sponsors_at_level(p_sponsorship_numbers, p_level)
$sql$;

GRANT EXECUTE ON FUNCTION get_mlm_level_counts_for_sponsors_at_level(int, text[]) TO authenticated, service_role;
