-- Enforce "one wallet address per customer" when enabled via system setting:
--   key: wallet_unique_per_customer (boolean)
--
-- This migration is defensive:
-- - It only creates the trigger if `tbl_user_wallet_connections` exists.
-- - It defaults to NOT enforcing uniqueness unless the setting is explicitly enabled.

CREATE OR REPLACE FUNCTION public.enforce_wallet_unique_per_customer()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  raw_setting text;
  enforce_unique boolean := false;
BEGIN
  IF NEW.tuwc_wallet_address IS NULL OR btrim(NEW.tuwc_wallet_address) = '' THEN
    RETURN NEW;
  END IF;

  IF to_regclass('public.tbl_system_settings') IS NOT NULL THEN
    SELECT tss_setting_value
      INTO raw_setting
    FROM public.tbl_system_settings
    WHERE tss_setting_key = 'wallet_unique_per_customer'
    LIMIT 1;

    IF raw_setting IS NOT NULL THEN
      BEGIN
        enforce_unique := (raw_setting::jsonb)::boolean;
      EXCEPTION WHEN others THEN
        enforce_unique := lower(raw_setting) IN ('true', '1', 'yes', 'on');
      END;
    END IF;
  END IF;

  IF enforce_unique THEN
    IF EXISTS (
      SELECT 1
      FROM public.tbl_user_wallet_connections c
      WHERE lower(c.tuwc_wallet_address) = lower(NEW.tuwc_wallet_address)
        AND c.tuwc_user_id <> NEW.tuwc_user_id
        AND c.tuwc_id IS DISTINCT FROM NEW.tuwc_id
    ) THEN
      RAISE EXCEPTION 'wallet_unique_per_customer: wallet address already linked to another customer'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Create/update the trigger only when the target table exists.
DO $do$
BEGIN
  IF to_regclass('public.tbl_user_wallet_connections') IS NULL THEN
    RAISE NOTICE 'Skipping wallet uniqueness trigger (tbl_user_wallet_connections not found).';
  ELSE
    DROP TRIGGER IF EXISTS trg_wallet_unique_per_customer ON public.tbl_user_wallet_connections;
    CREATE TRIGGER trg_wallet_unique_per_customer
    BEFORE INSERT OR UPDATE OF tuwc_wallet_address
    ON public.tbl_user_wallet_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_wallet_unique_per_customer();
  END IF;
END $do$;
