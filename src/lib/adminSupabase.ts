import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-key'

// Create a separate Supabase client for admin operations
// This client persists auth sessions to allow RPC calls to work
export const adminSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: 'admin-auth-token'
  },
  global: {
    headers: {
      'X-Client-Info': 'mlm-platform-admin'
    }
  },
  db: {
    schema: 'public'
  }
})

// Helper to add admin session header to requests
export const getAdminSupabaseWithAuth = () => {
  const sessionData = adminSessionManager.getSession();

  if (!sessionData) {
    return adminSupabase;
  }

  // Create a new client with admin session header
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storage: undefined
    },
    global: {
      headers: {
        'X-Client-Info': 'mlm-platform-admin',
        'X-Admin-Session': sessionData.adminId
      }
    },
    db: {
      schema: 'public'
    }
  });
}

// Admin session manager - completely separate from customer sessions
export const adminSessionManager = {
  saveSession: (adminData: any) => {
    if (typeof window !== 'undefined') {
      try {
        const adminId =
          adminData?.adminId ||
          adminData?.id ||
          adminData?.admin_id ||
          adminData?.tau_id;

        if (!adminId) {
          console.error('❌ Refusing to save admin session: missing adminId', {
            keys: adminData ? Object.keys(adminData) : []
          });
          return;
        }

        console.log('💾 Saving admin session:', adminId);

        const existingToken = sessionStorage.getItem('admin_session_token');
        const existingSessionData = sessionStorage.getItem('admin_session_data');
        let existingExpiresAt: string | null = null;
        if (existingSessionData) {
          try {
            const parsedExisting = JSON.parse(existingSessionData);
            existingExpiresAt = parsedExisting.sessionExpiresAt || parsedExisting.tau_session_expires_at || null;
          } catch {
            existingExpiresAt = null;
          }
        }

        const sessionData = {
          adminId,
          email: adminData.email || adminData.tau_email || adminData.admin_email,
          fullName: adminData.fullName || adminData.tau_full_name || adminData.admin_full_name,
          role: adminData.role || adminData.tau_role || adminData.admin_role,
          permissions: adminData.permissions || adminData.tau_permissions || adminData.admin_permissions,
          sessionToken:
            adminData.sessionToken ||
            adminData.tau_session_token ||
            adminData.admin_session_token ||
            existingToken,
          sessionExpiresAt:
            adminData.sessionExpiresAt ||
            adminData.tau_session_expires_at ||
            adminData.admin_session_expires_at ||
            existingExpiresAt,
          timestamp: Date.now()
        };

        const serialized = JSON.stringify(sessionData);
        sessionStorage.setItem('admin_session_data', serialized);
        localStorage.setItem('admin_session_data', serialized);

        if (sessionData.sessionToken) {
          sessionStorage.setItem('admin_session_token', sessionData.sessionToken);
          localStorage.setItem('admin_session_token', sessionData.sessionToken);
        }

        // Keep admin marker per-tab for routing guards, but also persist in localStorage for other tabs.
        sessionStorage.setItem('session_type', 'admin');

        console.log('✅ Admin session saved successfully');
      } catch (error) {
        console.error('❌ Failed to save admin session:', error);
      }
    }
  },

  getSession: () => {
    if (typeof window !== 'undefined') {
      try {
        const sessionData = sessionStorage.getItem('admin_session_data') || localStorage.getItem('admin_session_data');
        if (!sessionData) return null;

        const session = JSON.parse(sessionData);
        // Backward/legacy compatibility: normalize adminId if possible
        if (!session.adminId) {
          session.adminId =
            session.id ||
            session.admin_id ||
            session.tau_id ||
            session.adminId;
        }

        // Check if session is expired (use server expiry if present, else 8 hours)
        const now = Date.now();
        const expiresAtMs = session.sessionExpiresAt ? Date.parse(session.sessionExpiresAt) : null;
        const sessionAge = now - session.timestamp;
        const maxSessionAge = 8 * 60 * 60 * 1000;

        if ((expiresAtMs && now > expiresAtMs) || (!expiresAtMs && sessionAge > maxSessionAge)) {
          console.log('⏰ Admin session expired', {
            sessionAgeMs: sessionAge,
            maxSessionAgeMs: maxSessionAge,
            expiresAt: session.sessionExpiresAt || null
          });
          adminSessionManager.removeSession();
          return null;
        }

        // Ensure current tab has the session cached in sessionStorage for faster access.
        try {
          sessionStorage.setItem('admin_session_data', JSON.stringify(session));
          if (session.sessionToken) sessionStorage.setItem('admin_session_token', session.sessionToken);
          if (sessionStorage.getItem('session_type') !== 'customer') {
            sessionStorage.setItem('session_type', 'admin');
          }
        } catch {
          // ignore
        }

        return session;
      } catch (error) {
        console.error('❌ Failed to get admin session:', error);
        adminSessionManager.removeSession();
        return null;
      }
    }
    return null;
  },

  removeSession: () => {
    if (typeof window !== 'undefined') {
      try {
        console.log('🗑️ Removing admin session');
        sessionStorage.removeItem('admin_session_data');
        sessionStorage.removeItem('admin_session_token');
        localStorage.removeItem('admin_session_data');
        localStorage.removeItem('admin_session_token');

        // Only remove session_type if it's admin
        if (sessionStorage.getItem('session_type') === 'admin') {
          sessionStorage.removeItem('session_type');
        }

        console.log('✅ Admin session removed');
      } catch (error) {
        console.error('❌ Failed to remove admin session:', error);
      }
    }
  },

  hasValidSession: (): boolean => {
    const session = adminSessionManager.getSession();
    return session !== null;
  }
};
