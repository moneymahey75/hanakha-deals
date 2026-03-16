# Login Debugging Guide

## Test Credentials

Use any of these test accounts to log in:

### Test Account 1
- **Username**: `krishan_mlm`
- **Email**: `krishan_mlm@yopmail.com`
- **User ID**: `62553c65-6ecc-4044-8dd2-1c45faa8a817`

### Test Account 2
- **Username**: `aditya_mlm`
- **Email**: `aditya_mlm@yopmail.com`
- **User ID**: `7a12a9d1-3212-44a2-8dac-ec5a4231e858`

### Test Account 3
- **Username**: `amanveer_mlm`
- **Email**: `amanveer_mlm@yopmail.com`
- **User ID**: `f42db1ce-199d-4dbf-87ab-9d9247ad4718`

## Login Flow

1. **Navigate** to `/customer/login`
2. **Enter** email or username
3. **Enter** password
4. **Click** "I'm not a robot" button
5. **Click** "Sign In"

## Common Issues & Solutions

### Issue 1: "Please complete the reCAPTCHA verification"
**Solution**: Click the "I'm not a robot" button before submitting

### Issue 2: "Username not found"
**Solution**:
- Make sure the username exists in the database
- Try using email instead of username
- Check that `get_email_by_username` RPC function is working

### Issue 3: "Invalid login credentials" from Supabase
**Solution**:
- Password is incorrect or user doesn't exist in auth.users
- Check if user exists in both `auth.users` AND `tbl_users`
- Verify the password is correct

### Issue 4: Login button disabled
**Solution**:
- Make sure both email/username AND password fields are filled
- Make sure reCAPTCHA is completed (shows "Verified")

### Issue 5: Redirects to wrong page after login
**Solution**: Check the login navigation logic in `CustomerLogin.tsx:38-53`

## Debugging Steps

### Step 1: Check Browser Console
Open browser console (F12) and look for:
- 🔍 Login attempt logs
- ❌ Error messages
- ✅ Success messages

### Step 2: Verify User Exists
Run this SQL in Supabase:
```sql
SELECT
    au.id,
    au.email,
    au.encrypted_password IS NOT NULL as has_password,
    u.tu_email,
    u.tu_user_type,
    u.tu_is_verified,
    up.tup_username
FROM auth.users au
LEFT JOIN tbl_users u ON u.tu_id = au.id
LEFT JOIN tbl_user_profiles up ON up.tup_user_id = u.tu_id
WHERE au.email = 'krishan_mlm@yopmail.com';
```

### Step 3: Test RPC Function
Run this SQL:
```sql
SELECT * FROM get_email_by_username('krishan_mlm');
```
Expected result: Should return email `krishan_mlm@yopmail.com`

### Step 4: Check Session Storage
After login attempt, check browser's Session Storage:
- Should have `supabase.auth.token`
- Should have `session_type` = 'customer'

### Step 5: Test Auth Directly
In browser console, test Supabase auth:
```javascript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'krishan_mlm@yopmail.com',
  password: 'YOUR_PASSWORD'
});
console.log('Auth result:', data, error);
```

## Expected Login Flow

1. ✅ User enters email/username and password
2. ✅ User completes reCAPTCHA
3. ✅ Login button becomes enabled
4. ✅ User clicks "Sign In"
5. ✅ If username provided, RPC `get_email_by_username` is called
6. ✅ Supabase `signInWithPassword` is called with email
7. ✅ Session is saved to sessionStorage
8. ✅ User data is fetched from database
9. ✅ User is redirected to dashboard
10. ✅ Success notification shows "Login Successful!"

## What to Check If Login Fails

### Frontend Issues
- [ ] ReCaptcha completed?
- [ ] Form fields filled?
- [ ] Network request sent?
- [ ] Error message displayed?

### Backend Issues
- [ ] User exists in auth.users?
- [ ] User exists in tbl_users?
- [ ] RPC function returns email?
- [ ] Password is correct?
- [ ] RLS policies allow access?

### Session Issues
- [ ] Session saved to sessionStorage?
- [ ] Session type set to 'customer'?
- [ ] User data fetched successfully?
- [ ] Auth state change triggered?

## Manual Password Reset

If you don't know the password for test accounts, reset it:

```sql
-- This WON'T work directly - Supabase passwords are hashed
-- Instead, use Supabase Dashboard:
-- 1. Go to Authentication > Users
-- 2. Find the user
-- 3. Click "..." menu
-- 4. Select "Reset Password"
-- 5. Copy the reset link
-- 6. Open link and set new password
```

Or use the "Forgot Password" link on the login page.

## Known Working Configuration

- ✅ RPC function `get_email_by_username` exists and works
- ✅ Users exist in both auth.users and tbl_users
- ✅ RLS policies configured correctly
- ✅ Session management working
- ✅ Username lookup working
- ✅ Email lookup working

## Next Steps

If login still doesn't work, please provide:
1. The exact error message you see
2. Browser console logs
3. Which test account you're trying
4. Whether you're using email or username
5. Any network errors in browser DevTools

This will help identify the specific issue!
