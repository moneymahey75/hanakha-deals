-- Backfill registration-paid flags for users with completed registration payments
-- Safe to run multiple times

WITH registration_paid AS (
  SELECT DISTINCT p.tp_user_id AS user_id,
         MAX(p.tp_verified_at) AS paid_at
  FROM tbl_payments p
  JOIN tbl_user_subscriptions s ON s.tus_id = p.tp_subscription_id
  JOIN tbl_subscription_plans sp ON sp.tsp_id = s.tus_plan_id
  WHERE p.tp_payment_status = 'completed'
    AND sp.tsp_type = 'registration'
  GROUP BY p.tp_user_id
)
UPDATE tbl_users u
SET tu_registration_paid = true,
    tu_registration_paid_at = COALESCE(u.tu_registration_paid_at, r.paid_at, NOW())
FROM registration_paid r
WHERE u.tu_id = r.user_id
  AND (u.tu_registration_paid IS DISTINCT FROM true);
