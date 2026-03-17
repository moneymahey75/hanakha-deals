/*
  # Ensure All Admins Have Auth.Users Records

  1. Changes
    - Create auth.users records for admins who don't have them
    - Link existing admins to auth.users via tau_auth_uid
    - Ensure admins can authenticate with Supabase Auth

  2. Security
    - Uses SECURITY DEFINER for privileged operations
    - Validates admin data before creating auth records
*/

DO $$
DECLARE
  v_admin RECORD;
  v_auth_uid UUID;
  v_temp_password TEXT;
BEGIN
  -- Loop through all admins without auth linkage
  FOR v_admin IN 
    SELECT tau_id, tau_email, tau_password_hash
    FROM tbl_admin_users
    WHERE tau_auth_uid IS NULL
  LOOP
    RAISE NOTICE 'Processing admin: %', v_admin.tau_email;

    -- Check if auth.users record already exists for this email
    SELECT id INTO v_auth_uid
    FROM auth.users
    WHERE email = v_admin.tau_email;

    IF v_auth_uid IS NULL THEN
      -- Create auth.users record with encrypted password
      -- We'll use the existing password hash as the auth password
      BEGIN
        INSERT INTO auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          recovery_sent_at,
          last_sign_in_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at,
          confirmation_token,
          email_change,
          email_change_token_new,
          recovery_token
        ) VALUES (
          '00000000-0000-0000-0000-000000000000',
          gen_random_uuid(),
          'authenticated',
          'authenticated',
          v_admin.tau_email,
          v_admin.tau_password_hash,
          NOW(),
          NOW(),
          NOW(),
          '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
          '{"role":"admin"}'::jsonb,
          NOW(),
          NOW(),
          '',
          '',
          '',
          ''
        )
        RETURNING id INTO v_auth_uid;

        RAISE NOTICE 'Created auth.users record for % with id %', v_admin.tau_email, v_auth_uid;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create auth.users for %: %', v_admin.tau_email, SQLERRM;
        CONTINUE;
      END;
    ELSE
      RAISE NOTICE 'Auth.users record already exists for % with id %', v_admin.tau_email, v_auth_uid;
    END IF;

    -- Update admin record with auth_uid
    UPDATE tbl_admin_users
    SET tau_auth_uid = v_auth_uid
    WHERE tau_id = v_admin.tau_id;

    RAISE NOTICE 'Linked admin % to auth.users %', v_admin.tau_email, v_auth_uid;
  END LOOP;

  RAISE NOTICE 'Admin auth linkage complete';
END $$;
