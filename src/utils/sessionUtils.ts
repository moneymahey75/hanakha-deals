// Session utility functions for enhanced session management
import { supabase, sessionManager } from '../lib/supabase';
import { adminSessionManager } from '../lib/adminSupabase';

export interface SessionInfo {
  isValid: boolean;
  expiresAt?: number;
  timeRemaining?: number;
  user?: any;
}

export const sessionUtils = {
  // Get detailed session information
  getSessionInfo: (): SessionInfo => {
    const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('current-user-id') : null;
    const session = sessionManager.getSession(currentUserId);

    if (!session) {
      return { isValid: false };
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at;
    const timeRemaining = expiresAt - now;

    return {
      isValid: timeRemaining > 0,
      expiresAt,
      timeRemaining,
      user: session.user
    };
  },

  // Check if session will expire soon (within 5 minutes)
  isSessionExpiringSoon: (): boolean => {
    const sessionInfo = sessionUtils.getSessionInfo();
    if (!sessionInfo.isValid || !sessionInfo.timeRemaining) {
      return false;
    }

    // Check if expires within 5 minutes (300 seconds)
    return sessionInfo.timeRemaining <= 300;
  },

  // Format time remaining in human readable format
  formatTimeRemaining: (seconds: number): string => {
    if (seconds <= 0) return 'Expired';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  },

  // Clear all session data (both Supabase and admin)
  clearAllSessions: () => {
    sessionManager.clearAllSessions();
    adminSessionManager.removeSession();
  },

  // Check if current page is a login page
  isOnLoginPage: (): boolean => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    return path.includes('/login') || path.includes('/register') || path.includes('/forgot-password') || path.includes('/reset-password');
  },

  // Check if current page is admin area
  isInAdminArea: (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.startsWith('/backpanel');
  },

  // Check if current page is a public page
  isPublicPage: (): boolean => {
    if (typeof window === 'undefined') return false;
    const publicPages = ['/', '/about', '/contact', '/faq', '/policies', '/join-customer', '/join-company', '/subscription-plans'];
    return publicPages.includes(window.location.pathname);
  },

  // Validate admin session using new session manager
  validateAdminSession: (): boolean => {
    return adminSessionManager.hasValidSession();
  },

  // Session event listeners for tab/window events
  setupSessionListeners: () => {
    if (typeof window === 'undefined') return;

    let isHandlingVisibilityChange = false;

    // Handle visibility change (tab switching)
    document.addEventListener('visibilitychange', async () => {
      if (isHandlingVisibilityChange) return;
      isHandlingVisibilityChange = true;

      try {
        if (document.visibilityState === 'visible' && !sessionUtils.isOnLoginPage()) {
          console.log('🔍 Tab became visible, checking session validity...');

          // Small delay to ensure any ongoing auth operations complete
          await new Promise(resolve => setTimeout(resolve, 100));

          const sessionInfo = sessionUtils.getSessionInfo();

          // For admin area, check admin session
          if (sessionUtils.isInAdminArea()) {
            if (!sessionUtils.validateAdminSession()) {
              if (window.location.pathname !== '/backpanel/login') {
                console.log('🔒 No valid admin session, redirecting to admin login');
                window.location.href = '/backpanel/login';
              }
            }
          } else {
            // For customer area, check Supabase session
            if (!sessionInfo.isValid) {
              if (!sessionUtils.isPublicPage()) {
                console.log('⚠️ Cached user session is invalid, attempting recovery...');
                const restored = await sessionUtils.refreshSession();
                if (!restored) {
                  console.log('ℹ️ Session recovery was not possible, leaving route handling to auth guards');
                }
              }
            } else {
              // FIX: Manually refresh Supabase token if session is expiring soon
              if (sessionUtils.isSessionExpiringSoon()) {
                console.log('⏳ User session expiring soon, attempting refresh...');
                await sessionUtils.refreshSession();
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ Error in visibility change handler:', error);
      } finally {
        isHandlingVisibilityChange = false;
      }
    });

    // Handle storage events (for multi-tab synchronization with localStorage)
    window.addEventListener('storage', (e) => {
      try {
        const currentUserId = localStorage.getItem('current-user-id');

        // Handle user session cleared in another tab
        if (e.key === `supabase-session-${currentUserId}` && e.newValue === null) {
          if (!sessionUtils.isOnLoginPage() && !sessionUtils.isInAdminArea() && !sessionUtils.isPublicPage()) {
            console.log('🔄 User session cleared in another tab, redirecting...');
            sessionUtils.clearAllSessions();
            window.location.href = '/customer/login';
          }
        }

        // Handle current user ID changed in another tab
        if (e.key === 'current-user-id' && e.newValue !== currentUserId) {
          if (!sessionUtils.isOnLoginPage() && !sessionUtils.isPublicPage()) {
            console.log('🔄 Current user changed in another tab, reloading...');
            window.location.reload();
          }
        }

        // Note: Admin sessions use sessionStorage which doesn't trigger storage events
        // Each tab has its own independent admin session
      } catch (error) {
        console.error('❌ Error in storage event handler:', error);
      }
    });

    // Handle page unload - extend admin session if active
    window.addEventListener('beforeunload', () => {
      // Update admin session timestamp to prevent premature expiration
      if (adminSessionManager.hasValidSession()) {
        const session = adminSessionManager.getSession();
        if (session) {
          // Refresh session timestamp
          adminSessionManager.saveSession(session);
        }
      }
    });

    console.log('✅ Session listeners setup completed');
  },

  // Manual session refresh
  refreshSession: async (): Promise<boolean> => {
    try {
      console.log('🔄 Manually refreshing session...');

      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session?.user) {
        sessionManager.saveSession(session);
        return true;
      }

      const restoredSession = await sessionManager.restoreSession();
      return !!restoredSession;
    } catch (error) {
      console.error('❌ Failed to refresh session:', error);
      return false;
    }
  },

  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    const sessionInfo = sessionUtils.getSessionInfo();
    return sessionInfo.isValid;
  },

  // Check if admin is authenticated
  isAdminAuthenticated: (): boolean => {
    return sessionUtils.validateAdminSession();
  }
};

// Auto-setup session listeners when module is imported
if (typeof window !== 'undefined') {
  // Setup listeners after a small delay to ensure DOM is ready
  setTimeout(() => {
    sessionUtils.setupSessionListeners();
  }, 100);
}
