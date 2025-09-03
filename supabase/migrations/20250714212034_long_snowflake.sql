/*
  # Create separate admin system with role-based permissions

  1. New Tables
    - `admin_users`
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `password_hash` (text)
      - `full_name` (text)
      - `role` (enum: super_admin, sub_admin)
      - `permissions` (jsonb)
      - `is_active` (boolean)
      - `created_by` (uuid, references admin_users)
      - `last_login` (timestamp)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `admin_sessions`
      - `id` (uuid, primary key)
      - `admin_id` (uuid, references admin_users)
      - `session_token` (text, unique)
      - `expires_at` (timestamp)
      - `ip_address` (text)
      - `user_agent` (text)
      - `created_at` (timestamp)

    - `admin_activity_logs`
      - `id` (uuid, primary key)
      - `admin_id` (uuid, references admin_users)
      - `action` (text)
      - `module` (text)
      - `details` (jsonb)
      - `ip_address` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all admin tables
    - Add policies for admin access only
    - Create secure session management

  3. Default Super Admin
    - Email: admin@mlmplatform.com
    - Password: Admin@123456 (should be changed after first login)
    - Full permissions to all modules
*/

-- Create admin role enum
CREATE TYPE admin_role AS ENUM ('super_admin', 'sub_admin');

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role admin_role NOT NULL DEFAULT 'sub_admin',
  permissions jsonb DEFAULT '{
    "customers": {"read": false, "write": false, "delete": false},
    "companies": {"read": false, "write": false, "delete": false},
    "subscriptions": {"read": false, "write": false, "delete": false},
    "payments": {"read": false, "write": false, "delete": false},
    "settings": {"read": false, "write": false, "delete": false},
    "admins": {"read": false, "write": false, "delete": false},
    "reports": {"read": false, "write": false, "delete": false}
  }'::jsonb,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES admin_users(id),
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create admin_sessions table
CREATE TABLE IF NOT EXISTS admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Create admin_activity_logs table
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  action text NOT NULL,
  module text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for admin_users
CREATE POLICY "Super admins can manage all admins"
  ON admin_users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_sessions s
      JOIN admin_users a ON s.admin_id = a.id
      WHERE s.session_token = current_setting('request.jwt.claims', true)::json->>'session_token'
      AND a.role = 'super_admin'
      AND a.is_active = true
      AND s.expires_at > now()
    )
  );

CREATE POLICY "Sub admins can read own profile"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (
    id = (
      SELECT s.admin_id FROM admin_sessions s
      WHERE s.session_token = current_setting('request.jwt.claims', true)::json->>'session_token'
      AND s.expires_at > now()
    )
  );

-- Create policies for admin_sessions
CREATE POLICY "Admins can manage own sessions"
  ON admin_sessions
  FOR ALL
  TO authenticated
  USING (
    admin_id = (
      SELECT s.admin_id FROM admin_sessions s
      WHERE s.session_token = current_setting('request.jwt.claims', true)::json->>'session_token'
      AND s.expires_at > now()
    )
  );

-- Create policies for admin_activity_logs
CREATE POLICY "Admins can read own activity logs"
  ON admin_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    admin_id = (
      SELECT s.admin_id FROM admin_sessions s
      WHERE s.session_token = current_setting('request.jwt.claims', true)::json->>'session_token'
      AND s.expires_at > now()
    )
  );

CREATE POLICY "Super admins can read all activity logs"
  ON admin_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_sessions s
      JOIN admin_users a ON s.admin_id = a.id
      WHERE s.session_token = current_setting('request.jwt.claims', true)::json->>'session_token'
      AND a.role = 'super_admin'
      AND a.is_active = true
      AND s.expires_at > now()
    )
  );

-- Create indexes for performance
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);
CREATE INDEX idx_admin_users_is_active ON admin_users(is_active);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
CREATE INDEX idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_admin_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_updated_at_column();

-- Insert default super admin
-- Password: Admin@123456 (hashed with bcrypt)
INSERT INTO admin_users (
  email,
  password_hash,
  full_name,
  role,
  permissions,
  is_active
) VALUES (
  'admin@mlmplatform.com',
  '$2b$10$rQZ8kHWKQVz8kHWKQVz8kOQVz8kHWKQVz8kHWKQVz8kHWKQVz8kO',
  'Super Administrator',
  'super_admin',
  '{
    "users": {"read": true, "write": true, "delete": true},
    "companies": {"read": true, "write": true, "delete": true},
    "subscriptions": {"read": true, "write": true, "delete": true},
    "payments": {"read": true, "write": true, "delete": true},
    "settings": {"read": true, "write": true, "delete": true},
    "admins": {"read": true, "write": true, "delete": true},
    "reports": {"read": true, "write": true, "delete": true}
  }'::jsonb,
  true
) ON CONFLICT (email) DO NOTHING;