# OTP Verification - User Guide

## What to Expect Now

### Scenario 1: SMS Successfully Sent
When everything is configured correctly:

1. **Click "Send Mobile OTP"**
   - Button shows: "Sending OTP..." with spinning animation

2. **Success Notification**
   - Green notification: "OTP Sent - Verification code sent to +91***7175"
   - Development mode shows the actual OTP code for testing

3. **SMS Received**
   - You receive SMS: "Your ShopClix verification code is: 123456. This code expires in 10 minutes. Do not share this code with anyone."

4. **Enter OTP**
   - Input fields become enabled
   - Enter the 6-digit code
   - Can paste entire code into any field

5. **Click "Verify Mobile OTP"**
   - Button shows: "Verifying..." with spinning animation
   - On success: Redirected to subscription plans

---

### Scenario 2: SMS Failed (No Twilio Configuration)
When Twilio is not configured:

1. **Click "Send Mobile OTP"**
   - Button shows: "Sending OTP..." briefly

2. **Error Notification**
   - Red notification appears: "Send Failed"
   - Error message: "Twilio not configured. Missing: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER"

3. **What This Means**
   - SMS provider is not set up yet
   - No SMS will be sent
   - OTP inputs remain disabled

4. **What to Do**
   - Contact administrator to configure Twilio
   - Or try email verification instead (if available)

---

### Scenario 3: Invalid Twilio Credentials
When Twilio credentials are wrong:

1. **Click "Send Mobile OTP"**
   - Button shows: "Sending OTP..." briefly

2. **Error Notification**
   - Red notification: "Send Failed"
   - Error message: "Twilio API error (401): Authentication Error"

3. **What This Means**
   - Twilio is configured but credentials are invalid
   - Account SID or Auth Token is incorrect

4. **What to Do**
   - Administrator needs to verify Twilio credentials
   - Check Twilio dashboard for correct values

---

### Scenario 4: Unverified Phone Number (Trial Account)
When using Twilio trial account with unverified number:

1. **Click "Send Mobile OTP"**
   - Button shows: "Sending OTP..." briefly

2. **Error Notification**
   - Red notification: "Send Failed"
   - Error message: "Twilio API error (400): Unverified number"

3. **What This Means**
   - Twilio trial accounts can only send to verified numbers
   - Your number needs to be verified in Twilio Console

4. **What to Do**
   - Administrator needs to verify the number in Twilio
   - Or upgrade Twilio to paid account
   - Or try email verification instead

---

### Scenario 5: Invalid Phone Number Format
When phone number format is incorrect:

1. **During Registration**
   - If number doesn't start with '+' or has invalid format

2. **Error Message**
   - Red notification: "Invalid mobile format. Should include country code (e.g., +1234567890)"

3. **What This Means**
   - Phone number must be in E.164 format
   - Must start with '+' followed by country code

4. **What to Do**
   - Re-enter number with country code
   - Examples:
     - India: +919041777175
     - USA: +14155552671
     - UK: +447911123456

---

## Button States Explained

### Send OTP Button

**Idle State:**
- Blue/Green background
- Text: "Send Mobile OTP" or "Send Email OTP"
- Icon: Phone or Email icon
- Enabled for clicking

