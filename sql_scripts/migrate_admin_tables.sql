/*
  # Migrate Admin System to Use tbl_ Prefix

  This script:
  1. Ensures admin_role enum exists
  2. Migrates admin_users to tbl_admin_users
  3. Updates all foreign key references
  4. Preserves all existing data
*/

-- Step 1: Create admin_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE admin_role AS ENUM ('super_admin', 'sub_admin');
  END IF;
END $$;

-- Step 2: Check if we need to migrate from admin_users to tbl_admin_users
DO $$
BEGIN
  -- If admin_users exists but tbl_admin_users doesn't, migrate
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tbl_admin_users') THEN

    -- Rename the table
    ALTER TABLE admin_users RENAME TO tbl_admin_users;

    -- Rename all columns to use tau_ prefix
    ALTER TABLE tbl_admin_users RENAME COLUMN id TO tau_id;
    ALTER TABLE tbl_admin_users RENAME COLUMN email TO tau_email;
    ALTER TABLE tbl_admin_users RENAME COLUMN password_hash TO tau_password_hash;
    ALTER TABLE tbl_admin_users RENAME COLUMN full_name TO tau_full_name;
    ALTER TABLE tbl_admin_users RENAME COLUMN role TO tau_role;
    ALTER TABLE tbl_admin_users RENAME COLUMN permissions TO tau_permissions;
    ALTER TABLE tbl_admin_users RENAME COLUMN is_active TO tau_is_active;
    ALTER TABLE tbl_admin_users RENAME COLUMN created_by TO tau_created_by;
    ALTER TABLE tbl_admin_users RENAME COLUMN last_login TO tau_last_login;
    ALTER TABLE tbl_admin_users RENAME COLUMN created_at TO tau_created_at;
    ALTER TABLE tbl_admin_users RENAME COLUMN updated_at TO tau_updated_at;

    -- Add auth_uid column if it doesn't exist
    ALTER TABLE tbl_admin_users ADD COLUMN IF NOT EXISTS tau_auth_uid uuid;

    -- Rename constraints
    ALTER TABLE tbl_admin_users RENAME CONSTRAINT admin_users_pkey TO tbl_admin_users_pkey;
    ALTER TABLE tbl_admin_users RENAME CONSTRAINT admin_users_email_key TO tbl_admin_users_tau_email_key;

    -- Update self-referencing foreign key
    ALTER TABLE tbl_admin_users DROP CONSTRAINT IF EXISTS admin_users_created_by_fkey;
    ALTER TABLE tbl_admin_users ADD CONSTRAINT tbl_admin_users_tau_created_by_fkey
      FOREIGN KEY (tau_created_by) REFERENCES tbl_admin_users(tau_id) ON DELETE SET NULL;

    -- Rename index
    ALTER INDEX IF EXISTS idx_admin_users_email RENAME TO idx_tbl_admin_users_email;

    -- Update permissions structure to match new naming
    UPDATE tbl_admin_users SET tau_permissions = '{
      "users": {"read": true, "write": true, "delete": true},
      "admins": {"read": true, "write": true, "delete": true},
      "reports": {"read": true, "write": true, "delete": true},
      "payments": {"read": true, "write": true, "delete": true},
      "settings": {"read": true, "write": true, "delete": true},
      "companies": {"read": true, "write": true, "delete": true},
      "coupons": {"read": true, "write": true, "delete": true},
      "dailytasks": {"read": true, "write": true, "delete": true},
      "wallets": {"read": true, "write": true, "delete": true},
      "customers": {"read": true, "write": true, "delete": true},
      "subscriptions": {"read": true, "write": true, "delete": true}
    }'::jsonb
    WHERE tau_role = 'super_admin';

  END IF;
END $$;

