-- Repair completed AutoPool purchases that were recorded before the membership
-- trigger was available.

DROP TRIGGER IF EXISTS trg_place_autopool_20_membership ON public.tbl_user_subscriptions;

CREATE TRIGGER trg_place_autopool_20_membership
AFTER INSERT OR UPDATE OF tus_plan_id, tus_status ON public.tbl_user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.place_autopool_20_membership();

-- Updating only subscriptions with no membership invokes the trigger above.
-- A user who already has a matrix position is deliberately excluded because
-- each customer can occupy only one AutoPool Matrix position.
UPDATE public.tbl_user_subscriptions AS subscription
SET tus_status = subscription.tus_status
FROM public.tbl_subscription_plans AS plan
WHERE subscription.tus_plan_id = plan.tsp_id
  AND plan.tsp_product_code = 'autopool_20'
  AND subscription.tus_status IN ('active', 'upgraded')
  AND (subscription.tus_end_date IS NULL OR subscription.tus_end_date > now())
  AND NOT EXISTS (
    SELECT 1
    FROM public.tbl_autopool_20_memberships AS membership
    WHERE membership.ta20_subscription_id = subscription.tus_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.tbl_autopool_20_memberships AS membership
    WHERE membership.ta20_user_id = subscription.tus_user_id
  );

-- New AutoPool payments create an active subscription directly, so retain the
-- normal INSERT-only trigger after the one-time repair. This avoids trying to
-- assign an already-enrolled customer a second matrix position on later edits.
DROP TRIGGER IF EXISTS trg_place_autopool_20_membership ON public.tbl_user_subscriptions;

CREATE TRIGGER trg_place_autopool_20_membership
AFTER INSERT ON public.tbl_user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.place_autopool_20_membership();

NOTIFY pgrst, 'reload schema';
