/*
  # Add working/non-working wallets + reserved balance

  - tbl_wallets supports two wallets per user via `tw_wallet_type`
  - Working wallet can hold `tw_reserved_balance` (not withdrawable)
*/

ALTER TABLE IF EXISTS public.tbl_wallets
  ADD COLUMN IF NOT EXISTS tw_wallet_type text NOT NULL DEFAULT 'working';

ALTER TABLE IF EXISTS public.tbl_wallets
  ADD COLUMN IF NOT EXISTS tw_reserved_balance numeric(18,8) NOT NULL DEFAULT 0.00000000;

ALTER TABLE IF EXISTS public.tbl_wallets
  DROP CONSTRAINT IF EXISTS tbl_wallets_tw_user_id_tw_currency_key;

ALTER TABLE IF EXISTS public.tbl_wallets
  DROP CONSTRAINT IF EXISTS tbl_wallets_tw_user_id_tw_currency_wallet_type_key;

ALTER TABLE IF EXISTS public.tbl_wallets
  ADD CONSTRAINT tbl_wallets_wallet_type_check CHECK (tw_wallet_type IN ('working', 'non_working'));

ALTER TABLE IF EXISTS public.tbl_wallets
  ADD CONSTRAINT tbl_wallets_tw_user_currency_type_unique UNIQUE (tw_user_id, tw_currency, tw_wallet_type);

-- Backfill any NULLs from older rows (defensive)
UPDATE public.tbl_wallets
SET tw_wallet_type = COALESCE(tw_wallet_type, 'working')
WHERE tw_wallet_type IS NULL;

UPDATE public.tbl_wallets
SET tw_reserved_balance = COALESCE(tw_reserved_balance, 0.00000000)
WHERE tw_reserved_balance IS NULL;

-- Ensure every existing wallet owner has a non-working wallet in the same currency.
INSERT INTO public.tbl_wallets (
  tw_user_id,
  tw_balance,
  tw_reserved_balance,
  tw_currency,
  tw_wallet_type,
  tw_is_active,
  tw_created_at,
  tw_updated_at
)
SELECT
  w.tw_user_id,
  0.00000000,
  0.00000000,
  w.tw_currency,
  'non_working',
  true,
  now(),
  now()
FROM public.tbl_wallets w
WHERE COALESCE(w.tw_wallet_type, 'working') = 'working'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tbl_wallets w2
    WHERE w2.tw_user_id = w.tw_user_id
      AND w2.tw_currency = w.tw_currency
      AND COALESCE(w2.tw_wallet_type, 'working') = 'non_working'
  );

