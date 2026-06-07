/*
  Launch Panel plans are upgrade plans.

  A transient admin UI state could save newly-created Launch Panel plans with
  tsp_type = 'registration', which kept them out of the Launch Plans listing.
*/

UPDATE public.tbl_subscription_plans
SET
  tsp_type = 'upgrade',
  tsp_parent_income = 0,
  tsp_updated_at = now()
WHERE tsp_plan_phase = 'launch'
  AND tsp_type = 'registration';
