/*
  # Fix OTP RPC Functions Schema

  1. Problem
    - RPC functions reference non-existent tov_updated_at column
    - Functions timing out due to schema errors
    - Same issue in multiple functions

  2. Solution
    - Remove tov_updated_at references from all OTP RPC functions
    - Only update columns that actually exist in the table

  3. Changes
    - Fix invalidate_user_otps function
    - Fix mark_otp_verified function
*/

-- Fix invalidate_user_otps to remove tov_updated_at reference
CREATE OR REPLACE FUNCTION public.invalidate_user_otps(
  p_user_id uuid,
  p_otp_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark all unverified OTPs of this type for this user as verified (invalidate them)
  UPDATE tbl_otp_verifications
  SET tov_is_verified = true
  WHERE tov_user_id = p_user_id
    AND tov_otp_type = p_otp_type
    AND tov_is_verified = false;
END;
$$;

-- Fix mark_otp_verified to remove tov_updated_at reference
CREATE OR REPLACE FUNCTION public.mark_otp_verified(
  p_otp_id uuid,
  p_user_id uuid,
  p_otp_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_record record;
BEGIN
  -- Get OTP record to verify it exists and is valid
  SELECT 
    tov_id,
    tov_attempts,
    tov_is_verified,
    tov_expires_at
  INTO v_otp_record
  FROM tbl_otp_verifications
  WHERE tov_id = p_otp_id
    AND tov_user_id = p_user_id
    AND tov_otp_type = p_otp_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OTP record not found'
    );
  END IF;

  IF v_otp_record.tov_is_verified THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OTP already verified'
    );
  END IF;

  IF v_otp_record.tov_expires_at < now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OTP expired'
    );
  END IF;

  -- Mark OTP as verified
  UPDATE tbl_otp_verifications
  SET tov_is_verified = true
  WHERE tov_id = p_otp_id;

  -- Update user verification status
  IF p_otp_type = 'email' THEN
    UPDATE tbl_users
    SET tu_email_verified = true
    WHERE tu_id = p_user_id;
  ELSIF p_otp_type = 'mobile' THEN
    UPDATE tbl_users
    SET 
      tu_mobile_verified = true,
      tu_is_verified = true
    WHERE tu_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'OTP verified successfully'
  );
END;
$$;
