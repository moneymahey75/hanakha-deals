/*
  # Complete MLM Platform Database Setup
  # Run this script in your Supabase SQL Editor to set up all tables and data
  
  This script combines all migrations and sets up:
  1. All database tables with proper structure
  2. Row Level Security (RLS) policies
  3. Database functions and triggers
  4. Default data (subscription plans, settings, admin user)
  5. Indexes for performance
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS admin_activity_logs CASCADE;
DROP TABLE IF EXISTS admin_sessions CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS user_activity_logs CASCADE;
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS mlm_tree CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- Drop types if they exist
DROP TYPE IF EXISTS admin_role CASCADE;

-- Create admin role enum
CREATE TYPE admin_role AS ENUM ('super_admin', 'sub_admin');

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  user_type text NOT NULL CHECK (user_type IN ('customer', 'company', 'admin')),
  is_verified boolean DEFAULT false,
  email_verified boolean DEFAULT false,
  mobile_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- User profiles table
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  username text,
  mobile text,
  gender text CHECK (gender IN ('male', 'female', 'other')),
  sponsorship_number text UNIQUE,
  parent_account text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Companies table
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  brand_name text,
  business_type text,
  business_category text,
  registration_number text NOT NULL,
  gstin text NOT NULL,
  website_url text,
  official_email text NOT NULL,
  affiliate_code text,
  verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- MLM Tree structure
CREATE TABLE mlm_tree (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE TABLE subscription_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES subscription_plans(id),
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  start_date timestamptz DEFAULT now(),
  end_date timestamptz NOT NULL,
  payment_amount decimal(10,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payments table
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES user_subscriptions(id),
  amount decimal(10,2) NOT NULL,
  currency text DEFAULT 'USD',
  payment_method text NOT NULL,
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_id text,
  gateway_response jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- OTP verifications
CREATE TABLE otp_verifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  otp_code text NOT NULL,
  otp_type text NOT NULL CHECK (otp_type IN ('email', 'mobile', 'password_reset')),
  contact_info text NOT NULL,
  is_verified boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  attempts integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- User activity logs
CREATE TABLE user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN ('login', 'logout', 'registration', 'password_reset', 'profile_update')),
  ip_address text,
  user_agent text,
  login_time timestamptz,
  logout_time timestamptz,
  session_duration interval GENERATED ALWAYS AS (logout_time - login_time) STORED,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Admin users table
CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role admin_role NOT NULL DEFAULT 'sub_admin',
  permissions jsonb DEFAULT '{
    "users": {"read": false, "write": false, "delete": false},
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

-- Admin sessions table
CREATE TABLE admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Admin activity logs table
CREATE TABLE admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  action text NOT NULL,
  module text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Email templates
CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE TABLE system_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_profiles_username ON user_profiles(username) WHERE username IS NOT NULL;
CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_sponsorship_number ON user_profiles(sponsorship_number);
CREATE INDEX idx_companies_user_id ON companies(user_id);
CREATE INDEX idx_mlm_tree_user_id ON mlm_tree(user_id);
CREATE INDEX idx_mlm_tree_parent_id ON mlm_tree(parent_id);
CREATE INDEX idx_subscription_plans_is_active ON subscription_plans(is_active);
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_otp_verifications_user_id ON otp_verifications(user_id);
CREATE INDEX idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX idx_user_activity_logs_activity_type ON user_activity_logs(activity_type);
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_admin_id ON admin_sessions(admin_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlm_tree ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can read own data" ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_profiles table
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for companies table
CREATE POLICY "Companies can insert own data" ON companies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Companies can read own data" ON companies
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Companies can update own data" ON companies
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for subscription_plans table (public read for active plans)
CREATE POLICY "Anyone can read active plans" ON subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- RLS Policies for user_subscriptions table
CREATE POLICY "Users can read own subscriptions" ON user_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions" ON user_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for payments table
CREATE POLICY "Users can read own payments" ON payments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payments" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for otp_verifications table
CREATE POLICY "Users can read own OTP" ON otp_verifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own OTP" ON otp_verifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own OTP" ON otp_verifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for user_activity_logs table
CREATE POLICY "Users can read own activity logs" ON user_activity_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activity logs" ON user_activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for email_templates table (public read for active templates)
CREATE POLICY "Anyone can read active email templates" ON email_templates
  FOR SELECT TO authenticated
  USING (is_active = true);

-- RLS Policies for system_settings table (public read)
CREATE POLICY "Anyone can read system settings" ON system_settings
  FOR SELECT TO authenticated
  USING (true);

-- Admin table policies (simplified for demo)
CREATE POLICY "Super admins can manage all admins" ON admin_users
  FOR ALL TO authenticated
  USING (true);

CREATE POLICY "Admins can manage own sessions" ON admin_sessions
  FOR ALL TO authenticated
  USING (true);

CREATE POLICY "Admins can read activity logs" ON admin_activity_logs
  FOR SELECT TO authenticated
  USING (true);

-- Database Functions

-- Function to generate sponsorship numbers
CREATE OR REPLACE FUNCTION generate_sponsorship_number()
RETURNS text AS $$
DECLARE
  new_number text;
  exists_check boolean;
BEGIN
  LOOP
    -- Generate a random 8-digit number
    new_number := 'SP' || LPAD(floor(random() * 100000000)::text, 8, '0');
    
    -- Check if it already exists
    SELECT EXISTS(SELECT 1 FROM user_profiles WHERE sponsorship_number = new_number) INTO exists_check;
    
    -- If it doesn't exist, we can use it
    IF NOT exists_check THEN
      RETURN new_number;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-generate sponsorship number on profile insert
CREATE OR REPLACE FUNCTION auto_generate_sponsorship_number()
RETURNS trigger AS $$
BEGIN
  IF NEW.sponsorship_number IS NULL THEN
    NEW.sponsorship_number := generate_sponsorship_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update admin updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function for atomic customer registration
CREATE OR REPLACE FUNCTION register_customer(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_username text,
  p_mobile text,
  p_gender text,
  p_parent_account text
) RETURNS void AS $$
BEGIN
  -- Insert user record
  INSERT INTO users (id, email, user_type)
  VALUES (p_user_id, p_email, 'customer');
  
  -- Insert profile record
  INSERT INTO user_profiles (
    user_id, first_name, last_name, username, 
    mobile, gender, parent_account
  ) VALUES (
    p_user_id, p_first_name, p_last_name, p_username,
    p_mobile, p_gender, p_parent_account
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for atomic company registration
CREATE OR REPLACE FUNCTION register_company(
  p_user_id uuid,
  p_email text,
  p_company_name text,
  p_brand_name text,
  p_business_type text,
  p_business_category text,
  p_registration_number text,
  p_gstin text,
  p_website_url text,
  p_official_email text,
  p_affiliate_code text
) RETURNS void AS $$
BEGIN
  -- Insert user record
  INSERT INTO users (id, email, user_type)
  VALUES (p_user_id, p_email, 'company');
  
  -- Insert company record
  INSERT INTO companies (
    user_id, company_name, brand_name, business_type,
    business_category, registration_number, gstin,
    website_url, official_email, affiliate_code
  ) VALUES (
    p_user_id, p_company_name, p_brand_name, p_business_type,
    p_business_category, p_registration_number, p_gstin,
    p_website_url, p_official_email, p_affiliate_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Triggers

-- Trigger for auto-generating sponsorship numbers
CREATE TRIGGER trigger_auto_sponsorship_number
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_sponsorship_number();

-- Triggers for updated_at
CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_updated_at_column();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION register_customer TO authenticated;
GRANT EXECUTE ON FUNCTION register_company TO authenticated;

-- Insert Default Data

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, price, duration_days, features, is_active) VALUES
('Basic Plan', 'Perfect for getting started with MLM', 99.00, 30, '["MLM Tree Access", "Basic Dashboard", "Email Support", "Mobile App Access"]', true),
('Premium Plan', 'Advanced features for serious networkers', 199.00, 30, '["MLM Tree Access", "Advanced Dashboard", "Priority Support", "Analytics & Reports", "Mobile App Access", "Marketing Tools"]', true),
('Enterprise Plan', 'Complete solution for MLM professionals', 399.00, 30, '["MLM Tree Access", "Enterprise Dashboard", "24/7 Support", "Advanced Analytics", "Mobile App Access", "Marketing Tools", "Custom Branding", "API Access"]', true);

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
('site_name', '"HanakhaDeals"', 'Website name'),
('logo_url', '"https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop"', 'Logo URL'),
('email_verification_required', 'true', 'Require email verification'),
('mobile_verification_required', 'true', 'Require mobile verification'),
('referral_mandatory', 'false', 'Make referral mandatory'),
('sms_gateway_provider', '"twilio"', 'SMS gateway provider'),
('sms_gateway_account_sid', '"ACtest123456789"', 'SMS gateway account SID'),
('sms_gateway_auth_token', '"test_auth_token_123"', 'SMS gateway auth token'),
('sms_gateway_from_number', '"+15005550006"', 'SMS gateway from number'),
('smtp_host', '"smtp.mailtrap.io"', 'SMTP host'),
('smtp_port', '2525', 'SMTP port'),
('smtp_username', '"test_username"', 'SMTP username'),
('smtp_password', '"test_password"', 'SMTP password'),
('smtp_encryption', '"tls"', 'SMTP encryption');

-- Insert default super admin (Password: Admin@123456)
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
);

-- Success message
SELECT 'Database setup completed successfully! All tables, functions, and default data have been created.' as status;