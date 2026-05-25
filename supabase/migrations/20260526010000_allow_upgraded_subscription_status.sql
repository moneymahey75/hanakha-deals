/*
  # Allow historical upgraded subscription status

  Launch activation marks the user's old active Pre-Launch subscription as
  upgraded, so historical data stays visible while active earning logic only
  uses the new Launch subscription.
*/

ALTER TABLE public.tbl_user_subscriptions
DROP CONSTRAINT IF EXISTS tbl_user_subscriptions_tus_status_check;

ALTER TABLE public.tbl_user_subscriptions
ADD CONSTRAINT tbl_user_subscriptions_tus_status_check
CHECK (tus_status IN ('active', 'expired', 'cancelled', 'upgraded'));
