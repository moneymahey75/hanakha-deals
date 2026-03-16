/*
  # Add RPC Functions for OTP Operations

  1. Problem
    - Direct PATCH operations on tbl_otp_verifications fail due to RLS
    - Users need to invalidate old OTPs before creating new ones
    - Need secure way to handle OTP operations

  2. Solution
    - Create RPC function to invalidate existing OTPs
    - Create RPC function to create new OTP records
    - Create RPC function to mark OTP as verified
    - All functions use SECURITY DEFINER to bypass RLS

  3. Changes
    - Add invalidate_user_otps function
    - Add create_otp_record function  
    - Add mark_otp_verified function
    - Grant execute permissions to anon and authenticated roles
*/

-- Function to invalidate all existing OTPs for a user/type
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
  SET 
    tov_is_verified = true,
    tov_updated_at = now()
  WHERE tov_user_id = p_user_id
    AND tov_otp_type = p_otp_type
    AND tov_is_verified = false;
END;
$$;

COMMENT ON FUNCTION invalidate_user_otps IS 'Invalidates all unverified OTPs for a user before creating a new one. Uses SECURITY DEFINER to bypass RLS.';

-- Function to create a new OTP record
CREATE OR REPLACE FUNCTION public.create_otp_record(
  p_user_id uuid,
  p_otp_code text,
  p_otp_type text,
  p_contact_info text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_otp_id uuid;
BEGIN
  -- Insert new OTP record
  INSERT INTO tbl_otp_verifications (
    tov_user_id,
    tov_otp_code,
    tov_otp_type,
    tov_contact_info,
    tov_expires_at,
    tov_is_verified,
    tov_attempts
  ) VALUES (
    p_user_id,
    p_otp_code,
    p_otp_type,
    p_contact_info,
    p_expires_at,
    false,
    0
  )
  RETURNING tov_id INTO v_otp_id;

  RETURN jsonb_build_object(
    'success', true,
    'otp_id', v_otp_id
  );
END;
$$;

COMMENT ON FUNCTION create_otp_record IS 'Creates a new OTP record for verification. Uses SECURITY DEFINER to bypass RLS.';

-- Function to mark OTP as verified and update user status
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
  SET 
    tov_is_verified = true,
    tov_updated_at = now()
  WHERE tov_id = p_otp_id;

  -- Update user verification status
  IF p_otp_type = 'email' THEN
    UPDATE tbl_users
    SET 
      tu_email_verified = true,
      tu_updated_at = now()
    WHERE tu_id = p_user_id;
  ELSIF p_otp_type = 'mobile' THEN
    UPDATE tbl_users
    SET 
      tu_mobile_verified = true,
      tu_is_verified = true,
      tu_updated_at = now()
    WHERE tu_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'OTP verified successfully'
  );
END;
$$;

COMMENT ON FUNCTION mark_otp_verified IS 'Marks OTP as verified and updates user verification status. Uses SECURITY DEFINER to bypass RLS.';

-- Grant permissions to anon and authenticated users
GRANT EXECUTE ON FUNCTION invalidate_user_otps(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_otp_record(uuid, text, text, text, timestamptz) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_otp_verified(uuid, uuid, text) TO anon, authenticated;
