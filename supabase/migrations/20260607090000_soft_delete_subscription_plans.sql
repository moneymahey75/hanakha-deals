/*
  Soft delete subscription plans that already have subscription history.

  Plans referenced by tbl_user_subscriptions cannot be physically deleted without
  breaking payment/subscription history, so admin delete archives those rows.
*/

ALTER TABLE public.tbl_subscription_plans
ADD COLUMN IF NOT EXISTS tsp_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscription_plans_not_deleted
ON public.tbl_subscription_plans (tsp_type, tsp_plan_phase, tsp_is_active, tsp_price)
WHERE tsp_deleted_at IS NULL;
