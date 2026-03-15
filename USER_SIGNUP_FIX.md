# User Signup Database Error Fix

## Issue
When attempting to sign up a new user, the registration failed with:

```
Request URL: https://[supabase-url]/auth/v1/signup
Status: 500 Internal Server Error
Response: {"code":"unexpected_failure","message":"Database error saving new user"}
```

**Payload:**
```json
{
  "email": "aarti_mlm@yopmail.com",
  "password": "123123123",
  "data": {},
  "gotrue_meta_security": {},
  "code_challenge": "3KllnrJcygQHGR9HqZ9GvzzOaQ9K1w_-fLeabwS6ecw",
  "code_challenge_method": "s256"
}
```

## Root Cause

The error occurred due to a database trigger execution failure during user signup:

1. **Trigger Chain:**
   - When a new user signs up, Supabase Auth creates a record in `auth.users`
   - This triggers `trigger_sync_auth_user` which executes `sync_auth_user_to_tbl_users()`
   - That function inserts a record into `tbl_users`
   - This triggers `trigger_create_user_wallet` which executes `create_user_wallet()`
   - The wallet function tries to insert into `tbl_wallets`

2. **The Problem:**
   - `tbl_wallets` has RLS enabled with this INSERT policy:
     ```sql
     CREATE POLICY "user_insert_own"
       ON tbl_wallets FOR INSERT
       TO anon, authenticated
       WITH CHECK (auth.uid() = tw_user_id);
     ```
   - During signup, when the trigger executes, `auth.uid()` is not yet available
   - The RLS policy blocks the insert, causing the entire signup to fail

3. **Why auth.uid() Was Not Available:**
   - The trigger runs DURING the auth.users INSERT operation
   - At this point, the user session hasn't been established
   - `auth.uid()` returns NULL, failing the RLS check

## Solution

Updated the `create_user_wallet()` function to use `SECURITY DEFINER`, which allows it to bypass RLS restrictions:

**File:** `supabase/migrations/fix_user_wallet_creation_trigger.sql`

```sql
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER              -- ✅ Bypasses RLS
SET search_path = public      -- ✅ Security best practice
AS $$
BEGIN
  -- Insert wallet for the new user
  INSERT INTO tbl_wallets (tw_user_id, tw_balance, tw_currency)
  VALUES (NEW.tu_id, 0.00000000, 'USDT');

  RETURN NEW;
END;
$$;
```

### Why This Is Safe

