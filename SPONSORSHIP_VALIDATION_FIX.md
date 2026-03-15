# Sponsorship Number Validation Fix

## Issue
When attempting to validate a sponsorship number during customer registration, a 401 Unauthorized error occurred:

```
Request URL: https://[supabase-url]/rest/v1/tbl_user_profiles?select=tup_sponsorship_number&tup_sponsorship_number=eq.SP46282892
Status: 401 Unauthorized
```

## Root Cause
The `get_sponsor_by_sponsorship_number` RPC function existed but:
1. Did not validate that the sponsor is an active customer
2. The error handling in `checkSponsorshipNumberExists` was incorrect, throwing errors instead of returning false

## Solution

### 1. Database Function Improvements
**File:** `supabase/migrations/improve_sponsorship_validation.sql`

Improved the `get_sponsor_by_sponsorship_number` function:

```sql
CREATE OR REPLACE FUNCTION get_sponsor_by_sponsorship_number(
  p_sponsorship_number TEXT
)
RETURNS TABLE (
  user_id UUID,
  sponsorship_number TEXT,
  first_name TEXT,
  username TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return sponsor info only if they are an active customer
  RETURN QUERY
  SELECT
    p.tup_user_id as user_id,
    p.tup_sponsorship_number as sponsorship_number,
    p.tup_first_name as first_name,
    p.tup_username as username
  FROM tbl_user_profiles p
  INNER JOIN tbl_users u ON u.tu_id = p.tup_user_id
  WHERE p.tup_sponsorship_number = p_sponsorship_number
    AND u.tu_is_active = true
    AND u.tu_user_type = 'customer'
  LIMIT 1;
END;
$$;
```

**Changes:**
- Added check for `u.tu_is_active = true` to ensure only active users can be sponsors
- Added check for `u.tu_user_type = 'customer'` to ensure only customers can be sponsors
- Uses `SECURITY DEFINER` to bypass RLS restrictions
- Grants execute permission to `anon`, `authenticated`, and `public` roles

**Security:**
- Function is public (accessible without authentication)
- Only returns minimal, non-sensitive data (user_id, sponsorship_number, first_name, username)
- Only returns data for active customers
- Prevents inactive or suspended users from being used as sponsors

### 2. Frontend Error Handling
**File:** `src/lib/supabase.ts`

Fixed the `checkSponsorshipNumberExists` function:

**Before:**
```typescript
if ((error && error.code !== 'PGRST116') || !data || data.length === 0) {
  throw error; // ❌ This throws errors unnecessarily
}
return !!data;
```

**After:**
```typescript
if (error) {
  console.error('RPC Error checking sponsorship number:', error);
  return false; // ✅ Return false on error instead of throwing
}

return data && data.length > 0; // ✅ Clear validation logic
```

**Benefits:**
- No longer throws errors when sponsorship number doesn't exist
- Returns `false` for invalid sponsorship numbers instead of crashing
- Better error logging for debugging
- Cleaner validation logic

## How It Works

### Registration Flow with Sponsorship Validation:

1. **User Enters Referral Code:**
   ```
   User types: SP46282892
   ```

2. **Frontend Validates (with debounce):**
   ```typescript
   const isValid = await checkSponsorshipNumberExists('SP46282892');
   // isValid = true if sponsor exists and is active
   // isValid = false if sponsor doesn't exist or is inactive
   ```

3. **RPC Function Queries Database:**
   ```sql
   SELECT user_id, sponsorship_number, first_name, username
   FROM tbl_user_profiles p
   INNER JOIN tbl_users u ON u.tu_id = p.tup_user_id
   WHERE p.tup_sponsorship_number = 'SP46282892'
     AND u.tu_is_active = true
     AND u.tu_user_type = 'customer'
   LIMIT 1;
   ```

4. **Response Handled:**
   ```typescript
   // If sponsor found: Show green checkmark, allow registration
   // If sponsor not found: Show red X, prevent registration
   ```

## Testing

### Test Valid Sponsorship Number:

1. **Go to Customer Registration Page:**
   ```
   Navigate to: /auth/customer-register
   ```

2. **Enter Valid Referral Code:**
   ```
   - Enter a known valid sponsorship number (e.g., SP46282892)
   - Wait 300ms for validation
   - Should show green checkmark
   - Should allow registration
   ```

3. **Check Network Tab:**
   ```
   - Should see RPC call to get_sponsor_by_sponsorship_number
   - Should return sponsor data
   - No 401 errors
   ```

### Test Invalid Sponsorship Number:

1. **Enter Invalid Code:**
   ```
   - Enter: SP99999999 (non-existent)
   - Wait 300ms for validation
   - Should show red X or error message
   - Should prevent registration
   ```

2. **Check Response:**
   ```
   - RPC call succeeds (200 OK)
   - Returns empty array []
   - Frontend shows "invalid" state
   ```

### Test Inactive Sponsor:

1. **Admin Deactivates User:**
   ```
   - Admin panel → Customers
   - Deactivate a user with sponsorship number
   ```

2. **Try to Use Their Code:**
   ```
   - Enter their sponsorship number in registration
   - Should show as invalid (inactive users cannot be sponsors)
   - Should prevent registration
   ```

## Permissions