**Sending State:**
- Same color background
- Text: "Sending OTP..."
- Icon: Spinning animation
- Disabled (can't click)

**After Success:**
- Button disappears
- OTP input fields become active
- Timer starts: "Resend OTP in 30 seconds"

**After Failure:**
- Button remains visible
- Can click to try again
- Error message shown above

### Verify OTP Button

**Initial State:**
- Grayed out
- Text: "Verify Mobile OTP"
- Disabled until OTP is sent

**After OTP Sent:**
- Blue/Green background
- Enabled when 6 digits entered
- Text: "Verify Mobile OTP"

**Verifying State:**
- Same color background
- Text: "Verifying..."
- Icon: Spinning animation
- Disabled (can't click)

**This State Stuck?** ← YOUR PROBLEM WAS HERE
- **Old Behavior**: Got stuck because system had cached OTP locally even though SMS never sent
- **New Behavior**: Won't get stuck because OTP only cached after successful SMS send
- **If Still Stuck**: Check browser console for actual error messages

---

## Common Issues and Solutions

### Issue: Button Shows "Verifying..." Forever

**Old Cause**: OTP was cached locally but SMS never sent, so you couldn't enter the right code

**New Behavior**: This shouldn't happen anymore because:
- OTP only cached after successful SMS send
- If SMS fails, you get error immediately
- Can't verify without receiving actual code

**If It Still Happens**:
1. Open browser console (F12)
2. Look for error messages in red
3. Check what the actual error is
4. Follow the error's instructions

### Issue: "Didn't receive OTP" But System Says Success

**Old Cause**: System returned success even when SMS failed to send

**New Behavior**:
- If SMS fails, you get error notification
- Success only shown when SMS actually sent
- Check your messages for the code

**If You Don't Receive**:
1. Check if error notification appeared
2. Verify phone number format is correct
3. Check with your carrier if SMS is blocked
4. Try resending after 30 seconds
5. Try email verification as alternative

### Issue: Can't Click Verify Button

**Possible Causes**:
1. **OTP Not Sent Yet**: Click "Send Mobile OTP" first
2. **Not All Digits Entered**: Must enter all 6 digits
3. **Wrong Format**: Only numbers 0-9 allowed

**Solution**:
1. Ensure OTP was sent successfully
2. Enter complete 6-digit code
3. Button will enable automatically

### Issue: "Invalid or Expired OTP"

**Possible Causes**:
1. **Wrong Code**: Double-check the code from SMS
2. **Code Expired**: OTP valid for 10 minutes only
3. **Too Many Attempts**: Maximum 5 failed attempts

**Solution**:
1. Verify you're entering exact code from SMS
2. Request new code if expired
3. If too many attempts, request fresh code

---

## Tips for Successful Verification

1. **Use Correct Format**
   - Always include country code
   - No spaces or special characters
   - Example: +919041777175

2. **Check Messages Quickly**
   - OTP expires in 10 minutes
   - Check SMS inbox immediately

3. **Copy-Paste Friendly**
   - You can paste entire 6-digit code
   - Paste into any of the 6 input boxes
   - System automatically fills all boxes

4. **Resend If Needed**
   - Wait 30 seconds between resends
   - Click "Resend OTP" button
   - Old code becomes invalid

5. **Try Alternative Method**
   - If mobile isn't working, try email
   - Both methods equally valid
   - Switch using buttons at top

6. **Development Mode**
   - Shows actual OTP code in notification
   - Only visible during testing
   - Won't show in production

---

## Error Messages Decoded

| Error Message | What It Means | What to Do |
|--------------|---------------|------------|
| "Twilio not configured" | SMS service not set up | Contact administrator |
| "Authentication Error" | Wrong Twilio credentials | Administrator needs to fix |
| "Unverified number" | Using trial account | Verify number in Twilio or upgrade |
| "Invalid phone number" | Wrong format | Add country code with '+' |
| "SMS sending timed out" | Network issue | Try again in a moment |
| "Too many failed attempts" | Entered wrong code 5+ times | Request new OTP |
| "Invalid or expired OTP" | Wrong code or too old | Check SMS and try again |

---

## Still Having Issues?

1. **Check Browser Console**
   - Press F12 to open Developer Tools
   - Click "Console" tab
   - Look for red error messages
   - Take screenshot of errors

2. **Verify Prerequisites**
   - Phone number in correct format
   - SMS service configured by admin
   - Internet connection stable
   - No carrier blocks on SMS

3. **Contact Support**
   - Provide phone number format
   - Describe exact error message seen
   - Include screenshot if possible
   - Mention if using trial Twilio account

4. **Try Alternative**
   - Use email verification if available
   - Complete registration without verification
   - Return to verify later when issue resolved

---

## For Administrators

To fix configuration issues, see:
- `TWILIO_TROUBLESHOOTING.md` - Complete setup guide
- `OTP_FIX_SUMMARY.md` - Technical details of fixes
- Supabase Edge Function logs - Real-time diagnostics
- Twilio Console logs - SMS delivery status