-- Step 3: If tbl_admin_users doesn't exist at all, create it
CREATE TABLE IF NOT EXISTS tbl_admin_users (
  tau_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tau_email text NOT NULL,
  tau_password_hash text NOT NULL,
  tau_full_name text NOT NULL,
  tau_role admin_role NOT NULL DEFAULT 'sub_admin',
  tau_permissions jsonb DEFAULT '{
    "users": {"read": false, "write": false, "delete": false},
    "admins": {"read": false, "write": false, "delete": false},
    "reports": {"read": false, "write": false, "delete": false},
    "payments": {"read": false, "write": false, "delete": false},
    "settings": {"read": false, "write": false, "delete": false},
    "companies": {"read": false, "write": false, "delete": false},
    "coupons": {"read": false, "write": false, "delete": false},
    "dailytasks": {"read": false, "write": false, "delete": false},
    "wallets": {"read": false, "write": false, "delete": false},
    "customers": {"read": false, "write": false, "delete": false},
    "subscriptions": {"read": false, "write": false, "delete": false}
  }'::jsonb,
  tau_is_active boolean DEFAULT true,
  tau_created_by uuid,
  tau_last_login timestamptz,
  tau_created_at timestamptz DEFAULT now(),
  tau_updated_at timestamptz DEFAULT now(),
  tau_auth_uid uuid,
  CONSTRAINT tbl_admin_users_pkey PRIMARY KEY (tau_id),
  CONSTRAINT tbl_admin_users_tau_email_key UNIQUE (tau_email),
  CONSTRAINT tbl_admin_users_tau_created_by_fkey FOREIGN KEY (tau_created_by)
    REFERENCES tbl_admin_users (tau_id) ON DELETE SET NULL
);

-- Step 4: Create necessary indexes
CREATE INDEX IF NOT EXISTS idx_tbl_admin_users_email
  ON tbl_admin_users USING btree (tau_email);

CREATE INDEX IF NOT EXISTS idx_tbl_admin_users_role
  ON tbl_admin_users USING btree (tau_role);

CREATE INDEX IF NOT EXISTS idx_tbl_admin_users_is_active
  ON tbl_admin_users USING btree (tau_is_active);

-- Step 5: Create or replace trigger function
CREATE OR REPLACE FUNCTION update_admin_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tau_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger
DROP TRIGGER IF EXISTS trigger_admin_users_updated_at ON tbl_admin_users;
CREATE TRIGGER trigger_admin_users_updated_at
  BEFORE UPDATE ON tbl_admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_updated_at_column();

-- Step 7: Enable RLS
ALTER TABLE tbl_admin_users ENABLE ROW LEVEL SECURITY;

-- Step 8: Drop old policies if they exist
DROP POLICY IF EXISTS "Super admins can manage all admins" ON tbl_admin_users;
DROP POLICY IF EXISTS "Sub admins can read own profile" ON tbl_admin_users;
DROP POLICY IF EXISTS "Admins can update own profile" ON tbl_admin_users;

-- Step 9: Create new policies
CREATE POLICY "Super admins can manage all admin users"
  ON tbl_admin_users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_role = 'super_admin'
      AND tau_is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tbl_admin_users
      WHERE tau_id = auth.uid()
      AND tau_role = 'super_admin'
      AND tau_is_active = true
    )
  );

CREATE POLICY "Sub admins can read own profile"
  ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING (tau_id = auth.uid());

CREATE POLICY "Admins can update own profile"
  ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING (tau_id = auth.uid())
  WITH CHECK (tau_id = auth.uid());

-- Step 10: Migrate admin_sessions table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_sessions') THEN
    -- Update foreign key to reference new table
    ALTER TABLE admin_sessions DROP CONSTRAINT IF EXISTS admin_sessions_admin_id_fkey;
    ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES tbl_admin_users(tau_id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 11: Migrate admin_activity_logs table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_activity_logs') THEN
    -- Update foreign key to reference new table
    ALTER TABLE admin_activity_logs DROP CONSTRAINT IF EXISTS admin_activity_logs_admin_id_fkey;
    ALTER TABLE admin_activity_logs ADD CONSTRAINT admin_activity_logs_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES tbl_admin_users(tau_id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 12: Insert default super admin if not exists
INSERT INTO tbl_admin_users (
  tau_email,
  tau_password_hash,
  tau_full_name,
  tau_role,
  tau_permissions,
  tau_is_active
) VALUES (
  'admin@mlmplatform.com',
  '$2a$10$rQ4QZJ5Z5Z5Z5Z5Z5Z5Z5.O5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5',
  'Super Administrator',
  'super_admin',
  '{
    "users": {"read": true, "write": true, "delete": true},
    "admins": {"read": true, "write": true, "delete": true},
    "reports": {"read": true, "write": true, "delete": true},
    "payments": {"read": true, "write": true, "delete": true},
    "settings": {"read": true, "write": true, "delete": true},
    "companies": {"read": true, "write": true, "delete": true},
    "coupons": {"read": true, "write": true, "delete": true},
    "dailytasks": {"read": true, "write": true, "delete": true},
    "wallets": {"read": true, "write": true, "delete": true},
    "customers": {"read": true, "write": true, "delete": true},
    "subscriptions": {"read": true, "write": true, "delete": true}
  }'::jsonb,
  true
) ON CONFLICT (tau_email) DO NOTHING;
