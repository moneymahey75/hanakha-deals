# RPC Security Strategy - Hybrid Approach

## Overview

This document explains our **hybrid security approach** that balances security with simplicity by using:
- **Secure RPC functions** for complex multi-table operations
- **Simplified RLS policies** for basic ownership checks
- **SECURITY DEFINER** functions that bypass RLS with built-in auth checks

## Why This Approach?

### Problems with Pure RLS:
1. ❌ Complex recursive queries (admin checks calling admin checks)
2. ❌ Performance issues with multiple table joins
3. ❌ Hard to debug authorization failures
4. ❌ Difficult to maintain as app grows
5. ❌ Can cause infinite recursion errors

### Benefits of Hybrid RPC + RLS:
1. ✅ Clear, testable security logic in one place
2. ✅ Better performance (single function call vs multiple RLS checks)
3. ✅ Easier to debug (check function code directly)
4. ✅ Simpler RLS policies (just ownership checks)
5. ✅ Full control over what data is exposed

## Available RPC Functions

### User Data Functions

#### `get_user_data(p_user_id)`
Get complete user profile with subscription info.

```typescript
// Usage in frontend
const { data, error } = await supabase
  .rpc('get_user_data', { p_user_id: userId });

console.log(data);
// Returns: { user_id, email, first_name, last_name, username,
//           has_active_subscription, subscription_plan_name, ... }
```

**Security**: User can view own data, admins can view any user.

#### `get_user_dashboard_data()`
Get all dashboard data in one call.

```typescript
const { data, error } = await supabase
  .rpc('get_user_dashboard_data');

console.log(data);
// Returns: { user: {...}, wallet_balance: 1000, total_referrals: 5,
//           pending_tasks: 3, completed_tasks_today: 2 }
```

**Security**: Only returns data for authenticated user.

#### `update_user_profile(p_first_name, p_last_name, p_mobile)`
Update user profile fields.

```typescript
const { data, error } = await supabase
  .rpc('update_user_profile', {
    p_first_name: 'John',
    p_last_name: 'Doe',
    p_mobile: '+1234567890'
  });
```

**Security**: Can only update own profile.

### MLM Functions

#### `get_user_network(p_user_id)`
Get complete MLM network tree.

```typescript
const { data, error } = await supabase
  .rpc('get_user_network', { p_user_id: userId });

console.log(data);
// Returns: [{ user_id, username, first_name, level,
//            sponsorship_number, joined_date }, ...]
```

**Security**: User can view own network, admins can view any network.

#### `get_referral_stats(p_user_id)`
Get referral statistics and earnings.

```typescript
const { data, error } = await supabase
  .rpc('get_referral_stats', { p_user_id: userId });

console.log(data);
// Returns: { direct_referrals: 10, total_earnings: 5000,
//           this_month_earnings: 500 }
```

**Security**: User can view own stats, admins can view any stats.

### Transaction Functions

#### `get_user_transactions(p_limit, p_offset)`
Get wallet transactions with pagination.

```typescript
const { data, error } = await supabase
  .rpc('get_user_transactions', {
    p_limit: 50,
    p_offset: 0
  });

console.log(data);
// Returns: [{ transaction_id, wallet_type, transaction_type,
//            amount, balance_after, description, created_at }, ...]
```

**Security**: Only returns own transactions.

#### `get_user_wallet_summary()`
Get wallet balances and summary.

```typescript
const { data, error } = await supabase
  .rpc('get_user_wallet_summary');

console.log(data);
// Returns: { wallets: [{type, balance, is_active}, ...],
//           total_balance: 5000, total_deposits: 10000,
//           total_withdrawals: 5000 }
```

**Security**: Only returns own wallet data.

## Migration Strategy

### Step 1: Replace Complex Queries with RPC Calls

**Before (complex RLS query):**
```typescript
const { data: userData } = await supabase
  .from('tbl_users')
  .select(`
    *,
    tbl_user_profiles(*),
    tbl_user_subscriptions!inner(
      tus_status,
      tus_end_date
    )
  `)
  .eq('tu_id', userId)
  .single();
```

**After (simple RPC call):**
```typescript
const { data: userData } = await supabase
  .rpc('get_user_data', { p_user_id: userId });
```

### Step 2: Update Frontend Code

Replace all complex multi-table queries with RPC function calls:

1. **Dashboard**: Use `get_user_dashboard_data()`
2. **Profile**: Use `get_user_data()` and `update_user_profile()`
3. **Network**: Use `get_user_network()` and `get_referral_stats()`
4. **Wallet**: Use `get_user_wallet_summary()` and `get_user_transactions()`

### Step 3: Simplify RLS Policies

