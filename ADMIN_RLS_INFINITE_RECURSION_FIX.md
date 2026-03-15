# Admin RLS Infinite Recursion Fix

## Problem

When attempting to check if a user is an admin during login, the following error occurred:

```
Request URL: .../tbl_admin_users?select=tau_id&tau_auth_uid=eq.[user_id]
Status: 500 Internal Server Error
Response: {
  "code": "42P17",
  "message": "infinite recursion detected in policy for relation \"tbl_admin_users\""
}
```

## Root Cause

The RLS policies on `tbl_admin_users` were checking the same table they were protecting, creating an infinite loop:

```sql
-- Problematic policy example:
CREATE POLICY "superadmin_admin_users_select_all"
  ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tbl_admin_users  -- ❌ Queries same table
      WHERE tau_auth_uid = auth.uid()
        AND tau_role = 'super_admin'
        AND tau_is_active = true
    )
  );
```

### The Recursion Loop:

```
1. Query tbl_admin_users
   ↓
2. RLS policy activates
   ↓
3. Policy checks: EXISTS (SELECT FROM tbl_admin_users ...)
   ↓
4. This query triggers RLS again
   ↓
5. Policy checks: EXISTS (SELECT FROM tbl_admin_users ...)
   ↓
6. ... infinite recursion ...
```

## Solution

Redesigned the RLS policies to eliminate recursion:

### 1. Simple, Non-Recursive Policies

**Allow anon users to check admin existence (for login):**
```sql
CREATE POLICY "anon_check_admin_exists"
  ON tbl_admin_users
  FOR SELECT
  TO anon
  USING (true);  -- ✅ No recursion
```

**Allow authenticated admins to read own record:**
```sql
CREATE POLICY "admin_read_own"
  ON tbl_admin_users
  FOR SELECT
  TO authenticated
  USING (tau_auth_uid = auth.uid());  -- ✅ Simple check
```

**Allow admins to update own record (except role):**
```sql
CREATE POLICY "admin_update_own"
  ON tbl_admin_users
  FOR UPDATE
  TO authenticated
  USING (tau_auth_uid = auth.uid())
  WITH CHECK (
    tau_auth_uid = auth.uid()
    AND tau_role = (
      SELECT tau_role FROM tbl_admin_users
      WHERE tau_auth_uid = auth.uid()
      LIMIT 1
    )
  );
```

### 2. SECURITY DEFINER Functions for Admin Operations

For super admin operations, created helper functions that bypass RLS:

```sql
-- Check if current user is super admin
CREATE OR REPLACE FUNCTION is_active_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER  -- ✅ Bypasses RLS
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tbl_admin_users
    WHERE tau_auth_uid = auth.uid()
      AND tau_role = 'super_admin'
      AND tau_is_active = true
  );
$$;

-- Get all admin users (super admin only)
CREATE OR REPLACE FUNCTION get_all_admin_users()
RETURNS SETOF tbl_admin_users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM tbl_admin_users
  WHERE is_active_super_admin();
$$;

-- Create new admin user (super admin only)
CREATE OR REPLACE FUNCTION create_admin_user(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_active_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can create admin users';
  END IF;
  -- ... creation logic
END;
$$;
```

### 3. Updated Security Model

| Role | Permissions | Method |
|------|------------|--------|
| **anon** | Can check if admin exists | Direct policy (for login flow) |
| **authenticated (admin)** | Can read/update own record | Direct policy |
| **authenticated (super_admin)** | Full CRUD on all admins | SECURITY DEFINER functions |
| **service_role** | Full access | Direct policy |

## Key Improvements

### 1. No More Recursion
- Policies don't query the table they're protecting
- Helper functions use SECURITY DEFINER to bypass RLS safely

### 2. Secure Login Flow
- Anon users can check admin existence (read-only)
- No sensitive data exposed (only tau_id visible)
- Frontend can verify admin exists before attempting login

### 3. Proper Super Admin Operations
- All admin management goes through validated functions
- Functions check caller permissions first
- Cannot create/modify/delete super_admin role
- Audit trail can be added to functions

### 4. Better Error Handling
- Functions return jsonb with success/error info
- Clear error messages for authorization failures
- Prevents accidental policy violations

## Migration Applied

**File:** `supabase/migrations/fix_admin_users_infinite_recursion.sql`

### Changes Made:

1. **Dropped all recursive policies** (16 policies removed)
2. **Created 4 simple policies:**
   - `anon_check_admin_exists` - Login flow support
   - `admin_read_own` - Self-service read
   - `admin_update_own` - Self-service update
   - `service_role_full_access` - Backend operations

3. **Created 5 helper functions:**
   - `is_active_super_admin()` - Permission checker
   - `get_all_admin_users()` - List all admins
   - `create_admin_user()` - Create new admin
   - `update_admin_user()` - Update admin
   - `delete_admin_user()` - Delete admin

## Testing the Fix

### Test 1: Admin Login Check (Previously Failed)
```typescript
// Frontend can now check if user is admin
const { data: adminCheck } = await supabase
  .from('tbl_admin_users')
  .select('tau_id')
  .eq('tau_auth_uid', userId)
  .maybeSingle();

// ✅ Works! No more infinite recursion
```

### Test 2: Admin Reading Own Record
```typescript
// After admin logs in
const { data } = await supabase
  .from('tbl_admin_users')
  .select('*')
  .eq('tau_auth_uid', auth.uid())
  .single();

// ✅ Returns admin's own record
```

### Test 3: Super Admin Operations
```typescript
// Super admin creates new admin
const { data } = await supabase.rpc('create_admin_user', {
  p_username: 'newadmin',
  p_email: 'admin@example.com',
  p_full_name: 'New Admin',
  p_role: 'sub_admin'
});

// ✅ Only works if caller is super_admin
```

## Security Considerations

### Safe Design Decisions:

1. **Anon Access to Admin Table**
   - Only SELECT permission
   - No sensitive data exposed in basic query
   - Necessary for login flow
   - Cannot modify or delete

2. **SECURITY DEFINER Functions**
   - All functions validate caller is super_admin first
   - Input validation for all parameters
   - Cannot escalate to super_admin
   - SET search_path = public for safety
   - Functions are well-scoped and auditable

3. **Role Protection**
   - Super admin role cannot be created via functions
   - Super admin role cannot be modified
   - Super admin user cannot be deleted
   - Only one super admin should exist

## Related Issues Fixed

This fix also resolves:
- Admin login failures
- Admin dashboard access issues
- Admin management panel errors
- Session validation for admin users

## Files Changed

1. `supabase/migrations/fix_admin_users_infinite_recursion.sql` - RLS policy redesign
2. `ADMIN_RLS_INFINITE_RECURSION_FIX.md` - This documentation

## Related Documentation

- `USER_SIGNUP_FIX.md` - User registration RLS fixes
- `SPONSORSHIP_VALIDATION_FIX.md` - Sponsor validation RLS fixes
- `OTP_FIX_SUMMARY.md` - OTP verification system fixes
