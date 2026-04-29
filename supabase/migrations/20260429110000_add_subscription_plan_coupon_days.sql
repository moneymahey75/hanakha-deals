ALTER TABLE public.tbl_subscription_plans
  ADD COLUMN IF NOT EXISTS tsp_coupon_days integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tbl_subscription_plans.tsp_coupon_days IS 'Number of days user receives daily coupon eligibility from subscription start (0 = no coupons).';

