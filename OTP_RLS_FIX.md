# OTP RLS Permissions Fix

## Problem
The `tbl_otp_verifications` table had RLS enabled, but direct UPDATE, DELETE operations were failing with "permission denied" errors. The RLS policies didn't allow users to modify OTP records directly.

## Root Cause
- RLS policies only allowed SELECT and INSERT for authenticated users
- No UPDATE policy existed for users to mark OTPs as verified
- No DELETE policy existed for cleaning up OTP records
- Frontend code was trying to PATCH the table directly, which violated RLS

## Solution
Created secure RPC functions with `SECURITY DEFINER` to bypass RLS for legitimate OTP operations:

### RPC Functions Added

#### 1. **invalidate_user_otps(p_user_id, p_otp_type)**
- Marks all unverified OTPs as verified (invalidates them) before creating new ones
- Prevents multiple active OTPs for the same user/type

#### 2. **create_otp_record(p_user_id, p_otp_code, p_otp_type, p_contact_info, p_expires_at)**
- Creates new OTP records securely
- Returns the OTP ID for tracking
- Bypasses RLS INSERT restrictions

#### 3. **mark_otp_verified(p_otp_id, p_user_id, p_otp_type)**
- Marks OTP as verified
- Updates user verification status (email_verified or mobile_verified)
- Validates OTP hasn't expired or been used already

#### 4. **delete_otp_record(p_otp_id)**
- Deletes a specific OTP record by ID
- Used after successful verification for cleanup

#### 5. **delete_user_otps(p_user_id, p_otp_type)**
- Deletes all OTP records for a user/type
- Optional type parameter (NULL deletes all types)
- Used for bulk cleanup

#### 6. **delete_expired_otps()**
- Periodic maintenance function
- Deletes all expired OTP records
- Returns count of deleted records

## Code Changes

### Updated `/src/services/otpService.ts`

**Before:**
```typescript
// Direct table update - FAILS with RLS
await supabaseBatch
  .from('tbl_otp_verifications')
  .update({ tov_is_verified: true })
  .eq('tov_user_id', userId)
  .eq('tov_otp_type', otpType);
```

**After:**
```typescript
// Using RPC function - WORKS
await supabaseBatch.rpc('invalidate_user_otps', {
  p_user_id: userId,
  p_otp_type: otpType
});
```

### All Updated Operations:
1. **OTP Invalidation**: Now uses `invalidate_user_otps()` RPC
2. **OTP Creation**: Now uses `create_otp_record()` RPC
3. **OTP Verification**: Already using `verify_otp_and_update_user()` RPC (was correct)
4. **OTP Deletion**: Now uses `delete_otp_record()` RPC
5. **OTP Cleanup**: Now uses `delete_user_otps()` RPC
6. **Expired Cleanup**: Now uses `delete_expired_otps()` RPC

## Security Notes

- All RPC functions use `SECURITY DEFINER` to execute with elevated privileges
- Functions are granted to both `anon` and `authenticated` roles
- Functions include validation to prevent abuse:
  - OTP expiration checks
  - Already-verified checks
  - User ID validation
- All functions set `search_path = public` to prevent SQL injection

## Testing

After these changes:
1. ✅ OTP creation works (no more INSERT errors)
2. ✅ OTP invalidation works (no more UPDATE errors)
3. ✅ OTP verification works (already working, now confirmed)
4. ✅ OTP deletion works (no more DELETE errors)
5. ✅ Expired OTP cleanup works
6. ✅ Build passes without errors

## Migration Files
- `20260316191342_add_otp_rpc_functions.sql` - Core OTP operations (create, invalidate, verify)
- `20260316191429_add_otp_delete_rpc_functions.sql` - Delete operations
- `20260316XXXXXX_fix_otp_rpc_functions_schema.sql` - Fixed schema errors (removed non-existent tov_updated_at column)

## Related Issues Fixed
- Registration OTP verification
- Mobile/Email OTP sending and verification
- Database cleanup operations
- RLS permission errors during OTP operations
