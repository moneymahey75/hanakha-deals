# Admin Data Loading Fix Guide

## Problem Summary

Your admin dashboard cannot load customer, company, enrollment, and payment data because of two main issues:

1. **RLS Policies Too Restrictive**: The current RLS policies only allow users to read their own data. Admins need special policies to read ALL users' data.

2. **Table Name Mismatch**: Your frontend code queries `tbl_users` and `tbl_user_profiles`, but your database has tables named `users` and `user_profiles` (without the `tbl_` prefix).

## Solution

### Step 1: Apply the RLS Policy Fix

Run the SQL script `sql_scripts/fix_admin_rls_policies.sql` in your Supabase SQL Editor. This script:

- Adds policies allowing admins to read ALL users, profiles, and companies
- Checks multiple admin table variations (`tbl_admin_users`, `admin_users`, or `users` with `user_type='admin'`)
- Handles both naming conventions (`users` and `tbl_users`)

### Step 2: Fix Table Name Inconsistencies (Choose One Option)

#### Option A: Update Frontend Code (Recommended)

Change your frontend queries from `tbl_users` to `users`. For example:

**In `src/components/admin/CustomerManagement.tsx`:**

```typescript
// BEFORE (lines 147-148):
let query = supabase
  .from('tbl_users')

// AFTER:
let query = supabase
  .from('users')
```

And update column names from `tu_*` to match your actual schema:
- `tu_id` → `id`
- `tu_email` → `email`
- `tu_user_type` → `user_type`
- `tu_is_active` → `is_active`
- `tup_first_name` → `first_name`
- etc.

#### Option B: Create Database Views (Alternative)

If you prefer to keep your frontend code unchanged, create database views:

```sql
-- Create view for tbl_users
CREATE OR REPLACE VIEW tbl_users AS
SELECT
  id as tu_id,
  email as tu_email,
  user_type as tu_user_type,
  is_verified as tu_is_verified,
  email_verified as tu_email_verified,
  mobile_verified as tu_mobile_verified,
  is_active as tu_is_active,
  created_at as tu_created_at
FROM users;

-- Create view for tbl_user_profiles
CREATE OR REPLACE VIEW tbl_user_profiles AS
SELECT
  id as tup_id,
  user_id as tup_user_id,
  first_name as tup_first_name,
  last_name as tup_last_name,
  username as tup_username,
  mobile as tup_mobile,
  gender as tup_gender,
  parent_account as tup_sponsorship_number
FROM user_profiles;

-- Grant access
GRANT SELECT ON tbl_users TO authenticated;
GRANT SELECT ON tbl_user_profiles TO authenticated;
```

### Step 3: Verify Admin Authentication

Make sure your admin login properly sets the auth session. Check that:

1. Admin users exist in one of these tables:
   - `tbl_admin_users` (with columns `tau_id`, `tau_email`, `tau_is_active`)
   - `admin_users` (with columns `id`, `email`, `is_active`)
   - `users` (with `user_type = 'admin'`)

2. The admin is logged in with Supabase auth:
   ```typescript
   const { data: { user } } = await supabase.auth.getUser();
   console.log('Logged in user:', user?.id);
   ```

3. The logged-in user's `auth.uid()` matches their admin record

### Step 4: Test the Fix

1. Run the RLS policy script in Supabase SQL Editor
2. Log in as admin
3. Navigate to the Customers tab
4. Open browser console (F12) and check for errors
5. Verify data loads correctly

## Common Issues

### Issue 1: "No rows returned"
**Cause**: RLS policies are blocking the query
**Fix**: Ensure you ran the `fix_admin_rls_policies.sql` script

### Issue 2: "relation 'tbl_users' does not exist"
**Cause**: Table name mismatch
**Fix**: Use Option A or B from Step 2 above

### Issue 3: "Admin cannot access data"
**Cause**: Admin user not properly linked
**Fix**: Ensure admin user exists in admin table AND is logged in via Supabase Auth

## Quick Verification SQL

Run this in Supabase SQL Editor to check your setup:

```sql
-- Check which admin tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE '%admin%';

-- Check which user tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE '%user%';

-- Check your admin user
SELECT * FROM tbl_admin_users LIMIT 5;
-- OR
SELECT * FROM admin_users LIMIT 5;

-- Check regular users
SELECT * FROM users LIMIT 5;

-- Check RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('users', 'user_profiles', 'companies', 'tbl_users');
```

## Need More Help?

If data still doesn't load after following these steps:

1. Check browser console for specific error messages
2. Run the verification SQL above and share results
3. Check the Network tab to see which queries are failing
4. Verify you're logged in as an admin user
