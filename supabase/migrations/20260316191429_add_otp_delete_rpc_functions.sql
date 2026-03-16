/*
  # Add RPC Functions for OTP Deletion

  1. Problem
    - No DELETE policy on tbl_otp_verifications
    - Users need to delete OTP records after verification
    - Need secure way to clean up expired OTPs

  2. Solution
    - Create RPC function to delete specific OTP record
    - Create RPC function to delete all OTPs for a user/type
    - Create RPC function to delete expired OTPs
    - All functions use SECURITY DEFINER to bypass RLS

  3. Changes
    - Add delete_otp_record function
    - Add delete_user_otps function
    - Add delete_expired_otps function
    - Grant execute permissions to anon and authenticated roles
*/

-- Function to delete a specific OTP record
CREATE OR REPLACE FUNCTION public.delete_otp_record(
  p_otp_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count int;
BEGIN
  DELETE FROM tbl_otp_verifications
  WHERE tov_id = p_otp_id;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted_count
  );
END;
$$;

COMMENT ON FUNCTION delete_otp_record IS 'Deletes a specific OTP record by ID. Uses SECURITY DEFINER to bypass RLS.';

-- Function to delete all OTP records for a user/type
CREATE OR REPLACE FUNCTION public.delete_user_otps(
  p_user_id uuid,
  p_otp_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count int;
BEGIN
  IF p_otp_type IS NULL THEN
    -- Delete all OTP types for this user
    DELETE FROM tbl_otp_verifications
    WHERE tov_user_id = p_user_id;
  ELSE
    -- Delete specific OTP type for this user
    DELETE FROM tbl_otp_verifications
    WHERE tov_user_id = p_user_id
      AND tov_otp_type = p_otp_type;
  END IF;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted_count
  );
END;
$$;

COMMENT ON FUNCTION delete_user_otps IS 'Deletes all OTP records for a specific user and optional type. Uses SECURITY DEFINER to bypass RLS.';

-- Function to delete expired OTP records
CREATE OR REPLACE FUNCTION public.delete_expired_otps()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count int;
BEGIN
  DELETE FROM tbl_otp_verifications
  WHERE tov_expires_at < now();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted_count,
    'message', format('Deleted %s expired OTP records', v_deleted_count)
  );
END;
$$;

COMMENT ON FUNCTION delete_expired_otps IS 'Deletes all expired OTP records. Uses SECURITY DEFINER to bypass RLS. Can be called periodically for cleanup.';

-- Grant permissions to anon and authenticated users
GRANT EXECUTE ON FUNCTION delete_otp_record(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_user_otps(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_expired_otps() TO anon, authenticated;