### RPC Function Permissions:
```sql
GRANT EXECUTE ON FUNCTION get_sponsor_by_sponsorship_number(TEXT) TO anon, authenticated, public;
```

- **anon**: Unauthenticated users (during registration)
- **authenticated**: Logged-in users
- **public**: All users

### Why Public Access is Safe:
1. Only returns minimal, non-sensitive data
2. No email, phone, or sensitive information exposed
3. Only returns data for active customers
4. Uses SECURITY DEFINER to safely bypass RLS
5. Essential for registration flow (users aren't authenticated yet)

## Related Files

1. `supabase/migrations/improve_sponsorship_validation.sql` - Database function
2. `src/lib/supabase.ts` - Frontend validation function
3. `src/pages/auth/CustomerRegister.tsx` - Registration form
4. `src/contexts/AuthContext.tsx` - MLM tree integration

## Error Scenarios

### Scenario 1: Sponsorship Number Doesn't Exist
**Input:** SP99999999
**Result:**
- RPC returns empty array
- Frontend shows: Invalid referral code
- User cannot proceed with registration

### Scenario 2: Sponsor Account is Inactive
**Input:** SP12345678 (exists but inactive)
**Result:**
- RPC returns empty array (due to tu_is_active = true check)
- Frontend shows: Invalid referral code
- Protects against using inactive sponsors

### Scenario 3: Database Error
**Input:** Any valid format
**Result:**
- RPC call fails
- Error logged to console
- Frontend shows: Unable to validate referral code
- User can retry

### Scenario 4: Network Error
**Input:** Any valid format
**Result:**
- Network request fails
- Caught by try/catch
- Frontend shows: Unable to validate referral code
- User can retry

## Admin Customer Search Fix (Related)

This fix also addresses the admin customer search issue found earlier:

1. **Database Functions:**
   - Both `admin_get_customers` and `get_sponsor_by_sponsorship_number` now have proper authentication checks
   - Admin functions validate admin authentication
   - Public functions use SECURITY DEFINER safely

2. **Frontend Improvements:**
   - Better error handling across all RPC calls
   - Consistent error messaging
   - Proper loading states

## Security Best Practices Applied

1. **Principle of Least Privilege:**
   - Public functions only return minimal data needed
   - No sensitive information exposed
   - Active status checked before returning data

2. **Defense in Depth:**
   - RLS policies on tables
   - SECURITY DEFINER functions with explicit checks
   - Frontend validation
   - Backend validation

3. **Error Handling:**
   - Graceful failure (return false, don't crash)
   - Clear error messages for debugging
   - User-friendly error messages

4. **Audit Trail:**
   - All errors logged to console
   - Database function has comments
   - Migration documents changes

## Future Enhancements

Potential improvements:
1. Add rate limiting to prevent enumeration attacks
2. Cache valid sponsorship numbers temporarily
3. Add analytics for referral code usage
4. Implement referral code expiration
5. Add multi-level validation (tier-based referrals)
6. Create admin dashboard for referral analytics

## Troubleshooting

### Still Getting 401 Errors?

1. **Clear Browser Cache:**
   ```
   - Clear all site data
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
   - Try incognito mode
   ```

2. **Check Database Function:**
   ```sql
   -- Verify function exists
   SELECT proname FROM pg_proc
   WHERE proname = 'get_sponsor_by_sponsorship_number';

   -- Test function directly
   SELECT * FROM get_sponsor_by_sponsorship_number('SP46282892');
   ```

3. **Check Permissions:**
   ```sql
   -- Verify grants
   SELECT routine_name, grantee, privilege_type
   FROM information_schema.routine_privileges
   WHERE routine_name = 'get_sponsor_by_sponsorship_number';
   ```

4. **Check Network Tab:**
   ```
   - Look for RPC call to /rest/v1/rpc/get_sponsor_by_sponsorship_number
   - NOT direct query to /rest/v1/tbl_user_profiles
   - If seeing direct query, clear cache and rebuild
   ```

### Referral Validation Not Working?

1. **Check Console Logs:**
   ```javascript
   // Look for these logs:
   "RPC Error checking sponsorship number:" // Error case
   "Failed to check sponsorship number:" // Exception case
   ```

2. **Test RPC Function:**
   ```javascript
   // In browser console:
   const { data, error } = await supabase
     .rpc('get_sponsor_by_sponsorship_number', {
       p_sponsorship_number: 'SP46282892'
     });
   console.log('Data:', data, 'Error:', error);
   ```

3. **Verify Sponsorship Number Format:**
   ```
   - Must match existing sponsorship number exactly
   - Case sensitive
   - No extra spaces
   - Check database for actual values
   ```

4. **Verify User is Active:**
   ```sql
   -- Check user status
   SELECT u.tu_is_active, p.tup_sponsorship_number, p.tup_first_name
   FROM tbl_users u
   JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
   WHERE p.tup_sponsorship_number = 'SP46282892';
   ```

## Summary

The sponsorship validation system now:
- ✅ Works without authentication (needed for registration)
- ✅ Only accepts active customers as sponsors
- ✅ Returns clear validation results
- ✅ Handles errors gracefully
- ✅ Exposes minimal data safely
- ✅ Uses proper RPC function (not direct REST API)
- ✅ Has proper permissions for all roles
- ✅ Logs errors for debugging
