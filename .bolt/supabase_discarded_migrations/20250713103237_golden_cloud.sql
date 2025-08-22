/*
  # Initial MLM Platform Database Schema

  1. New Tables
    - `users` - Main user table for all user types (customers, companies, admins)
    - `user_profiles` - Extended profile information
    - `companies` - Company-specific information
    - `mlm_tree` - Binary tree structure for MLM network
    - `subscription_plans` - Available subscription plans
    - `user_subscriptions` - User subscription records
    - `payments` - Payment transaction records
    - `otp_verifications` - OTP verification records
    - `email_templates` - Email template management
    - `system_settings` - System configuration settings

  2. Security
    - Enable RLS on all tables
    - Add appropriate policies for each user type

  3. Functions
    - Helper functions for MLM tree operations
    - OTP generation and verification functions
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (main authentication table)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  user_type text NOT NULL CHECK (user_type IN ('customer', 'company', 'admin')),
  is_verified boolean DEFAULT false,
  email_verified boolean DEFAULT false,
  mobile_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  username text UNIQUE,
  mobile text,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  date_of_birth date,
  address text,
  city text,
  state text,
  country text DEFAULT 'India',
  postal_code text,
  sponsorship_number text UNIQUE,
  parent_account text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  brand_name text,
  business_type text,
  business_category text,
  registration_number text UNIQUE NOT NULL,
  gstin text UNIQUE NOT NULL,
  website_url text,
  official_email text NOT NULL,
  affiliate_code text,
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verification_documents jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- MLM Tree structure
CREATE TABLE IF NOT EXISTS mlm_tree (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES mlm_tree(id),
  left_child_id uuid REFERENCES mlm_tree(id),
  right_child_id uuid REFERENCES mlm_tree(id),
  level integer DEFAULT 0,
  position text CHECK (position IN ('left', 'right', 'root')),
  sponsorship_number text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Subscription plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price decimal(10,2) NOT NULL,
  duration_days integer NOT NULL,
  features jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES subscription_plans(id),
  start_date timestamptz DEFAULT now(),
  end_date timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  payment_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES subscription_plans(id),
  amount decimal(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  payment_method text NOT NULL,
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_id text,
  gateway_response jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- OTP verifications
CREATE TABLE IF NOT EXISTS otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  otp_code text NOT NULL,
  otp_type text NOT NULL CHECK (otp_type IN ('email', 'mobile', 'password_reset')),
  contact_info text NOT NULL,
  is_verified boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  template_type text NOT NULL,
  variables jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlm_tree ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users policies
CREATE POLICY "Users can read own data" ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- User profiles policies
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Companies policies
CREATE POLICY "Companies can read own data" ON companies
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Companies can update own data" ON companies
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Companies can insert own data" ON companies
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- MLM tree policies
CREATE POLICY "Users can read MLM tree" ON mlm_tree
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert into MLM tree" ON mlm_tree
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Subscription plans policies (public read)
CREATE POLICY "Anyone can read active plans" ON subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- User subscriptions policies
CREATE POLICY "Users can read own subscriptions" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own subscriptions" ON user_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Payments policies
CREATE POLICY "Users can read own payments" ON payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own payments" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- OTP verifications policies
CREATE POLICY "Users can read own OTP" ON otp_verifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own OTP" ON otp_verifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own OTP" ON otp_verifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Email templates policies (public read for active templates)
CREATE POLICY "Anyone can read active email templates" ON email_templates
  FOR SELECT TO authenticated
  USING (is_active = true);

-- System settings policies (public read)
CREATE POLICY "Anyone can read system settings" ON system_settings
  FOR SELECT TO authenticated
  USING (true);

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, price, duration_days, features, is_active) VALUES
('Basic Plan', 'Perfect for beginners starting their MLM journey', 99.00, 30, '["MLM Tree Access", "Basic Dashboard", "Email Support", "Mobile App Access"]', true),
('Premium Plan', 'Advanced features for serious network builders', 199.00, 30, '["MLM Tree Access", "Advanced Dashboard", "Priority Support", "Analytics & Reports", "Mobile App Access", "Marketing Tools"]', true),
('Enterprise Plan', 'Complete solution for large networks', 399.00, 30, '["MLM Tree Access", "Enterprise Dashboard", "24/7 Support", "Advanced Analytics", "Mobile App Access", "Marketing Tools", "Custom Branding", "API Access"]', false);

-- Insert default email templates
INSERT INTO email_templates (name, subject, body, template_type, variables) VALUES
('welcome_email', 'Welcome to {{site_name}}!', 
'<h1>Welcome {{first_name}}!</h1><p>Thank you for joining {{site_name}}. Your sponsorship number is: {{sponsorship_number}}</p><p>Please verify your email by clicking the link below:</p><a href="{{verification_link}}">Verify Email</a>', 
'user_registration', '["first_name", "site_name", "sponsorship_number", "verification_link"]'),

('otp_email', 'Your OTP Code - {{site_name}}', 
'<h2>Email Verification</h2><p>Your OTP code is: <strong>{{otp_code}}</strong></p><p>This code will expire in 10 minutes.</p>', 
'otp_verification', '["otp_code", "site_name"]'),

('password_reset', 'Reset Your Password - {{site_name}}', 
'<h2>Password Reset Request</h2><p>Click the link below to reset your password:</p><a href="{{reset_link}}">Reset Password</a><p>If you did not request this, please ignore this email.</p>', 
'password_reset', '["reset_link", "site_name"]');

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('site_name', '"MLM Platform"', 'Website name'),
('logo_url', '"https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop"', 'Site logo URL'),
('email_verification_required', 'true', 'Require email verification on registration'),
('mobile_verification_required', 'true', 'Require mobile verification'),
('referral_mandatory', 'false', 'Make referral mandatory for registration'),
('default_parent_account', '"admin-default"', 'Default parent account for orphaned users'),

-- SMS Gateway Settings (Testing credentials)
('sms_gateway_provider', '"Twilio"', 'SMS gateway provider'),
('sms_gateway_account_sid', '"ACtest123456789"', 'Twilio Account SID (Test)'),
('sms_gateway_auth_token', '"test_auth_token_123"', 'Twilio Auth Token (Test)'),
('sms_gateway_phone_number', '"+15005550006"', 'Twilio Test Phone Number'),

-- Email SMTP Settings (Testing credentials)
('smtp_host', '"smtp.mailtrap.io"', 'SMTP Host (Mailtrap for testing)'),
('smtp_port', '2525', 'SMTP Port'),
('smtp_username', '"your_mailtrap_username"', 'SMTP Username'),
('smtp_password', '"your_mailtrap_password"', 'SMTP Password'),
('smtp_from_email', '"noreply@mlmplatform.com"', 'From email address'),
('smtp_from_name', '"MLM Platform"', 'From name');

-- Functions

-- Generate sponsorship number
CREATE OR REPLACE FUNCTION generate_sponsorship_number()
RETURNS text AS $$
BEGIN
  RETURN 'SP' || LPAD(nextval('sponsorship_seq')::text, 8, '0');
END;
$$ LANGUAGE plpgsql;

-- Create sequence for sponsorship numbers
CREATE SEQUENCE IF NOT EXISTS sponsorship_seq START 10000001;

-- Generate OTP
CREATE OR REPLACE FUNCTION generate_otp()
RETURNS text AS $$
BEGIN
  RETURN LPAD(floor(random() * 1000000)::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to add user to MLM tree
CREATE OR REPLACE FUNCTION add_to_mlm_tree(
  p_user_id uuid,
  p_parent_sponsorship_number text DEFAULT NULL,
  p_sponsorship_number text
)
RETURNS uuid AS $$
DECLARE
  v_parent_node_id uuid;
  v_new_node_id uuid;
  v_position text;
  v_level integer := 0;
BEGIN
  -- If no parent specified, this is a root node
  IF p_parent_sponsorship_number IS NULL THEN
    INSERT INTO mlm_tree (user_id, parent_id, level, position, sponsorship_number)
    VALUES (p_user_id, NULL, 0, 'root', p_sponsorship_number)
    RETURNING id INTO v_new_node_id;
    
    RETURN v_new_node_id;
  END IF;
  
  -- Find parent node
  SELECT mt.id, mt.level INTO v_parent_node_id, v_level
  FROM mlm_tree mt
  JOIN user_profiles up ON mt.user_id = up.user_id
  WHERE up.sponsorship_number = p_parent_sponsorship_number;
  
  IF v_parent_node_id IS NULL THEN
    RAISE EXCEPTION 'Parent sponsorship number not found: %', p_parent_sponsorship_number;
  END IF;
  
  -- Find available position (left-first assignment)
  SELECT 
    CASE 
      WHEN left_child_id IS NULL THEN 'left'
      WHEN right_child_id IS NULL THEN 'right'
      ELSE NULL
    END INTO v_position
  FROM mlm_tree 
  WHERE id = v_parent_node_id;
  
  -- If parent is full, find first available position in subtree
  IF v_position IS NULL THEN
    -- Use breadth-first search to find available position
    WITH RECURSIVE tree_search AS (
      SELECT id, left_child_id, right_child_id, level
      FROM mlm_tree 
      WHERE id = v_parent_node_id
      
      UNION ALL
      
      SELECT mt.id, mt.left_child_id, mt.right_child_id, mt.level
      FROM mlm_tree mt
      JOIN tree_search ts ON (mt.id = ts.left_child_id OR mt.id = ts.right_child_id)
    )
    SELECT 
      ts.id,
      CASE 
        WHEN ts.left_child_id IS NULL THEN 'left'
        WHEN ts.right_child_id IS NULL THEN 'right'
        ELSE NULL
      END,
      ts.level
    INTO v_parent_node_id, v_position, v_level
    FROM tree_search ts
    WHERE (ts.left_child_id IS NULL OR ts.right_child_id IS NULL)
    ORDER BY ts.level, ts.id
    LIMIT 1;
  END IF;
  
  IF v_position IS NULL THEN
    RAISE EXCEPTION 'No available position found in the tree';
  END IF;
  
  -- Insert new node
  INSERT INTO mlm_tree (user_id, parent_id, level, position, sponsorship_number)
  VALUES (p_user_id, v_parent_node_id, v_level + 1, v_position, p_sponsorship_number)
  RETURNING id INTO v_new_node_id;
  
  -- Update parent node
  IF v_position = 'left' THEN
    UPDATE mlm_tree SET left_child_id = v_new_node_id WHERE id = v_parent_node_id;
  ELSE
    UPDATE mlm_tree SET right_child_id = v_new_node_id WHERE id = v_parent_node_id;
  END IF;
  
  RETURN v_new_node_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate sponsorship number
CREATE OR REPLACE FUNCTION auto_generate_sponsorship_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sponsorship_number IS NULL THEN
    NEW.sponsorship_number := generate_sponsorship_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_sponsorship_number
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_sponsorship_number();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_mlm_tree_updated_at BEFORE UPDATE ON mlm_tree FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();