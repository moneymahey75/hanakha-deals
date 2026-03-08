# Twilio SMS OTP Troubleshooting Guide

## Problem
You're getting a success response when sending OTP, but the SMS is not actually being delivered to the mobile number.

## Root Cause
The edge function was returning `success: true` even when Twilio credentials were missing or the SMS failed to send. This has now been fixed.

---

## What Changed

### Before (Old Behavior)
- If Twilio credentials were missing, the function would **simulate** the SMS send and return success
- Even if SMS sending failed, it would still return success
- No diagnostic information was provided

### After (New Behavior)
- If Twilio credentials are missing, the function returns `success: false` with error details
- If SMS sending fails, it returns the actual Twilio error message
- Comprehensive logging to help diagnose issues
- Detailed error responses that tell you exactly what went wrong

---

## How to Diagnose the Issue

### Step 1: Check if Twilio Secrets Are Properly Set

The edge function now logs which Twilio environment variables are set. After deploying, try sending an OTP again and check the response.

**Expected Response Scenarios:**

#### Scenario A: Twilio Not Configured
```json
{
  "success": false,
  "message": "Failed to send OTP: Twilio not configured. Missing: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER",
  "error_details": {
    "provider_error": "Twilio not configured. Missing: ...",
    "contact_info": "+919041777175",
    "otp_type": "mobile"
  }
}
```

**Solution**: You need to configure Twilio secrets in Supabase.

#### Scenario B: Twilio API Error
```json
{
  "success": false,
  "message": "Failed to send OTP: Twilio API error (400): Invalid phone number",
  "error_details": {
    "provider_error": "Twilio API error (400): Invalid phone number",
    "contact_info": "+919041777175",
    "otp_type": "mobile"
  }
}
```

**Solution**: The error message tells you exactly what's wrong (e.g., invalid phone number, unverified number, account suspended, etc.)

#### Scenario C: Success
```json
{
  "success": true,
  "message": "OTP sent to +919041777175",
  "expires_at": "2026-03-08T18:29:04.071Z",
  "debug_info": {
    "otp_code": "123456",
    "contact_info": "+919041777175",
    "otp_type": "mobile",
    "provider": "twilio",
    "message_id": "SM...",
    "note": "mobile OTP sent successfully"
  }
}
```

---

## Common Twilio Issues and Solutions

### Issue 1: Twilio Trial Account Restrictions

**Problem**: Twilio trial accounts can only send SMS to verified phone numbers.

**Symptoms**:
- SMS works for some numbers but not others
- Error: "To number is not a valid mobile number" or "Unverified number"

**Solution**:
1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Phone Numbers** → **Manage** → **Verified Caller IDs**
3. Click **Add a new number** and verify your test numbers
4. OR upgrade to a paid Twilio account to send to any number

### Issue 2: Invalid Phone Number Format

**Problem**: Phone number format doesn't match Twilio requirements.

**Symptoms**:
- Error: "Invalid phone number" or "Phone number must be in E.164 format"

**Solution**:
- Ensure phone numbers are in E.164 format: `+[country code][number]`
- Examples:
  - India: `+919041777175` ✅
  - USA: `+14155552671` ✅
  - Wrong: `9041777175` ❌ (missing country code)
  - Wrong: `+91 904 177 7175` ❌ (contains spaces)

### Issue 3: Twilio Phone Number Not Configured

**Problem**: The `TWILIO_PHONE_NUMBER` secret is missing or invalid.

**Symptoms**:
- Error: "Missing: TWILIO_PHONE_NUMBER"
- Error: "The 'From' number ... is not a valid phone number"

