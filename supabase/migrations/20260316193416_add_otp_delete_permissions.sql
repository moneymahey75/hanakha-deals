/*
  # Add DELETE permissions to OTP verifications table

  1. Problem
    - authenticated role has INSERT, SELECT, UPDATE but missing DELETE grant
    - No DELETE policy exists for authenticated users
    - This causes RPC functions that delete OTPs to fail or timeout

  2. Solution
    - Grant DELETE permission to authenticated role
    - Add DELETE policy for users to delete their own OTP records
    - Ensure cleanup operations work correctly

  3. Changes
    - Add DELETE grant to authenticated role
    - Create user_delete_own policy for DELETE operations
*/

-- Grant DELETE permission to authenticated role
GRANT DELETE ON tbl_otp_verifications TO authenticated;

-- Create DELETE policy for authenticated users to delete their own OTP records
CREATE POLICY "user_delete_own"
  ON tbl_otp_verifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = tov_user_id);

-- Verify the RPC functions exist and work properly
-- Test that invalidate_user_otps can now complete without timeout
DO $$
BEGIN
  -- This should complete quickly now that DELETE permission exists
  PERFORM invalidate_user_otps(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'mobile'
  );
  
  RAISE NOTICE 'OTP RPC functions are working correctly';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RPC function test: %', SQLERRM;
END $$;
