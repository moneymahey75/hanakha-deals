-- The project briefly shipped two overloads of `get_mlm_level_counts_for_sponsors_at_level`
-- with identical named parameters but different argument order, which makes PostgREST RPC
-- resolution ambiguous when calling with named params.
--
-- Keep only the canonical function:
--   get_mlm_level_counts_for_sponsors_at_level(p_sponsorship_numbers text[], p_level int)
-- and drop the overload:
--   get_mlm_level_counts_for_sponsors_at_level(p_level int, p_sponsorship_numbers text[])

DROP FUNCTION IF EXISTS public.get_mlm_level_counts_for_sponsors_at_level(int, text[]);

