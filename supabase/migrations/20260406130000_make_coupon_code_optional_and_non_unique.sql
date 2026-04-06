/*
  # Make coupon code optional and non-unique

  1. Changes
    - Drop UNIQUE constraint/index on `tbl_coupons.tc_coupon_code`
    - Allow NULL coupon codes

  2. Reason
    - Admin coupons should not require a coupon code
    - Multiple coupons may intentionally share the same code
*/

ALTER TABLE tbl_coupons
ALTER COLUMN tc_coupon_code DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname
  INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'tbl_coupons'::regclass
    AND contype = 'u'
    AND conkey = ARRAY[
      (SELECT attnum FROM pg_attribute WHERE attrelid = 'tbl_coupons'::regclass AND attname = 'tc_coupon_code')
    ];

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tbl_coupons DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

DROP INDEX IF EXISTS tbl_coupons_tc_coupon_code_key;
