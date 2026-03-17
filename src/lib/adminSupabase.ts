import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-key'

// Create a separate Supabase client for admin operations
// This client uses custom headers to identify admin requests
export const adminSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    storage: undefined
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
        console.log('💾 Saving admin session to sessionStorage:', adminData.id);

        const sessionData = {
          adminId: adminData.id,
          email: adminData.email,
          fullName: adminData.fullName,
          role: adminData.role,
          permissions: adminData.permissions,
          timestamp: Date.now()
        };

        sessionStorage.setItem('admin_session_data', JSON.stringify(sessionData));
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
        const sessionData = sessionStorage.getItem('admin_session_data');
        if (!sessionData) {
          return null;
        }

        const session = JSON.parse(sessionData);

        // Check if session is expired (8 hours)
        const sessionAge = Date.now() - session.timestamp;
        const maxSessionAge = 8 * 60 * 60 * 1000;

        if (sessionAge > maxSessionAge) {
          console.log('⏰ Admin session expired');
          adminSessionManager.removeSession();
          return null;
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
