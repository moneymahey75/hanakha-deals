CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_cleanup_available
  ON public.tbl_user_reward_coupons(turc_reward_date, turc_id)
  WHERE turc_status = 'available';

CREATE INDEX IF NOT EXISTS idx_user_reward_coupons_cleanup_opened
  ON public.tbl_user_reward_coupons(turc_coupon_id, turc_status, turc_id)
  WHERE turc_status IN ('opened', 'liked', 'disliked', 'expired');

CREATE INDEX IF NOT EXISTS idx_coupons_valid_until
  ON public.tbl_coupons(tc_valid_until, tc_id);

CREATE OR REPLACE FUNCTION public.cleanup_expired_reward_coupons(
  p_before_date date DEFAULT public.shopclick_business_date(),
  p_limit integer DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  WITH expired_rows AS (
    SELECT rc.turc_id
    FROM public.tbl_user_reward_coupons rc
    LEFT JOIN public.tbl_coupons c ON c.tc_id = rc.turc_coupon_id
    WHERE (
        rc.turc_status = 'available'
        AND rc.turc_reward_date < p_before_date
      )
      OR (
        rc.turc_status IN ('opened', 'liked', 'disliked', 'expired')
        AND (
          c.tc_id IS NULL
          OR p_before_date > (((c.tc_valid_until AT TIME ZONE 'Asia/Kolkata')::date) + 1)
        )
      )
    ORDER BY rc.turc_reward_date, rc.turc_id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50000), 200000))
  ),
  deleted AS (
    DELETE FROM public.tbl_user_reward_coupons rc
    USING expired_rows er
    WHERE rc.turc_id = er.turc_id
    RETURNING rc.turc_id
  )
  SELECT COUNT(*)::integer INTO v_deleted_count
  FROM deleted;

  RETURN COALESCE(v_deleted_count, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reward_coupons(date, integer) TO service_role;
