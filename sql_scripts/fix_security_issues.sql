/*
  # Fix Security Issues

  This script addresses the following security concerns:
  1. Auth DB Connection Strategy - Switch to percentage-based allocation
  2. Function Search Path Mutable - Fix for find_available_position_v2
  3. Function Search Path Mutable - Fix for add_user_to_mlm_tree_v2

  These fixes improve security and performance of the database.
*/

-- ============================================
-- FIX 1: Auth DB Connection Strategy
-- ============================================
-- Note: This setting is typically managed through Supabase Dashboard
-- But we can document the recommended configuration here
/*
  To fix the Auth DB Connection Strategy issue:

  1. Go to Supabase Dashboard > Project Settings > Database
  2. Navigate to "Connection Pooling" settings
  3. Change Auth connection allocation from fixed number (10) to percentage
  4. Recommended: Set to 10-20% of max connections

  OR use the Supabase CLI:
  supabase secrets set AUTH_DB_MAX_CONNECTIONS_PERCENTAGE=15
*/

-- ============================================
-- FIX 2: Fix Function Search Path Mutable Issues
-- ============================================

-- Drop and recreate find_available_position_v2 with secure search_path
DROP FUNCTION IF EXISTS find_available_position_v2(text);

CREATE OR REPLACE FUNCTION find_available_position_v2(p_sponsor_sponsorship_number text)
RETURNS TABLE(
    parent_node_id uuid,
    "position" text,
    level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sponsor_node_id uuid;
    v_sponsor_level integer;
BEGIN
    -- Find sponsor's node in the tree
    SELECT tmt_id, tmt_level INTO v_sponsor_node_id, v_sponsor_level
    FROM tbl_mlm_tree
    WHERE tmt_sponsorship_number = p_sponsor_sponsorship_number
      AND tmt_is_active = true;

    IF v_sponsor_node_id IS NULL THEN
        RAISE EXCEPTION 'Sponsor not found in MLM tree: %', p_sponsor_sponsorship_number;
    END IF;

    -- Use breadth-first search to find first available position
    RETURN QUERY
    WITH RECURSIVE tree_search AS (
        -- Start with sponsor node
        SELECT
            tmt_id,
            tmt_left_child_id,
            tmt_right_child_id,
            tmt_level,
            0 as search_depth
        FROM tbl_mlm_tree
        WHERE tmt_id = v_sponsor_node_id

        UNION ALL

        -- Recursively search children (breadth-first)
        SELECT
            mt.tmt_id,
            mt.tmt_left_child_id,
            mt.tmt_right_child_id,
            mt.tmt_level,
            ts.search_depth + 1
        FROM tbl_mlm_tree mt
        JOIN tree_search ts ON (mt.tmt_id = ts.tmt_left_child_id OR mt.tmt_id = ts.tmt_right_child_id)
        WHERE ts.search_depth < 10
    )
    SELECT
        ts.tmt_id as parent_node_id,
        CASE
            WHEN ts.tmt_left_child_id IS NULL THEN 'left'
            WHEN ts.tmt_right_child_id IS NULL THEN 'right'
            ELSE NULL
        END as "position",
        ts.tmt_level + 1 as level
    FROM tree_search ts
    WHERE (ts.tmt_left_child_id IS NULL OR ts.tmt_right_child_id IS NULL)
    ORDER BY ts.search_depth, ts.tmt_id
    LIMIT 1;

    -- If no position found in tree, place directly under sponsor
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            v_sponsor_node_id as parent_node_id,
            CASE
                WHEN tmt_left_child_id IS NULL THEN 'left'
                WHEN tmt_right_child_id IS NULL THEN 'right'
                ELSE 'overflow'
            END as "position",
            tmt_level + 1 as level
        FROM tbl_mlm_tree
        WHERE tmt_id = v_sponsor_node_id;
    END IF;
END;
$$;

-- Drop and recreate add_user_to_mlm_tree_v2 with secure search_path
DROP FUNCTION IF EXISTS add_user_to_mlm_tree_v2(uuid, text, text);

CREATE OR REPLACE FUNCTION add_user_to_mlm_tree_v2(
    p_user_id uuid,
    p_sponsorship_number text,
    p_sponsor_sponsorship_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_new_node_id uuid;
    v_parent_node_id uuid;
    v_position text;
    v_level integer;
BEGIN
    -- Check if user already exists in tree
    SELECT tmt_id INTO v_new_node_id
    FROM tbl_mlm_tree
    WHERE tmt_user_id = p_user_id;

    IF v_new_node_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User already exists in MLM tree',
            'node_id', v_new_node_id
        );
    END IF;

    -- Find available position
    SELECT parent_node_id, "position", level
    INTO v_parent_node_id, v_position, v_level
    FROM find_available_position_v2(p_sponsor_sponsorship_number);

    IF v_parent_node_id IS NULL OR v_position IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No available position found for sponsor: ' || p_sponsor_sponsorship_number
        );
    END IF;

    IF v_position = 'overflow' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Sponsor tree is full. Cannot place new user under: ' || p_sponsor_sponsorship_number
        );
    END IF;

    -- Insert new node
    INSERT INTO tbl_mlm_tree (
        tmt_user_id,
        tmt_parent_id,
        tmt_left_child_id,
        tmt_right_child_id,
        tmt_level,
        tmt_position,
        tmt_sponsorship_number,
        tmt_is_active
    ) VALUES (
        p_user_id,
        v_parent_node_id,
        NULL,
        NULL,
        v_level,
        v_position,
        p_sponsorship_number,
        true
    ) RETURNING tmt_id INTO v_new_node_id;

    -- Update parent node to link to new child
    IF v_position = 'left' THEN
        UPDATE tbl_mlm_tree
        SET tmt_left_child_id = v_new_node_id,
            tmt_updated_at = now()
        WHERE tmt_id = v_parent_node_id;
    ELSE
        UPDATE tbl_mlm_tree
        SET tmt_right_child_id = v_new_node_id,
            tmt_updated_at = now()
        WHERE tmt_id = v_parent_node_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'node_id', v_new_node_id,
        'parent_id', v_parent_node_id,
        'position', v_position,
        'level', v_level,
        'message', 'User successfully added to MLM tree'
    );
