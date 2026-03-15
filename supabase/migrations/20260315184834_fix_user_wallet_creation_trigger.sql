/*
  # Fix User Wallet Creation Trigger

  1. Problem
    - When a new user signs up, the `trigger_create_user_wallet` runs
    - The trigger function tries to INSERT into tbl_wallets
    - RLS policy blocks the insert because auth.uid() is not set during the trigger execution
    - This causes "Database error saving new user" during signup

  2. Solution
    - Add SECURITY DEFINER to create_user_wallet() function
    - This allows the function to bypass RLS restrictions
    - The function is safe because it only inserts a wallet for the newly created user (NEW.tu_id)

  3. Changes
    - Update create_user_wallet() to use SECURITY DEFINER
    - Add SET search_path = public for security
*/

-- Drop and recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert wallet for the new user
  INSERT INTO tbl_wallets (tw_user_id, tw_balance, tw_currency)
  VALUES (NEW.tu_id, 0.00000000, 'USDT');
  
  RETURN NEW;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION create_user_wallet IS 'Automatically creates a wallet for new users. Uses SECURITY DEFINER to bypass RLS during user signup.';

-- Ensure trigger exists (it should already exist, but this is idempotent)
DROP TRIGGER IF EXISTS trigger_create_user_wallet ON tbl_users;
CREATE TRIGGER trigger_create_user_wallet
  AFTER INSERT ON tbl_users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_wallet();
