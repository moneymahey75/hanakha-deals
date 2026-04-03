import React, { createContext, useContext, useState, useEffect } from 'react';
import { adminSupabase, adminSessionManager } from '../lib/adminSupabase';
import { adminApi } from '../lib/adminApi';
import { useNotification } from '../components/ui/NotificationProvider';

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: 'super_admin' | 'sub_admin';
  permissions: {
    customers: { read: boolean; write: boolean; delete: boolean };
    companies: { read: boolean; write: boolean; delete: boolean };
    subscriptions: { read: boolean; write: boolean; delete: boolean };
    payments: { read: boolean; write: boolean; delete: boolean };
    settings: { read: boolean; write: boolean; delete: boolean };
    admins: { read: boolean; write: boolean; delete: boolean };
    coupons: { read: boolean, write: boolean, delete: boolean },
    dailytasks: { read: boolean, write: boolean, delete: boolean },
    wallets: { read: boolean, write: boolean, delete: boolean },
  };
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

interface SubAdmin {
  id: string;
  email: string;
  fullName: string;
  permissions: AdminUser['permissions'];
  isActive: boolean;
  createdBy: string;
  lastLogin?: string;
  createdAt: string;
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  createSubAdmin: (data: {
    email: string;
    fullName: string;
    permissions: AdminUser['permissions'];
  }) => Promise<void>;
  updateSubAdmin: (id: string, data: Partial<SubAdmin>) => Promise<void>;
  deleteSubAdmin: (id: string) => Promise<void>;
  resetSubAdminPassword: (id: string) => Promise<string>;
  getSubAdmins: () => Promise<SubAdmin[]>;
  hasPermission: (module: keyof AdminUser['permissions'], action: 'read' | 'write' | 'delete') => boolean;
  loading: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const notification = useNotification();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('🧭 AdminAuthContext mount:', {
        path: window.location.pathname,
        session_type: sessionStorage.getItem('session_type'),
        has_admin_session_data: !!sessionStorage.getItem('admin_session_data')
      });
    }
    // Check for admin session first - it should take precedence in admin area
    const adminSession = adminSessionManager.getSession();

    if (adminSession) {
      console.log('✅ Found valid admin session, validating...');
      validateSession(adminSession);
      return;
    }

    // Check session type only if no admin session exists
    const sessionType = sessionStorage.getItem('session_type');
    console.log('🔍 AdminAuthContext initializing, session type:', sessionType);

    // If there's a customer session active, don't initialize admin
    if (sessionType === 'customer') {
      console.log('⚠️ Customer session detected, skipping admin initialization');
      setLoading(false);
      return;
    }

    console.log('ℹ️ No admin session found');
    setLoading(false);
  }, []);

  const validateSession = async (sessionData: any) => {
    console.log('🔍 validateSession called for admin:', sessionData.adminId);
    console.log('🧾 validateSession payload:', {
      has_adminId: !!sessionData?.adminId,
      timestamp: sessionData?.timestamp
    });

    const timeoutId = setTimeout(() => {
      console.error('⏰ Session validation timeout');
      setLoading(false);
      adminSessionManager.removeSession();
    }, 10000);

    try {
      if (!sessionData || !sessionData.adminId) {
        console.log('❌ Invalid session data');
        adminSessionManager.removeSession();
        clearTimeout(timeoutId);
        setLoading(false);
        return;
      }

      // Fetch admin user data using RPC (no Supabase Auth needed)
      console.log('🔍 Fetching admin user data via RPC...');
      const { data: userData, error: userError } = await adminSupabase
        .rpc('get_admin_by_id', {
          p_admin_id: sessionData.adminId
        });

      console.log('📊 RPC response:', { userData, userError });

      if (userError || !userData || userData.length === 0) {
        console.error('❌ Failed to fetch admin user:', userError);
        adminSessionManager.removeSession();
        clearTimeout(timeoutId);
        setLoading(false);
        return;
      }

      const user: any = userData[0];
      console.log('✅ Admin user data fetched:', user.tau_email);

      if (!user.tau_is_active) {
        console.log('❌ Admin account is inactive');
        adminSessionManager.removeSession();
        clearTimeout(timeoutId);
        setLoading(false);
        return;
      }

      const adminUser: AdminUser = {
        id: user.tau_id,
        email: user.tau_email,
        fullName: user.tau_full_name,
        role: user.tau_role,
        permissions: user.tau_permissions || {
          customers: { read: false, write: false, delete: false },
          companies: { read: false, write: false, delete: false },
          subscriptions: { read: false, write: false, delete: false },
          payments: { read: false, write: false, delete: false },
          settings: { read: false, write: false, delete: false },
          admins: { read: false, write: false, delete: false },
          coupons: { read: false, write: false, delete: false },
          dailytasks: { read: false, write: false, delete: false },
          wallets: { read: false, write: false, delete: false },
        },
        isActive: user.tau_is_active,
        lastLogin: user.tau_last_login || '',
        createdAt: user.tau_created_at || ''
      };

      // Renew session
      console.log('🔄 Renewing admin session timestamp');
      adminSessionManager.saveSession(adminUser);

      console.log('✅ Session validated successfully for:', adminUser.email);
      setAdmin(adminUser);
      clearTimeout(timeoutId);
    } catch (error) {
      adminSessionManager.removeSession();
      console.error('❌ Session validation failed:', error);
      setAdmin(null);
      clearTimeout(timeoutId);
    } finally {
      console.log('🏁 Setting loading to false');
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('🔍 Starting admin login process for:', email);

      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-login`;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey
        },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const result = await response.json();

      if (!result?.success) {
        throw new Error(result?.error || 'Invalid email or password');
      }

      const adminUser: AdminUser = {
        id: result.admin.id,
        email: result.admin.email,
        fullName: result.admin.fullName,
        role: result.admin.role,
        permissions: result.admin.permissions,
        isActive: result.admin.isActive,
        lastLogin: result.admin.lastLogin || '',
        createdAt: result.admin.createdAt || ''
      };

      adminSessionManager.saveSession({
        ...adminUser,
        sessionToken: result.session_token,
        sessionExpiresAt: result.session_expires_at
      });
      setAdmin(adminUser);

      console.log('✅ Admin login successful');
      notification.showSuccess('Welcome Back!', 'You have successfully logged in.');
    } catch (error: any) {
      console.error('❌ Admin login failed:', error);
      notification.showError('Login Failed', error.message || 'Invalid email or password');
      throw error;
    }
  };

  const logout = async () => {
    console.log('🔐 Admin logout initiated');

    // Helper function with timeout
    const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      let timeoutId: number | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
      });
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timeoutId) window.clearTimeout(timeoutId);
      }
    };

    // Revoke admin session token (best-effort)
    try {
      const adminSessionToken = sessionStorage.getItem('admin_session_token');
      if (adminSessionToken) {
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-logout`;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            'X-Admin-Session': adminSessionToken
          }
        });
      }
    } catch (error) {
      console.warn('⚠️ Admin session revoke failed (continuing logout):', error);
    }

    // Sign out from Supabase Auth if authenticated with timeout
    try {
      await withTimeout(adminSupabase.auth.signOut(), 5000, 'Admin Supabase sign-out');
      console.log('✅ Signed out from Supabase Auth');
    } catch (error) {
      console.warn('⚠️ Supabase Auth sign-out error or timed out (acceptable during logout):', error);
    }

    // Clear admin session
    adminSessionManager.removeSession();
    setAdmin(null);

    console.log('✅ Admin logout successful');
    notification.showInfo('Logged Out', 'Successfully logged out of admin panel.');
  };

  const createSubAdmin = async (data: {
    email: string;
    fullName: string;
    permissions: AdminUser['permissions'];
  }) => {
    try {
      if (!admin?.id) throw new Error('Admin not authenticated');
      await adminApi.post('admin-create-sub-admin', {
        email: data.email,
        fullName: data.fullName,
        permissions: data.permissions
      });

      notification.showSuccess(
          'Sub-Admin Created',
          `Sub-admin created successfully. Login credentials have been sent to ${data.email}`
      );

      return;
    } catch (error: any) {
      console.error('Create sub-admin error:', error);
      notification.showError(
          'Creation Failed',
          error.message || 'Failed to create sub-admin. Please try again.'
      );
      throw error;
    }
  };

  const updateSubAdmin = async (id: string, data: Partial<SubAdmin>) => {
    try {
      await adminApi.post('admin-update-sub-admin', {
        id,
        email: data.email,
        fullName: data.fullName,
        isActive: data.isActive,
        permissions: data.permissions
      });

      notification.showSuccess('Sub-Admin Updated', 'Sub-admin details updated successfully.');
    } catch (error: any) {
      console.error('Update sub-admin error:', error);
      notification.showError('Update Failed', error.message || 'Failed to update sub-admin');
      throw error;
    }
  };

  const deleteSubAdmin = async (id: string) => {
    try {
      await adminApi.post('admin-delete-sub-admin', { id });

      notification.showSuccess('Sub-Admin Deleted', 'Sub-admin deleted successfully.');
    } catch (error: any) {
      console.error('Delete sub-admin error:', error);
      notification.showError('Deletion Failed', error.message || 'Failed to delete sub-admin');
      throw error;
    }
  };

  const resetSubAdminPassword = async (id: string): Promise<string> => {
    try {
      const result = await adminApi.post<{ newPassword: string }>('admin-reset-sub-admin-password', { id });

      notification.showSuccess(
          'Password Reset',
          'New password has been sent to the sub-admin\'s email address.'
      );

      return result?.newPassword || '';
    } catch (error: any) {
      console.error('Reset password error:', error);
      notification.showError('Reset Failed', error.message || 'Failed to reset password');
      throw error;
    }
  };

  const getSubAdmins = async (): Promise<SubAdmin[]> => {
    try {
      const subAdmins = await adminApi.post<any[]>('admin-get-sub-admins', {});
      return (subAdmins || []).map((admin: any) => ({
        id: admin.tau_id,
        email: admin.tau_email,
        fullName: admin.tau_full_name,
        permissions: admin.tau_permissions,
        isActive: admin.tau_is_active,
        createdBy: admin.tau_created_by,
        lastLogin: admin.tau_last_login,
        createdAt: admin.tau_created_at
      }));
    } catch (error) {
      console.error('Get sub-admins error:', error);
      notification.showError('Fetch Failed', 'Failed to fetch sub-admins');
      return [];
    }
  };

  const hasPermission = (module: keyof AdminUser['permissions'], action: 'read' | 'write' | 'delete'): boolean => {
    if (!admin) return false;
    if (admin.role === 'super_admin') return true;
    return admin.permissions[module][action];
  };

  const value = {
    admin,
    login,
    logout,
    createSubAdmin,
    updateSubAdmin,
    deleteSubAdmin,
    resetSubAdminPassword,
    getSubAdmins,
    hasPermission,
    loading
  };

  return (
      <AdminAuthContext.Provider value={value}>
        {children}
      </AdminAuthContext.Provider>
  );
};