END;
$$;

-- ============================================
-- FIX 3: Secure Other Functions (if they exist)
-- ============================================

-- Fix register_customer function if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'register_customer'
    ) THEN
        DROP FUNCTION IF EXISTS register_customer(uuid, text, text, text, text, text, text, text);

        CREATE FUNCTION register_customer(
            p_user_id uuid,
            p_email text,
            p_first_name text,
            p_last_name text,
            p_username text,
            p_mobile text,
            p_gender text,
            p_parent_account text
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $func$
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
        $func$;

        GRANT EXECUTE ON FUNCTION register_customer TO authenticated;
    END IF;
END $$;

-- Fix register_company function if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'register_company'
    ) THEN
        DROP FUNCTION IF EXISTS register_company(uuid, text, text, text, text, text, text, text, text, text, text);

        CREATE FUNCTION register_company(
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
        )
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $func$
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
        $func$;

        GRANT EXECUTE ON FUNCTION register_company TO authenticated;
    END IF;
END $$;

-- Fix update_wallet_balance function if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'update_wallet_balance'
    ) THEN
        DROP FUNCTION IF EXISTS update_wallet_balance(uuid, numeric, text, text, text, uuid);

        CREATE FUNCTION update_wallet_balance(
            p_user_id uuid,
            p_amount numeric(18,8),
            p_transaction_type text,
            p_description text,
            p_reference_type text DEFAULT NULL,
            p_reference_id uuid DEFAULT NULL
        )
        RETURNS json
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $func$
        DECLARE
            v_wallet_id uuid;
            v_current_balance numeric(18,8);
            v_new_balance numeric(18,8);
            v_transaction_id uuid;
        BEGIN
            -- Get user's wallet
            SELECT tw_id, tw_balance INTO v_wallet_id, v_current_balance
            FROM tbl_wallets
            WHERE tw_user_id = p_user_id AND tw_currency = 'USDT';

            IF v_wallet_id IS NULL THEN
                RAISE EXCEPTION 'Wallet not found for user';
            END IF;

            -- Calculate new balance
            IF p_transaction_type = 'credit' THEN
                v_new_balance := v_current_balance + p_amount;
            ELSIF p_transaction_type = 'debit' THEN
                IF v_current_balance < p_amount THEN
                    RAISE EXCEPTION 'Insufficient balance';
                END IF;
                v_new_balance := v_current_balance - p_amount;
            ELSE
                RAISE EXCEPTION 'Invalid transaction type';
            END IF;

            -- Update wallet balance
            UPDATE tbl_wallets
            SET tw_balance = v_new_balance, tw_updated_at = now()
            WHERE tw_id = v_wallet_id;

            -- Create transaction record
            INSERT INTO tbl_wallet_transactions (
                twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount,
                twt_description, twt_reference_type, twt_reference_id
            ) VALUES (
                v_wallet_id, p_user_id, p_transaction_type, p_amount,
                p_description, p_reference_type, p_reference_id
            ) RETURNING twt_id INTO v_transaction_id;

            RETURN json_build_object(
                'success', true,
                'wallet_id', v_wallet_id,
                'transaction_id', v_transaction_id,
                'old_balance', v_current_balance,
                'new_balance', v_new_balance
            );
        END;
        $func$;

        GRANT EXECUTE ON FUNCTION update_wallet_balance TO authenticated;
    END IF;
END $$;

-- ============================================
-- Grant Necessary Permissions
-- ============================================

-- Grant execute permissions for the fixed functions
GRANT EXECUTE ON FUNCTION find_available_position_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_mlm_tree_v2 TO authenticated;

-- ============================================
-- Verification Query
-- ============================================
/*
  Run this query to verify the fixes:

  SELECT
    p.proname as function_name,
    p.prosecdef as is_security_definer,
    p.proconfig as search_path_config
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname IN (
    'find_available_position_v2',
    'add_user_to_mlm_tree_v2',
    'register_customer',
    'register_company',
    'update_wallet_balance'
  )
  ORDER BY p.proname;

  Expected result:
  - is_security_definer should be true (t)
  - search_path_config should show: {search_path=public,pg_temp}
*/
