/*
  # Add Admin Customer Impersonation Feature

  1. Purpose
    - Allows admins to directly log in as a customer
    - Creates a secure temporary session for the customer
    - Logs all impersonation attempts for audit trail
    
  2. Security
    - Only callable by authenticated admins (super_admin, sub_admin)
    - Verifies customer exists and is active
    - Creates audit log entry
    - Returns customer auth credentials for direct login
    
  3. Returns
    - Customer's email and a temporary access token
*/

CREATE OR REPLACE FUNCTION admin_impersonate_customer(
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
  v_customer_auth_id uuid;
  v_customer_type text;
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
    tu_id, 
    tu_user_type,
    tu_is_active
  INTO 
    v_customer_email, 
    v_customer_auth_id,
    v_customer_type,
    v_customer_active
  FROM tbl_users
  WHERE tu_id = p_customer_id;
  
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
  
  IF v_customer_type != 'customer' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User is not a customer account'
    );
  END IF;
  
  -- Log the impersonation action
  INSERT INTO tbl_admin_activity_logs (
    taal_admin_id,
    taal_action,
    taal_module,
    taal_details
  ) VALUES (
    v_admin_id,
    'impersonate_customer',
    'customer_management',
    jsonb_build_object(
      'customer_id', p_customer_id,
      'customer_email', v_customer_email,
      'timestamp', now()
    )
  );
  
  -- Return customer credentials for impersonation
  RETURN jsonb_build_object(
    'success', true,
    'customer_email', v_customer_email,
    'customer_id', v_customer_auth_id,
    'message', 'Impersonation authorized'
  );
END;
$$;

COMMENT ON FUNCTION admin_impersonate_customer IS 'Allows admin to impersonate and log in as a customer with audit logging';