**Solution**:
1. Get a Twilio phone number:
   - Go to [Twilio Console](https://console.twilio.com/)
   - Navigate to **Phone Numbers** → **Manage** → **Buy a number**
   - Purchase a phone number with SMS capability
2. Configure the secret in Supabase (see below)

### Issue 4: Invalid Twilio Credentials

**Problem**: `TWILIO_ACCOUNT_SID` or `TWILIO_AUTH_TOKEN` are incorrect.

**Symptoms**:
- Error: "Authentication Error" or "Invalid credentials"
- HTTP Status: 401

**Solution**:
1. Verify your credentials at [Twilio Console](https://console.twilio.com/)
2. Navigate to **Account** → **API keys & tokens**
3. Copy your Account SID and Auth Token
4. Update secrets in Supabase (see below)

### Issue 5: Twilio Account Suspended or Out of Credit

**Problem**: Your Twilio account is suspended or has no credit.

**Symptoms**:
- Error: "Account suspended" or "Insufficient credit"
- HTTP Status: 403 or 402

**Solution**:
1. Check your [Twilio Console Dashboard](https://console.twilio.com/)
2. Verify account status
3. Add credit if needed (trial accounts get $15 free credit)
4. Contact Twilio support if account is suspended

---

## How to Configure Twilio Secrets in Supabase

### Get Your Twilio Credentials

1. Go to [Twilio Console](https://console.twilio.com/)
2. From the dashboard, copy:
   - **Account SID** (starts with `AC...`)
   - **Auth Token** (click to reveal)
3. Go to **Phone Numbers** → **Manage** → **Active numbers**
4. Copy your Twilio phone number (e.g., `+15017122661`)

### Set Secrets in Supabase Dashboard

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Project Settings** → **Edge Functions**
4. Scroll to **Secrets** section
5. Add the following secrets:

| Secret Name | Value | Example |
|------------|-------|---------|
| `TWILIO_ACCOUNT_SID` | Your Account SID | `AC1234567890abcdef1234567890abcd` |
| `TWILIO_AUTH_TOKEN` | Your Auth Token | `1234567890abcdef1234567890abcdef` |
| `TWILIO_PHONE_NUMBER` | Your Twilio number | `+15017122661` |

6. Click **Save** after adding each secret

**IMPORTANT**: After adding or updating secrets, you may need to redeploy your edge functions for changes to take effect.

---

## Testing SMS Delivery

### Quick Test Using Browser Console

```javascript
const supabaseUrl = 'YOUR_SUPABASE_URL';
const anonKey = 'YOUR_ANON_KEY';

const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${anonKey}`
  },
  body: JSON.stringify({
    user_id: 'test-user-id',
    contact_info: '+919041777175',  // Your test number
    otp_type: 'mobile'
  })
});

const result = await response.json();
console.log('Response:', result);
```

### Interpret the Response

1. **If `success: false`**: Check the `error_details.provider_error` for the exact issue
2. **If `success: true`**: Check `debug_info.provider` to confirm it's using "twilio" (not simulated)
3. **If SMS still not received**: Check Twilio Console → Monitor → Logs → Messaging to see delivery status

---

## View Twilio Logs

To see detailed delivery status:

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Monitor** → **Logs** → **Messaging**
3. Find your recent message attempts
4. Check the delivery status:
   - **Queued**: Message is being processed
   - **Sent**: Message was accepted by carrier
   - **Delivered**: Message was delivered successfully
   - **Failed**: Message delivery failed (check error code)
   - **Undelivered**: Carrier couldn't deliver message

---

## Edge Function Logs

To view edge function logs:

1. Go to Supabase Dashboard
2. Navigate to **Edge Functions**
3. Click on **send-otp** function
4. Click **Logs** tab
5. Look for console.log outputs showing:
   - Twilio configuration status
   - SMS send attempts
   - API responses

---

## Quick Checklist

Before testing, verify:

- [ ] Twilio Account SID is correctly set in Supabase secrets
- [ ] Twilio Auth Token is correctly set in Supabase secrets
- [ ] Twilio Phone Number is correctly set in Supabase secrets
- [ ] Twilio phone number format is E.164 (e.g., +919041777175)
- [ ] For trial accounts: destination number is verified in Twilio
- [ ] Twilio account has sufficient credit
- [ ] Edge function has been redeployed after setting secrets

---

## Still Not Working?

If you've checked everything above and SMS still isn't working:

1. **Check the updated response** from the edge function - it now provides detailed error messages
2. **Check Twilio Console logs** to see if requests are reaching Twilio
3. **Verify phone number format** - must be E.164 with country code
4. **Try a different phone number** - some carriers block automated SMS
5. **Contact Twilio support** if you see persistent API errors

---

## Next Steps

1. Try sending an OTP again
2. Check the response for detailed error information
3. Follow the solutions above based on the error message
4. If successful, verify the SMS arrives on your phone

The edge function now provides much better diagnostics, so you'll know exactly what the issue is!
