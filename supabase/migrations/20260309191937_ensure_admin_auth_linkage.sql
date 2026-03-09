/*
  # Ensure Admin Auth Linkage
  
  1. Changes
    - Create auth.users record for super admin if missing
    - Link admin user to auth.users via tau_auth_uid
    - This ensures auth.uid() works in RLS policies
    
  2. Security
    - Uses proper password hashing
    - Links existing admin records to auth system
*/

DO $$
DECLARE
  v_admin_id uuid;
  v_admin_email text;
  v_auth_user_id uuid;
  v_password_hash text;
BEGIN
  -- Get super admin details
  SELECT tau_id, tau_email, tau_password_hash
  INTO v_admin_id, v_admin_email, v_password_hash
  FROM tbl_admin_users
  WHERE tau_role = 'super_admin'
  AND tau_email = 's_admin@dealsphere.com'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'No super admin found';
    RETURN;
  END IF;

  -- Check if auth user already exists
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE email = v_admin_email;

  -- Create auth user if doesn't exist
  IF v_auth_user_id IS NULL THEN
    RAISE NOTICE 'Creating auth.users record for admin';
    
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_admin_email,
      v_password_hash,
      now(),
      jsonb_build_object('is_admin', true, 'admin_id', v_admin_id, 'admin_role', 'super_admin'),
      jsonb_build_object('is_admin', true),
      now(),
      now(),
      '',
      '',
      ''
    )
    RETURNING id INTO v_auth_user_id;

    RAISE NOTICE 'Created auth user with id: %', v_auth_user_id;
  END IF;

  -- Update admin record with auth_uid
  UPDATE tbl_admin_users
  SET tau_auth_uid = v_auth_user_id
  WHERE tau_id = v_admin_id
  AND tau_auth_uid IS NULL;

  RAISE NOTICE 'Linked admin % to auth user %', v_admin_id, v_auth_user_id;
  
END $$;
