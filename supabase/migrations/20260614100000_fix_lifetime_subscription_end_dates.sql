-- Fix lifetime subscription end dates.
-- Admin plan setup allows durationDays = 0 for lifetime plans. Several payment
-- RPCs calculated start_date + 0 days, which made Launch lifetime subscriptions
-- expire immediately and blocked ROI-to-ROI eligibility.
--
-- Production keeps tbl_user_subscriptions.tus_end_date NOT NULL, so lifetime is
-- represented with a far-future timestamp instead of NULL.

CREATE OR REPLACE FUNCTION public.normalize_lifetime_subscription_end_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $normalize_lifetime_subscription_end$
DECLARE
  v_duration_days integer;
BEGIN
  SELECT sp.tsp_duration_days
  INTO v_duration_days
  FROM public.tbl_subscription_plans sp
  WHERE sp.tsp_id = NEW.tus_plan_id;

  IF COALESCE(v_duration_days, 30) = 0 THEN
    NEW.tus_end_date := '9999-12-31 23:59:59+00'::timestamptz;
  END IF;

  RETURN NEW;
END;
$normalize_lifetime_subscription_end$;

DROP TRIGGER IF EXISTS trg_normalize_lifetime_subscription_end_date
ON public.tbl_user_subscriptions;

CREATE TRIGGER trg_normalize_lifetime_subscription_end_date
BEFORE INSERT OR UPDATE OF tus_plan_id, tus_start_date, tus_end_date
ON public.tbl_user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_lifetime_subscription_end_date();

UPDATE public.tbl_user_subscriptions us
SET tus_end_date = '9999-12-31 23:59:59+00'::timestamptz
FROM public.tbl_subscription_plans sp
WHERE sp.tsp_id = us.tus_plan_id
  AND COALESCE(sp.tsp_duration_days, 30) = 0
  AND us.tus_end_date IS NOT NULL
  AND us.tus_end_date <= COALESCE(us.tus_start_date, us.tus_end_date);

REVOKE EXECUTE ON FUNCTION public.normalize_lifetime_subscription_end_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_lifetime_subscription_end_date() TO service_role;
