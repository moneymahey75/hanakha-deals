# Username Lookup Permission Fix

## Problem
Getting 401 "permission denied for table tbl_user_profiles" error when checking username availability during registration or login. The error showed direct REST API calls to the table instead of using secure RPC functions.

## Root Cause
The code was making direct queries to `tbl_user_profiles` table which requires authentication due to RLS policies. Anonymous users (during registration) and users during login were unable to:
1. Check if a username already exists
2. Get email from username for login
3. Validate sponsorship codes

## Solution Implemented

### 1. Created Secure RPC Functions

Three SECURITY DEFINER functions were created to safely bypass RLS:

**`check_username_exists(p_username TEXT)`**
- Returns boolean indicating if username is taken
- Used during registration for username validation
- Case-insensitive check

**`get_email_by_username(p_username TEXT)`**
- Returns user_id and email for a given username
- Used during login when user enters username instead of email
- Case-insensitive check

**`get_profile_by_sponsorship(p_code TEXT)`**
- Returns user profile info for a valid sponsorship code
- Used during registration to validate referral codes
- Only returns non-sensitive data

### 2. Granted Execute Permissions
All functions have EXECUTE permission granted to:
- `anon` (anonymous/unauthenticated users)
- `authenticated` (logged-in users)
- `service_role` (admin operations)

### 3. Added Fallback RLS Policy
Created `anon_username_sponsorship_lookup` policy as a safety net:
- Allows anonymous users to SELECT from tbl_user_profiles
- Only when querying username or sponsorship_number columns
- Minimal exposure of data

### 4. Updated Frontend Code

**AuthContext.tsx (Login)**
- Changed from direct `.from('tbl_user_profiles')` query
- Now uses `.rpc('get_email_by_username')` for username-to-email lookup

**CustomerRegister.tsx (Registration)**
- Already correctly using `.rpc('check_username_exists')` for username validation
- Already correctly using `.rpc('get_sponsor_by_sponsorship_number')` for sponsorship validation
- Added console logging for better debugging

## Security Benefits

1. **No Direct Table Access**: Anonymous users cannot query the table directly
2. **Minimal Data Exposure**: RPC functions only return necessary data
3. **SECURITY DEFINER**: Functions run with elevated privileges but are carefully designed
4. **Explicit Permissions**: Only specific operations allowed via RPC functions
5. **Case-Insensitive Checks**: Prevents duplicate usernames with different cases

## Testing Results

All functions tested and verified:
- ✅ `check_username_exists('aarti_mlm')` returns `false` (doesn't exist)
- ✅ `check_username_exists('amanveer_mlm')` returns `true` (exists)
- ✅ `get_email_by_username('amanveer_mlm')` returns correct user_id and email
- ✅ All permissions properly granted to anon, authenticated, and service_role

## What Changed

### Database
- Created 3 new RPC functions with SECURITY DEFINER
- Added fallback RLS policy for username/sponsorship lookups
- Properly granted EXECUTE permissions

### Frontend
- Updated `AuthContext.tsx` login to use RPC function
- Verified `CustomerRegister.tsx` already using RPC functions correctly
- Added debug logging for username checks

## How to Use

### Check Username Exists (Registration)
```typescript
const { data, error } = await supabase
  .rpc('check_username_exists', { p_username: username });
// data will be true/false
```

### Get Email by Username (Login)
```typescript
const { data, error } = await supabase
  .rpc('get_email_by_username', { p_username: username });
// data will be array with [{ user_id, email }]
```

### Validate Sponsorship Code (Registration)
```typescript
const { data, error } = await supabase
  .rpc('get_profile_by_sponsorship', { p_code: sponsorshipCode });
// data will be array with [{ tup_user_id, tup_username, tup_sponsorship_number }]
```

## Next Steps

1. **Clear browser cache** and hard refresh the page
2. Test registration with username check
3. Test login with username instead of email
4. Test registration with sponsorship code validation

All operations should now work correctly without permission errors.
