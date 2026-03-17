# Admin and Customer Session Separation

## Problem
Previously, both admin and customer authentication used the same Supabase Auth session. This caused conflicts where:
- Logging in as admin would overwrite customer session
- Logging out from frontend would also logout admin
- Both sessions couldn't coexist in the same browser

## Solution
Implemented completely separate authentication systems:

### 1. Customer Authentication
- **Uses**: Supabase Auth (`supabase` client from `lib/supabase.ts`)
- **Session Storage**: localStorage + sessionStorage
- **Session Type**: `customer`
- **Auth Method**: `supabase.auth.signInWithPassword()`

### 2. Admin Authentication
- **Uses**: Custom token-based auth (`adminSupabase` client from `lib/adminSupabase.ts`)
- **Session Storage**: sessionStorage only (no Supabase Auth)
- **Session Type**: `admin`
- **Auth Method**: Custom bcrypt password verification + RPC

## Key Changes

### New File: `src/lib/adminSupabase.ts`
- Separate Supabase client for admin operations
- Does NOT use Supabase Auth (`persistSession: false`)
- Custom `adminSessionManager` for session handling
- Session stored in `admin_session_data` (sessionStorage)

### Updated: `src/contexts/AdminAuthContext.tsx`
- Removed all `supabase.auth` calls
- Uses `adminSupabase` client instead
- Login validates password with bcrypt (no Supabase Auth)
- Logout only clears admin session (doesn't touch customer)
- Session validation doesn't check Supabase Auth

### Updated: All Admin Components
All files in `src/components/admin/` now import:
```typescript
import { adminSupabase as supabase } from '../../lib/adminSupabase';
```

This ensures admin operations use the separate client without code changes.

## Session Separation Logic

### Session Type Detection
Both contexts check `sessionStorage.getItem('session_type')`:
- **AdminAuthContext**: Only initializes if `session_type !== 'customer'`
- **AuthContext**: Only initializes if `session_type !== 'admin'`

### Login Flow

**Admin Login:**
1. Verify credentials with RPC (`admin_login_verify`)
2. Validate password with bcrypt
3. Save session to `adminSessionManager`
4. Set `session_type = 'admin'`
5. NO Supabase Auth involved

**Customer Login:**
1. Authenticate with Supabase Auth
2. Save session to `sessionManager`
3. Set `session_type = 'customer'`
4. Uses standard Supabase Auth flow

### Logout Flow

**Admin Logout:**
- Clears `admin_session_data`
- Removes `admin_session_token`
- Only clears `session_type` if it's `'admin'`
- Does NOT call `supabase.auth.signOut()`

**Customer Logout:**
- Clears customer session from localStorage
- Calls `supabase.auth.signOut()`
- Only clears `session_type` if it's `'customer'`
- Does NOT touch admin session

## Benefits

1. **Independent Sessions**: Admin and customer can be logged in simultaneously
2. **No Conflicts**: Logging out from one doesn't affect the other
3. **Better Security**: Admin uses custom auth, not exposed through Supabase Auth
4. **Clean Separation**: Each system uses its own client and storage

## Usage

### Admin Login
```typescript
// In admin panel (/backpanel/admin)
await adminAuth.login(email, password);
// Sets session_type = 'admin'
// No Supabase Auth session created
```

### Customer Login
```typescript
// In frontend (/customer/login)
await auth.login(email, password, 'customer');
// Sets session_type = 'customer'
// Creates Supabase Auth session
```

### Impersonation
When admin impersonates a customer:
- Opens in new browser tab
- Separate window = separate session context
- Admin session stays in original tab
- Customer session in new tab

## Admin Data Access

Since admin doesn't use Supabase Auth, all data access is done through **RPC functions with SECURITY DEFINER**:

### Available Admin RPCs
- `admin_get_customers(search, status, verification, offset, limit)` - Get customer list
- `admin_get_companies(search, status, offset, limit)` - Get company list
- `admin_get_coupons(search, status, offset, limit)` - Get coupon list
- `admin_get_daily_tasks(offset, limit)` - Get daily tasks
- `admin_get_subscriptions(search, status, offset, limit)` - Get subscriptions
- `admin_get_pending_payments(offset, limit)` - Get pending payments
- `admin_get_wallets(search, offset, limit)` - Get wallet information
- `admin_get_system_settings()` - Get all system settings
- `admin_update_system_setting(key, value)` - Update a setting

All these functions:
- Use `SECURITY DEFINER` to bypass RLS
- Are granted to `authenticated` and `anon` roles
- Return complete data with joins and total counts

## Testing

Test these scenarios:
1. ✅ Login as admin → Open frontend → Should show login page (not logged in)
2. ✅ Login as customer → Open admin panel → Should show admin login (not logged in)
3. ✅ Login as admin → Logout admin → Customer should remain logged in (if any)
4. ✅ Login as customer → Logout customer → Admin should remain logged in (if any)
5. ✅ Admin impersonate customer → Opens new tab → Both sessions independent
6. ✅ Admin navigates between pages → Session persists
7. ✅ Admin views customer/company/coupon data → Data loads correctly via RPCs