1. **Limited Scope:**
   - Function only runs during user creation (AFTER INSERT trigger)
   - Only inserts ONE wallet for the NEW user (NEW.tu_id)
   - Cannot be called directly by users (it's a trigger function)

2. **Proper Context:**
   - `NEW.tu_id` comes from the just-inserted tbl_users record
   - The user ID is guaranteed to be valid and belong to the new user
   - No user-supplied data is used directly

3. **Security Best Practices:**
   - Uses `SET search_path = public` to prevent schema injection
   - Function is only called by database trigger, not by external code
   - Limited to single wallet creation with hardcoded defaults

4. **Alternative Considered:**
   - Could modify RLS policy to allow service_role to insert
   - But SECURITY DEFINER is more explicit and controlled
   - This approach is standard for trigger functions that need to bypass RLS

## Trigger Execution Flow

### Successful Signup Flow (After Fix):

```
1. User submits signup form
   ↓
2. Supabase Auth creates record in auth.users
   ↓
3. trigger_sync_auth_user fires
   ↓
4. sync_auth_user_to_tbl_users() executes (SECURITY DEFINER)
   - Inserts into tbl_users
   ↓
5. trigger_create_user_wallet fires
   ↓
6. create_user_wallet() executes (SECURITY DEFINER) ✅
   - Bypasses RLS
   - Inserts into tbl_wallets
   - Returns successfully
   ↓
7. User record fully created
   ↓
8. Auth returns success with user session
```

### Previous Failed Flow (Before Fix):

```
1-5. [Same as above]
   ↓
6. create_user_wallet() executes (NO SECURITY DEFINER) ❌
   - Tries to insert into tbl_wallets
   - RLS policy checks auth.uid() = tw_user_id
   - auth.uid() is NULL (user not logged in yet)
   - RLS blocks the insert
   - Function returns error
   ↓
7. Trigger fails
   ↓
8. auth.users INSERT is rolled back
   ↓
9. Signup returns 500 error
```

## Testing

### Test New User Signup:

1. **Go to Customer Registration:**
   ```
   - Navigate to /auth/customer-register
   - Fill in all required fields
   - Submit the form
   ```

2. **Expected Behavior:**
   ```
   - User should be created successfully
   - No 500 errors
   - User should be logged in automatically
   - Wallet should be created automatically
   ```

3. **Verify in Database:**
   ```sql
   -- Check user was created
   SELECT * FROM auth.users WHERE email = 'test@example.com';

   -- Check tbl_users record
   SELECT * FROM tbl_users WHERE tu_email = 'test@example.com';

   -- Check wallet was created
   SELECT w.*
   FROM tbl_wallets w
   JOIN tbl_users u ON u.tu_id = w.tw_user_id
   WHERE u.tu_email = 'test@example.com';

   -- Should show:
   -- - tw_balance: 0.00000000
   -- - tw_currency: USDT
   ```

### Test Edge Cases:

1. **Duplicate Email:**
   ```
   - Try to register with existing email
   - Should fail with proper error message
   - Should NOT create partial records
   ```

2. **Invalid Email:**
   ```
   - Try to register with invalid email
   - Should fail validation
   - Should NOT reach database
   ```

3. **Weak Password:**
   ```
   - Try to register with weak password
   - Should fail validation
   - Should NOT reach database
   ```

## Related Triggers and Functions

### Complete Trigger Chain:

```
auth.users (INSERT)
  → trigger_sync_auth_user
    → sync_auth_user_to_tbl_users() [SECURITY DEFINER]
      → tbl_users (INSERT)
        → trigger_create_user_wallet
          → create_user_wallet() [SECURITY DEFINER] ✅ Fixed
            → tbl_wallets (INSERT)
```

### All Relevant Functions:

1. **sync_auth_user_to_tbl_users():**
   - Already has SECURITY DEFINER
   - Syncs auth.users to tbl_users
   - Sets default user_type to 'customer'

2. **create_user_wallet():**
   - Now has SECURITY DEFINER ✅
   - Creates default wallet for new users
   - Sets balance to 0 USDT

## RLS Policies

### tbl_users Policies:
- `user_insert_own`: Allows users to insert their own record (auth.uid() = tu_id)
- `user_select_own`: Allows users to view their own record
- `user_update_own`: Allows users to update their own record
- `service_role_full_access`: Service role can do anything

### tbl_wallets Policies:
- `user_insert_own`: Allows users to insert their own wallet (auth.uid() = tw_user_id)
- `user_select_own`: Allows users to view their own wallet
- `service_role_full_access`: Service role can do anything

**Note:** The `create_user_wallet()` function bypasses these policies using SECURITY DEFINER.

## Other Functions Using SECURITY DEFINER

These functions also use SECURITY DEFINER for similar reasons:

1. **sync_auth_user_to_tbl_users()** - Syncs auth records to app tables
2. **get_sponsor_by_sponsorship_number()** - Allows anonymous users to validate sponsors
3. **check_username_exists()** - Allows anonymous users to check username availability
4. **admin_*() functions** - Various admin functions that need elevated privileges

All these functions are carefully designed to:
- Limit scope to specific operations
- Validate inputs
- Only expose minimal, non-sensitive data
- Follow security best practices

## Summary

The user signup error has been resolved by:

- ✅ Adding SECURITY DEFINER to create_user_wallet() function
- ✅ Allowing wallet creation during signup trigger
- ✅ Following security best practices (SET search_path)
- ✅ Maintaining proper RLS policies for normal operations
- ✅ Ensuring complete user creation process works smoothly

### Key Takeaways:

1. **Trigger Functions Need Special Handling:**
   - Triggers run in database context, not user context
   - auth.uid() may not be available during trigger execution
   - SECURITY DEFINER is often necessary for trigger functions

2. **RLS and Triggers Can Conflict:**
   - RLS policies apply to trigger functions unless SECURITY DEFINER is used
   - This can cause unexpected failures during automated operations
   - Always test complete workflows including triggers

3. **Security Considerations:**
   - SECURITY DEFINER is safe when:
     - Function scope is limited
     - Input is validated or comes from trusted source
     - Function cannot be called directly by users
   - Always use SET search_path = public with SECURITY DEFINER

## Files Changed

1. `supabase/migrations/fix_user_wallet_creation_trigger.sql` - Migration fixing the trigger function
2. `USER_SIGNUP_FIX.md` - This documentation

## Related Documentation

- `SPONSORSHIP_VALIDATION_FIX.md` - Related RLS and RPC function fixes
- `SECURITY_FIXES.md` - General security improvements
- `OTP_FIX_SUMMARY.md` - OTP verification fixes
