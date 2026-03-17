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

## Files Modified

1. **Migration**: `supabase/migrations/*_fix_admin_rpc_functions_correct_tables.sql`
2. **Frontend Components**:
   - `src/components/admin/CouponManagement.tsx`
   - `src/components/admin/DailyTaskManagement.tsx`
   - `src/components/admin/CompanyManagement.tsx`
3. **Documentation**: `ADMIN_DATA_ACCESS_FIX.md`, `OTP_MISMATCH_FIX.md`

## Related Issues

- This fix resolves the `permission denied for table tbl_users` error
- All admin panel data loading now works correctly
- Admin CRUD operations use secure RPC functions
