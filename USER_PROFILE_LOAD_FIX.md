# User Profile Data Loading Fix

## Problem

After user login, the application wasn't reliably loading user profile data (`tbl_user_profiles`) which contains essential information like first name, last name, and sponsorship number. This was causing the user object to have empty or undefined values for these fields.

## Root Cause

The `fetchUserData` function in `AuthContext.tsx` was using an `!inner` join with `tbl_user_subscriptions`, which meant:

1. **Query failed if no active subscription**: The combined query required an active subscription to return ANY data
2. **Fallback query was incomplete**: When the main query failed, the fallback only fetched `tbl_users` data without the profile
3. **Race condition**: Profile data fetch happened in a separate query that might fail silently

## The Fix

### Changed Query Strategy

**Before:**
```typescript
const { data: combinedData } = await supabase
  .from('tbl_users')
  .select(`
    *,
    tbl_user_profiles(*),
    tbl_user_subscriptions!inner(  // ❌ This requires subscription to exist
      tus_status,
      tus_end_date
    )
  `)
  .eq('tu_id', userId)
  .eq('tbl_user_subscriptions.tus_status', 'active')
  .gte('tbl_user_subscriptions.tus_end_date', new Date().toISOString())
  .maybeSingle();
```

**After:**
```typescript
// Step 1: Always fetch user and profile (critical data)
const { data: userWithProfile } = await supabase
  .from('tbl_users')
  .select(`
    *,
    tbl_user_profiles(*)  // ✅ No inner join - always returns data
  `)
  .eq('tu_id', userId)
  .maybeSingle();

// Step 2: Separately check for subscription (optional data)
const { data: subscriptionDataArray } = await supabase
  .from('tbl_user_subscriptions')
  .select('*')
  .eq('tus_user_id', userId)
  .eq('tus_status', 'active')
  .gte('tus_end_date', new Date().toISOString());
```

### Improved Error Handling

Added validation to ensure user data was loaded:

```typescript
// Ensure we have at least minimal user data
if (!userData && !profileData) {
  console.error('❌ No user or profile data found for userId:', userId);
  throw new Error('User data not found');
}
```

### Better Default Values

Changed to use empty strings instead of undefined:

```typescript
const user: User = {
  id: userId,
  email: session?.user?.email || userData?.tu_email || 'unknown@example.com',
  firstName: profileData?.tup_first_name || '',  // ✅ Default to empty string
  lastName: profileData?.tup_last_name || '',    // ✅ Default to empty string
  userType: userData?.tu_user_type || 'customer',
  sponsorshipNumber: profileData?.tup_sponsorship_number || '',  // ✅ Default to empty string
  parentId: profileData?.tup_parent_account,
  isVerified: userData?.tu_is_verified || false,
  hasActiveSubscription: !!subscriptionData,
  mobileVerified: userData?.tu_mobile_verified || false
};
```

### Enhanced Logging

Added detailed logging to track data loading:

```typescript
console.log('✅ User and profile data loaded:', {
  hasUser: !!userData,
  hasProfile: !!profileData,
  firstName: profileData?.tup_first_name,
  lastName: profileData?.tup_last_name
});

console.log('✅ User data compiled:', {
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  userType: user.userType,
  hasProfile: !!profileData,
  hasActiveSubscription: !!subscriptionData
});
```

## Data Flow

1. **User logs in** → Supabase Auth creates session
2. **AuthContext calls `fetchUserData`**
   - Fetches `tbl_users` + `tbl_user_profiles` (always succeeds if user exists)
   - Separately checks for active subscription (optional)
3. **User object is created** with all available data
4. **Session is marked as 'customer'** type
5. **User state is set** → Components can now access profile data

## What This Fixes

- User's first name and last name now always load after login
- Sponsorship number is available immediately
- Login works even if user has no active subscription
- Profile data is guaranteed to load before user object is created
- Better error messages if profile is genuinely missing

## Files Modified

- `src/contexts/AuthContext.tsx` - Fixed `fetchUserData` function

## Testing Checklist

- [x] User can log in with email
- [x] User can log in with username
- [x] Profile data (first name, last name) loads correctly
- [x] Sponsorship number is available in user object
- [x] Login works for users without active subscription
- [x] Login works for users with active subscription
- [x] Console shows detailed loading logs
- [x] Build completes successfully

## Database Structure Reference

```
auth.users (Supabase Auth)
  └─ id (UUID)
      ↓
tbl_users
  └─ tu_id (UUID) = auth.users.id
      ↓
tbl_user_profiles
  └─ tup_user_id (UUID) = tbl_users.tu_id
      ├─ tup_first_name
      ├─ tup_last_name
      └─ tup_sponsorship_number
```

## RLS Policies

The fix works because these RLS policies allow authenticated users to read their own data:

- **tbl_users**: `user_select_own` - allows `SELECT` where `auth.uid() = tu_id`
- **tbl_user_profiles**: `user_select_own` - allows `SELECT` where `auth.uid() = tup_user_id`

## Why Not Add Profile to Auth Response?

Supabase Auth responses are standardized and only contain data from `auth.users` table. Custom user data must be fetched separately from application tables. This is the recommended approach for all Supabase applications and provides:

1. **Security**: Profile data stays behind RLS policies
2. **Flexibility**: Easy to modify profile schema without affecting auth
3. **Performance**: Auth tokens stay small
4. **Best Practice**: Separation of concerns between auth and user data
