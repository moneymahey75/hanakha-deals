# OTP Mismatch Fix

## Problem

OTP verification was failing because the OTP received by users was different from the OTP stored in the database.

## Root Cause

The system was generating **TWO different OTP codes**:

1. **Frontend** (`src/services/otpService.ts`):
   - Generated an OTP code
   - Saved it to the database via `create_otp_record` RPC
   - Sent this OTP to the edge function

2. **Edge Function** (`supabase/functions/send-otp/index.ts`):
   - Received request from frontend
   - **Generated a NEW OTP code** (different from database)
   - Sent this NEW code via email/SMS

Result: User received one OTP, but database had a different OTP.

## Solution

Modified the edge function to accept the OTP code as a parameter instead of generating its own:

### Edge Function Changes (`send-otp/index.ts`)

**Before:**
```typescript
const { user_id, contact_info, otp_type } = body;
const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
```

**After:**
```typescript
const { user_id, contact_info, otp_type, otp_code } = body;

// Validate OTP format
if (!/^\d{6}$/.test(otp_code)) {
  return error response
}
```

### Frontend Changes (`src/services/otpService.ts`)

Updated both `sendEmailOTP()` and `sendMobileOTP()` to pass the OTP code:

**Before:**
```typescript
body: JSON.stringify({
  user_id: userId,
  contact_info: email,
  otp_type: 'email'
})
```

**After:**
```typescript
body: JSON.stringify({
  user_id: userId,
  contact_info: email,
  otp_type: 'email',
  otp_code: otp  // Pass the OTP from frontend
})
```

## Flow After Fix

1. **Frontend generates OTP** → Saves to database
2. **Frontend calls edge function** → Passes the SAME OTP
3. **Edge function sends OTP** → Sends the SAME OTP via email/SMS
4. **User receives OTP** → Matches database OTP
5. **User enters OTP** → Verification succeeds

## Testing

To verify the fix:

1. Register a new user
2. Request email/mobile OTP
3. Check console logs for OTP code
4. Verify the OTP code received matches the one in logs
5. Enter the OTP code
6. Verification should succeed

## Technical Details

- Edge function now validates OTP format (6 digits)
- Edge function is deployed and active
- Frontend correctly passes OTP in both email and mobile flows
- Database stores the correct OTP via `create_otp_record` RPC