Keep RLS as a safety net with simple rules:
- Users can read/write own data: `auth.uid() = user_id_column`
- Admins have full access: `is_super_admin() OR is_sub_admin()`
- Service role bypasses everything

## Security Principles

### 1. Authentication Check
Every function starts with:
```sql
v_user_id := auth.uid();
IF v_user_id IS NULL THEN
  RETURN NULL; -- or RAISE EXCEPTION
END IF;
```

### 2. Authorization Check
Check if user can access requested data:
```sql
IF v_target_user_id != auth.uid() AND NOT is_super_admin() THEN
  RETURN NULL; -- Unauthorized
END IF;
```

### 3. SECURITY DEFINER
Functions use `SECURITY DEFINER` to bypass RLS:
```sql
CREATE FUNCTION my_function()
RETURNS JSON
SECURITY DEFINER  -- Runs with function owner's permissions
SET search_path = public  -- Security best practice
LANGUAGE plpgsql
```

### 4. Input Validation
Always validate and sanitize inputs:
```sql
IF p_limit < 1 OR p_limit > 1000 THEN
  p_limit := 50; -- Default safe value
END IF;
```

## Example: Updating AuthContext

Replace the `fetchUserData` function to use RPC:

```typescript
// OLD: Complex query with RLS issues
const fetchUserData = async (userId: string) => {
  const { data: combinedData, error } = await supabase
    .from('tbl_users')
    .select(`
      *,
      tbl_user_profiles(*),
      tbl_user_subscriptions!inner(...)
    `)
    .eq('tu_id', userId)
    .maybeSingle();

  // ... complex data extraction ...
};

// NEW: Simple RPC call
const fetchUserData = async (userId: string) => {
  const { data, error } = await supabase
    .rpc('get_user_data', { p_user_id: userId });

  if (error) {
    console.error('Error fetching user data:', error);
    return;
  }

  // Data is already formatted correctly
  setUser({
    id: data.user_id,
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    userType: data.user_type,
    sponsorshipNumber: data.sponsorship_number,
    parentId: data.parent_account,
    isVerified: data.is_verified,
    hasActiveSubscription: data.has_active_subscription,
    mobileVerified: data.mobile_verified
  });
};
```

## Adding New RPC Functions

When you need a new data operation:

### 1. Create the Function
```sql
CREATE FUNCTION my_new_function(p_param text)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
  v_result json;
BEGIN
  -- 1. Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Authorization check
  -- Add your business logic here

  -- 3. Query data
  SELECT json_build_object(...)
  INTO v_result
  FROM ...
  WHERE ...;

  RETURN v_result;
END;
$$;
```

### 2. Grant Permissions
```sql
GRANT EXECUTE ON FUNCTION my_new_function(text) TO authenticated;
```

### 3. Use in Frontend
```typescript
const { data, error } = await supabase
  .rpc('my_new_function', { p_param: 'value' });
```

## Testing RPC Functions

### Test Authentication
```sql
-- Should return NULL (not authenticated)
SELECT get_user_dashboard_data();
```

### Test Authorization
```sql
-- As user A, try to access user B's data
-- Should return NULL
SELECT get_user_data('user-b-id');
```

### Test Data Integrity
```sql
-- Verify returned data structure
SELECT get_user_data('my-user-id');
-- Should return valid JSON with expected fields
```

## Best Practices

1. ✅ **Always check auth.uid()** at function start
2. ✅ **Return NULL or raise exception** for unauthorized access
3. ✅ **Use SECURITY DEFINER** to bypass RLS
4. ✅ **Set search_path = public** for security
5. ✅ **Grant specific permissions** (not blanket access)
6. ✅ **Return JSON** for complex data structures
7. ✅ **Validate all inputs** before use
8. ✅ **Add comments** explaining security logic
9. ✅ **Test thoroughly** with different user roles
10. ✅ **Keep RLS as backup** for direct table access

## What NOT to Do

1. ❌ Don't bypass auth checks
2. ❌ Don't trust client-provided user IDs without verification
3. ❌ Don't return sensitive data without authorization
4. ❌ Don't create functions with SQL injection vulnerabilities
5. ❌ Don't forget to grant execute permissions
6. ❌ Don't use SECURITY INVOKER (defeats the purpose)
7. ❌ Don't skip input validation
8. ❌ Don't remove RLS entirely (keep as safety net)

## Conclusion

This hybrid approach gives you:
- **Better performance** (fewer RLS checks)
- **Easier debugging** (clear function code)
- **Simpler maintenance** (centralized logic)
- **Strong security** (explicit checks)
- **Flexibility** (easy to add new operations)

Your RLS policies become simpler safety nets, while RPC functions handle complex operations securely.
