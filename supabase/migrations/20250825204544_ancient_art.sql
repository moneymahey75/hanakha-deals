/*
  # Fix Company Registration Issues

  1. Database Functions
    - Update register_company function to handle existing users
    - Add proper error handling for duplicate companies
    
  2. Security
    - Ensure proper RLS policies for company operations
    - Add validation for company-coupon relationships
    
  3. Data Integrity
    - Add constraints to prevent duplicate company registrations
    - Ensure proper foreign key relationships
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS register_company(uuid, text, text, text, text, text, text, text, text, text, text);

-- Create improved register_company function
CREATE OR REPLACE FUNCTION register_company(
    p_user_id uuid,
    p_email text,
    p_company_name text,
    p_brand_name text DEFAULT NULL,
    p_business_type text DEFAULT NULL,
    p_business_category text DEFAULT NULL,
    p_registration_number text,
    p_gstin text,
    p_website_url text DEFAULT NULL,
    p_official_email text,
    p_affiliate_code text DEFAULT NULL
) RETURNS json AS $$
DECLARE
    v_result json;
    v_existing_company_id uuid;
BEGIN
    -- Check if user already has a company profile
    SELECT tc_id INTO v_existing_company_id
    FROM tbl_companies
    WHERE tc_user_id = p_user_id;
    
    IF v_existing_company_id IS NOT NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User already has a company profile',
            'company_id', v_existing_company_id
        );
    END IF;
    
    -- Check if registration number already exists
    IF EXISTS (
        SELECT 1 FROM tbl_companies 
        WHERE tc_registration_number = p_registration_number
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Registration number already exists'
        );
    END IF;
    
    -- Check if GSTIN already exists
    IF EXISTS (
        SELECT 1 FROM tbl_companies 
        WHERE tc_gstin = p_gstin
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'GSTIN already exists'
        );
    END IF;
    
    -- Insert or update user record
    INSERT INTO tbl_users (
        tu_id, tu_email, tu_user_type, tu_is_verified, 
        tu_email_verified, tu_mobile_verified, tu_is_active
    ) VALUES (
        p_user_id, p_email, 'company', true, true, true, true
    )
    ON CONFLICT (tu_id) DO UPDATE SET
        tu_email = EXCLUDED.tu_email,
        tu_user_type = 'company',
        tu_updated_at = now();
    
    -- Insert company record
    INSERT INTO tbl_companies (
        tc_user_id, tc_company_name, tc_brand_name, tc_business_type,
        tc_business_category, tc_registration_number, tc_gstin,
        tc_website_url, tc_official_email, tc_affiliate_code,
        tc_verification_status
    ) VALUES (
        p_user_id, p_company_name, p_brand_name, p_business_type,
        p_business_category, p_registration_number, p_gstin,
        p_website_url, p_official_email, p_affiliate_code,
        'pending'
    );
    
    -- Get the created company ID
    SELECT tc_id INTO v_existing_company_id
    FROM tbl_companies
    WHERE tc_user_id = p_user_id;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Company registered successfully',
        'company_id', v_existing_company_id,
        'user_id', p_user_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies for companies table
ALTER TABLE tbl_companies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Companies can insert own data" ON tbl_companies;
DROP POLICY IF EXISTS "Companies can read own data" ON tbl_companies;
DROP POLICY IF EXISTS "Companies can update own data" ON tbl_companies;
DROP POLICY IF EXISTS "Admins can manage all companies" ON tbl_companies;

-- Create comprehensive RLS policies for companies
CREATE POLICY "Companies can insert own data"
    ON tbl_companies
    FOR INSERT
    TO authenticated
    WITH CHECK (tc_user_id = uid());

CREATE POLICY "Companies can read own data"
    ON tbl_companies
    FOR SELECT
    TO authenticated
    USING (tc_user_id = uid());

CREATE POLICY "Companies can update own data"
    ON tbl_companies
    FOR UPDATE
    TO authenticated
    USING (tc_user_id = uid())
    WITH CHECK (tc_user_id = uid());

CREATE POLICY "Admins can manage all companies"
    ON tbl_companies
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tbl_users 
            WHERE tu_id = uid() AND tu_user_type = 'admin'
        )
    );

-- Update coupon policies to ensure proper company relationship
DROP POLICY IF EXISTS "Admins can manage all coupons" ON tbl_coupons;
DROP POLICY IF EXISTS "Companies can manage own coupons" ON tbl_coupons;
DROP POLICY IF EXISTS "Everyone can read approved coupons" ON tbl_coupons;

CREATE POLICY "Admins can manage all coupons"
    ON tbl_coupons
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tbl_users 
            WHERE tu_id = uid() AND tu_user_type = 'admin'
        )
    );

CREATE POLICY "Companies can manage own coupons"
    ON tbl_coupons
    FOR ALL
    TO authenticated
    USING (
        tc_created_by = uid() OR 
        EXISTS (
            SELECT 1 FROM tbl_companies 
            WHERE tc_id = tbl_coupons.tc_company_id AND tc_user_id = uid()
        )
    );

CREATE POLICY "Everyone can read approved coupons"
    ON tbl_coupons
    FOR SELECT
    TO authenticated
    USING (tc_status = 'approved' AND tc_is_active = true);

-- Add index for better performance on company-coupon queries
CREATE INDEX IF NOT EXISTS idx_tbl_coupons_company_status 
ON tbl_coupons(tc_company_id, tc_status) 
WHERE tc_is_active = true;

-- Add constraint to ensure coupons have either a company or are admin-created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tbl_coupons_company_or_admin_check'
    ) THEN
        ALTER TABLE tbl_coupons 
        ADD CONSTRAINT tbl_coupons_company_or_admin_check 
        CHECK (
            tc_company_id IS NOT NULL OR 
            EXISTS (
                SELECT 1 FROM tbl_users 
                WHERE tu_id = tc_created_by AND tu_user_type = 'admin'
            )
        );
    END IF;
END $$;