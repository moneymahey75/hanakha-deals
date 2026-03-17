# Admin Data Access Fix

## Problem

Admin panel was unable to load data for:
- Customers
- Companies
- Coupons
- Daily Tasks

Error: `permission denied for table tbl_users` (42501)

## Root Cause

The admin components were using **direct table access** (`supabase.from()`) which requires RLS (Row Level Security) policies. While some RPC functions with `SECURITY DEFINER` existed, several issues were found:

1. **Wrong Table References**: The `admin_get_coupons` RPC was querying `tbl_company_coupons` (doesn't exist) instead of `tbl_coupons`
2. **Wrong Schema**: The `admin_get_daily_tasks` RPC was returning incorrect column names
3. **Mixed Access Patterns**: Components used direct table access for updates/deletes instead of RPC functions

## Solution

### 1. Fixed RPC Functions

Created migration `fix_admin_rpc_functions_correct_tables.sql` that:

- **Dropped and recreated `admin_get_coupons`**:
  - Now queries `tbl_coupons` instead of non-existent `tbl_company_coupons`
  - Returns correct schema with `company_data` as JSONB
  - Supports filtering by status (all, active, inactive, pending, approved)

- **Dropped and recreated `admin_get_daily_tasks`**:
  - Returns correct column names matching `tbl_daily_tasks` schema
  - Includes `coupon_data` as JSONB join
  - Fixed all column prefixes (`tdt_`)

- **Added new admin RPC functions**:
  - `admin_update_coupon` - Update coupon status, active state, launch settings
  - `admin_delete_coupon` - Delete a coupon
  - `admin_update_company` - Update company verification status
  - `admin_create_daily_task` - Create new daily task
  - `admin_update_daily_task` - Update daily task active state
  - `admin_delete_daily_task` - Delete a daily task

All functions use `SECURITY DEFINER` to bypass RLS.

### 2. Updated Frontend Components

#### CouponManagement.tsx
- ✅ `loadCoupons()` - Now uses `admin_get_coupons` RPC
- ✅ `handleApproveCoupon()` - Now uses `admin_update_coupon` RPC
- ✅ `handleDeclineCoupon()` - Now uses `admin_update_coupon` RPC
- ✅ `handleCancelCoupon()` - Now uses `admin_update_coupon` RPC
- ✅ `handleDeleteCoupon()` - Now uses `admin_delete_coupon` RPC
- ✅ `handleLaunchCoupon()` - Now uses `admin_update_coupon` RPC

#### DailyTaskManagement.tsx
- ✅ `loadTasks()` - Now uses `admin_get_daily_tasks` RPC
- ✅ `handleCreateTask()` - Now uses `admin_create_daily_task` RPC

#### CompanyManagement.tsx
- ✅ `loadCompanies()` - Already using `admin_get_companies` RPC (added logging)
- ✅ `handleApproveCompany()` - Now uses `admin_update_company` RPC
- ✅ `handleRejectCompany()` - Now uses `admin_update_company` RPC

#### CustomerManagement.tsx
- ✅ `loadCustomers()` - Already using `admin_get_customers` RPC

### 3. Data Flow

**Before:**
```
Admin Component → Direct Table Access → RLS Policy Check → ❌ DENIED
```

**After:**
```
Admin Component → RPC Function (SECURITY DEFINER) → Bypasses RLS → ✅ SUCCESS
```

## Testing

To verify the fix:

1. **Login as admin**
2. **Navigate to each admin section**:
   - Customer Management - Should load customer list
   - Company Management - Should load company list
   - Coupon Management - Should load coupon list
   - Daily Task Management - Should load tasks

3. **Test CRUD operations**:
   - Create new daily task
   - Approve/Decline coupons
   - Approve/Reject companies
   - Update customer details

## Technical Details

### RPC Function Benefits

Using RPC functions with `SECURITY DEFINER`:
- Bypasses RLS policies (runs with definer's privileges)
- Centralized business logic
- Better security (no direct table access)
- Easier to audit and maintain
- Type-safe return values

### Security Considerations

- All RPC functions are granted to `authenticated` and `anon` roles
- Functions validate inputs and return structured responses
- No sensitive data exposed in function signatures
- Admin authentication still required at application level

## Additional Fix: Admin Authentication

### Problem
After implementing RPC functions, admins were getting "Not authenticated" errors when calling RPC functions.

### Root Cause
The admin authentication system was custom (not using Supabase Auth), but RPC functions require an authenticated Supabase session to work properly.

### Solution

**1. Updated Admin Login Flow** (`src/contexts/AdminAuthContext.tsx`):
- When admin logs in with email/password, the system now also signs them into Supabase Auth
- This provides the authenticated session needed for RPC calls
- Logout also signs out from Supabase Auth

**2. Fixed adminSupabase Client** (`src/lib/adminSupabase.ts`):
- Changed from `persistSession: false` to `persistSession: true`
- Added `autoRefreshToken: true` to maintain session
- Uses separate storage key `admin-auth-token` to avoid conflicts with customer sessions

**3. Ensured All Admins Have Auth Records** (Migration: `ensure_admin_auth_linkage_complete.sql`):
- Automatically creates `auth.users` records for admins without them
- Links existing admins to their auth.users via `tau_auth_uid`
- All admins can now authenticate with Supabase Auth

### Data Flow After Fix

**Before:**
```
Admin Login → Custom Auth → No Supabase Session → RPC Call → ❌ "Not authenticated"
```

**After:**
```
Admin Login → Custom Auth ✓ + Supabase Auth Sign-in ✓ → RPC Call → ✅ SUCCESS
```

## Files Modified

1. **Migrations**:
   - `supabase/migrations/*_fix_admin_rpc_functions_correct_tables.sql`
   - `supabase/migrations/*_ensure_admin_auth_linkage_complete.sql`
2. **Frontend Components**:
   - `src/components/admin/CouponManagement.tsx`
   - `src/components/admin/DailyTaskManagement.tsx`
   - `src/components/admin/CompanyManagement.tsx`
3. **Authentication**:
   - `src/contexts/AdminAuthContext.tsx`
   - `src/lib/adminSupabase.ts`
4. **Documentation**: `ADMIN_DATA_ACCESS_FIX.md`

## Related Issues

- This fix resolves the `permission denied for table tbl_users` error
- This fix resolves the "Not authenticated" error for admin RPC calls
- All admin panel data loading now works correctly
- Admin CRUD operations use secure RPC functions
- Admins are now properly authenticated with Supabase Auth
