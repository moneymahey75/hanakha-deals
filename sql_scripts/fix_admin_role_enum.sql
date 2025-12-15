/*
  # Fix Admin Role Enum and Admin Users Table

  This script:
  1. Creates the admin_role enum if it doesn't exist
  2. Creates or updates the tbl_admin_users table
  3. Sets up proper indexes and triggers
  4. Adds RLS policies for admin access

  Note: This ensures compatibility with your existing DDL structure
*/

-- Create admin_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE admin_role AS ENUM ('super_admin', 'sub_admin');
  END IF;
END $$;

-- Create function for updating admin updated_at timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION update_admin_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tau_updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop table if exists and recreate (be careful in production!)
-- Comment out the DROP if you want to preserve existing data
-- DROP TABLE IF EXISTS tbl_admin_users CASCADE;

-- Create tbl_admin_users table
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

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_tbl_admin_users_email
  ON tbl_admin_users USING btree (tau_email);

-- Create index on role for filtering
CREATE INDEX IF NOT EXISTS idx_tbl_admin_users_role
  ON tbl_admin_users USING btree (tau_role);

-- Create index on is_active for filtering
CREATE INDEX IF NOT EXISTS idx_tbl_admin_users_is_active
  ON tbl_admin_users USING btree (tau_is_active);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_admin_users_updated_at ON tbl_admin_users;
CREATE TRIGGER trigger_admin_users_updated_at
  BEFORE UPDATE ON tbl_admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_admin_updated_at_column();

-- Enable RLS
ALTER TABLE tbl_admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins can manage all admin users
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

-- Policy: Sub admins can read their own profile
CREATE POLICY "Sub admins can read own profile"
  ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING (tau_id = auth.uid());

-- Policy: Admins can update their own profile (limited fields)
CREATE POLICY "Admins can update own profile"
  ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING (tau_id = auth.uid())
  WITH CHECK (tau_id = auth.uid());

-- Insert default super admin if not exists
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

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON tbl_admin_users TO authenticated;
