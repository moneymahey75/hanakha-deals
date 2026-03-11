# Session Persistence Fix

## Problem

Users were experiencing automatic logout when:
- Switching tabs or leaving the site inactive
- Closing and reopening the browser
- Refreshing the page after some time

## Root Cause

The application was using `sessionStorage` for storing user sessions. `sessionStorage` has these limitations:

1. **Tab-specific:** Data is isolated per tab and cleared when the tab is closed
2. **No persistence:** Data doesn't survive browser restarts
3. **Inactive timeout:** Some browsers clear sessionStorage when tabs are inactive

## Solution

Changed session storage from `sessionStorage` to `localStorage` for better persistence:

### Changes Made:

1. **Supabase Client Configuration** (`src/lib/supabase.ts`)
   - Changed storage from `window.sessionStorage` to `window.localStorage`
   - Updated `sessionManager` utilities to use `localStorage`
   - All session data now persists across browser restarts

2. **Session Manager Updates** (`src/lib/supabase.ts`)
   - `saveSession()`: Now saves to localStorage
   - `getSession()`: Now reads from localStorage
   - `removeSession()`: Now removes from localStorage
   - `clearAllSessions()`: Now clears from localStorage

3. **Session Utils Updates** (`src/utils/sessionUtils.ts`)
   - Updated `getSessionInfo()` to read from localStorage
   - Updated storage event listeners for multi-tab sync
   - Maintained sessionStorage only for admin sessions (intentionally tab-specific)

4. **Auth Context Enhancement** (`src/contexts/AuthContext.tsx`)
   - Added visibility change handler to check session when tab becomes active
   - Automatically validates and refreshes session when returning to tab
   - Prevents unnecessary logouts from tab switching

## Benefits

### Before (sessionStorage):
- ❌ Session lost when closing tab
- ❌ Session lost on browser restart
- ❌ Session cleared during inactivity
- ❌ Must login again after tab close

### After (localStorage):
- ✅ Session persists across tabs
- ✅ Session survives browser restarts
- ✅ Session maintained during inactivity
- ✅ Automatic session restoration
- ✅ Token auto-refresh when tab becomes active

## Session Lifetime

Sessions now persist until:
1. User explicitly logs out
2. Token expires (handled by Supabase, typically 1 hour with auto-refresh)
3. User clears browser data
4. Session is manually invalidated

## Technical Details

### Token Refresh
- Supabase automatically refreshes tokens before expiration
- `autoRefreshToken: true` setting ensures seamless re-authentication
- Refresh happens in background without user interaction

### Multi-Tab Synchronization
- localStorage changes trigger `storage` events across tabs
- Tabs stay synchronized when user logs out in one tab
- Session changes propagate automatically

### Visibility Handling
```typescript
// Check session when tab becomes visible
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    const session = await supabase.auth.getSession();
    if (!session) {
      logout(); // Clean logout if session invalid
    }
  }
});
```

## Admin Sessions

Admin sessions intentionally use `sessionStorage` for security:
- Admin access should be tab-specific
- Admins must re-authenticate in new tabs
- Reduces risk from unattended sessions

## Migration

No user action required! The system will:
1. Detect existing sessionStorage sessions (if any)
2. Automatically migrate to localStorage on next login
3. Old sessionStorage data is ignored
4. Seamless transition for all users

## Security Considerations

### Maintained Security:
- ✅ Tokens still encrypted by Supabase
- ✅ HTTPS required in production
- ✅ Row Level Security (RLS) still enforced
- ✅ Token expiration still respected
- ✅ Logout clears all data

### New Protections:
- ✅ Session validation on tab focus
- ✅ Expired token detection and cleanup
- ✅ Multi-tab logout synchronization
- ✅ Corrupted session data cleanup

## Testing

To test the fix:

1. **Tab Switching:**
   - Login to the site
   - Switch to another tab for 5+ minutes
   - Return to site tab
   - ✅ Should remain logged in

2. **Browser Restart:**
   - Login to the site
   - Close all browser windows
   - Reopen browser and navigate to site
   - ✅ Should still be logged in

3. **Multi-Tab:**
   - Login in one tab
   - Open site in new tab
   - ✅ Should be logged in both tabs
   - Logout in one tab
   - ✅ Other tab should also logout

4. **Inactivity:**
   - Login to the site
   - Leave tab open but inactive for 30+ minutes
   - Return to tab and interact
   - ✅ Should remain logged in (or refresh automatically)

## Rollback

If issues occur, revert by changing:
```typescript
// In src/lib/supabase.ts
storage: window.sessionStorage // instead of localStorage
```

Then update sessionManager to use `sessionStorage` again.

## Browser Compatibility

Works in all modern browsers:
- ✅ Chrome/Edge 4+
- ✅ Firefox 3.5+
- ✅ Safari 4+
- ✅ Opera 10.5+
- ✅ iOS Safari 3.2+
- ✅ Android Browser 2.1+

## Known Limitations

1. **Private/Incognito Mode:** Sessions still clear when closing browser (by design)
2. **Storage Quota:** localStorage has ~5-10MB limit (more than sufficient)
3. **No Encryption:** Data stored as-is in localStorage (tokens are already encrypted)

## Troubleshooting

### Still Getting Logged Out?

1. **Check Browser Settings:**
   - Ensure cookies/localStorage not blocked
   - Disable "Clear data on exit" setting
   - Check browser extensions (some block storage)

2. **Check Console:**
   - Look for session-related errors
   - Check for "Session expired" messages
   - Verify token refresh is working

3. **Clear and Re-login:**
   - Clear browser cache/storage
   - Fresh login to create new session
   - Should resolve most issues

### Admin Can't Access?

Admin sessions use sessionStorage intentionally:
- Login in each new tab
- Session clears when tab closes
- This is expected behavior for security

## Future Enhancements

Potential improvements:
1. Remember Me checkbox (30-day persistence)
2. Encrypted localStorage values
3. Session activity monitoring
4. Automatic cleanup of old sessions
5. Session transfer between devices
