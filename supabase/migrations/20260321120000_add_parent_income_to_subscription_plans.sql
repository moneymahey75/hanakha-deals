/*
  # Add Parent Account Income to Registration Plans

  1. Changes
    - Add tsp_parent_income to tbl_subscription_plans to store fixed parent income
*/

ALTER TABLE tbl_subscription_plans
ADD COLUMN IF NOT EXISTS tsp_parent_income numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN tbl_subscription_plans.tsp_parent_income IS 'Fixed amount paid to parent account for registration plans';
