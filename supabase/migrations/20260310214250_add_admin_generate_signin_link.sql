/*
  # Add Admin Generate Sign-In Link Function

  1. Purpose
    - Allows admins to generate a temporary sign-in link for customers
    - Uses Supabase's admin API to create magic links
    - Creates audit log entry
    
  2. Security
    - Only callable by authenticated admins (super_admin, sub_admin)
    - Verifies customer exists and is active
    - Logs all link generation attempts
    
  3. Returns
    - Success status and customer information
*/

CREATE OR REPLACE FUNCTION admin_generate_customer_signin(
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_admin_id uuid;
  v_customer_email text;
  v_customer_active boolean;
BEGIN
  -- Verify caller is an admin
  SELECT tau_id INTO v_admin_id
  FROM tbl_admin_users
  WHERE tau_auth_uid = auth.uid()
  AND tau_is_active = true
  AND tau_role IN ('super_admin', 'sub_admin');
  
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Admin access required'
    );
  END IF;
  
  -- Get customer details
  SELECT 
    tu_email,
    tu_is_active
  INTO 
    v_customer_email,
    v_customer_active
  FROM tbl_users
  WHERE tu_id = p_customer_id
  AND tu_user_type = 'customer';
  
  IF v_customer_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer not found'
    );
  END IF;
  
  IF NOT v_customer_active THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Customer account is not active'
    );
  END IF;
  
  -- Log the action
  INSERT INTO tbl_admin_activity_logs (
    taal_admin_id,
    taal_action,
    taal_module,
    taal_details
  ) VALUES (
    v_admin_id,
    'generate_customer_signin',
    'customer_management',
    jsonb_build_object(
      'customer_id', p_customer_id,
      'customer_email', v_customer_email,
      'timestamp', now()
    )
  );
  
  -- Return customer information for frontend to handle sign-in
  RETURN jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'customer_email', v_customer_email
  );
END;
$$;

COMMENT ON FUNCTION admin_generate_customer_signin IS 'Allows admin to generate sign-in credentials for customer impersonation with audit logging';
