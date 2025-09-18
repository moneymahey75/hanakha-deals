import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { sessionManager } from '../lib/sessionManager';
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
  logout: () => void;
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
    // Check for existing admin session in sessionStorage
    const sessionToken = sessionManager.getToken();
    if (sessionToken && sessionToken !== 'null' && sessionToken !== 'undefined') {
      // For admin, we use a different validation approach
      const adminToken = sessionStorage.getItem('admin_session_token');
      if (adminToken) {
        validateAdminSession(adminToken);
      } else {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const validateAdminSession = async (sessionToken: string) => {
    try {
      // Check if session token is valid format and not expired
      if (!sessionToken || sessionToken === 'null' || sessionToken === 'undefined') {
        sessionStorage.removeItem('admin_session_token');
        setLoading(false);
        return;
      }

      // Extract admin ID from session token - match format: "admin-session-{id}-{timestamp}"
      const match = sessionToken.match(/^admin-session-(.+)-(\d+)$/);

      if (!match) {
        sessionStorage.removeItem('admin_session_token');
        setLoading(false);
        return;
      }

      const adminId = match[1];
      const timestamp = match[2];

      // Check if session is expired (8-hour expiration for better security)
      const sessionAge = Date.now() - parseInt(timestamp);
      const maxSessionAge = 8 * 60 * 60 * 1000; // 8 hours

      if (sessionAge > maxSessionAge) {
        console.log('❌ Session expired');
        sessionStorage.removeItem('admin_session_token');
        setLoading(false);
        return;
      }

      // Get admin data from database using service role to bypass RLS
      const { data: user, error } = await supabase
          .from('tbl_admin_users')
          .select('*')
          .eq('tau_id', adminId)
          .single();

      if (error || !user) {
        console.error('❌ Failed to validate session:', error);
        sessionStorage.removeItem('admin_session_token');
        setLoading(false);
        return;
      }

      if (!user.tau_is_active) {
        console.log('❌ Admin account is inactive');
        sessionStorage.removeItem('admin_session_token');
        setLoading(false);
        return;
      }

      const adminUser: AdminUser = {
        id: user.tau_id,
        email: user.tau_email,
        fullName: user.tau_full_name,
        role: user.tau_role,
        permissions: user.tau_permissions,
        isActive: user.tau_is_active,
        lastLogin: user.tau_last_login || '',
        createdAt: user.tau_created_at || ''
      };

      console.log('✅ Session validated successfully for:', adminUser.email);
      setAdmin(adminUser);
    } catch (error) {
      sessionStorage.removeItem('admin_session_token');
      console.error('Session validation failed:', error);
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('🔍 Starting admin login process for:', email);

      const response = await apiClient.adminLogin(email, password);
      
      if (response.success) {
        const adminUser: AdminUser = {
          id: response.data.admin.id,
          email: response.data.admin.email,
          fullName: response.data.admin.fullName,
          role: response.data.admin.role,
          permissions: response.data.admin.permissions,
          isActive: response.data.admin.isActive,
          lastLogin: response.data.admin.lastLogin || '',
          createdAt: response.data.admin.createdAt || ''
        };

        setAdmin(adminUser);
        
        // Store session token for compatibility
        sessionManager.saveToken(response.data.token);
        const sessionToken = `admin-session-${adminUser.id}-${Date.now()}`;
        sessionStorage.setItem('admin_session_token', sessionToken);

        notification.showSuccess('Welcome Back!', 'You have successfully logged in.');
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error: any) {
      console.error('❌ Admin login failed:', error);
      notification.showError('Login Failed', error.message || 'Invalid email or password');
      throw error;
    }
  };

  const logout = () => {
    sessionStorage.removeItem('admin_session_token');
    sessionManager.clearToken();
    apiClient.clearToken();
    setAdmin(null);
    notification.showInfo('Logged Out', 'Successfully logged out of admin panel.');
  };

  const createSubAdmin = async (data: {
    email: string;
    fullName: string;
    permissions: AdminUser['permissions'];
  }) => {
    try {
      const response = await apiClient.createSubAdmin(data);
      if (!response.success) {
        throw new Error(response.error || 'Failed to create sub-admin');
      }
      notification.showSuccess('Sub-Admin Created', 'Sub-admin created successfully');
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
      const response = await apiClient.updateSubAdmin(id, data);
      if (!response.success) {
        throw new Error(response.error || 'Failed to update sub-admin');
      }
      notification.showSuccess('Sub-Admin Updated', 'Sub-admin details updated successfully.');
    } catch (error: any) {
      console.error('Update sub-admin error:', error);
      notification.showError('Update Failed', error.message || 'Failed to update sub-admin');
      throw error;
    }
  };

  const deleteSubAdmin = async (id: string) => {
    try {
      const response = await apiClient.deleteSubAdmin(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to delete sub-admin');
      }
      notification.showSuccess('Sub-Admin Deleted', 'Sub-admin deleted successfully.');
    } catch (error: any) {
      console.error('Delete sub-admin error:', error);
      notification.showError('Deletion Failed', error.message || 'Failed to delete sub-admin');
      throw error;
    }
  };

  const resetSubAdminPassword = async (id: string): Promise<string> => {
    try {
      const response = await apiClient.resetSubAdminPassword(id);
      if (!response.success) {
        throw new Error(response.error || 'Failed to reset password');
      }
      const newPassword = response.data.newPassword;
      notification.showSuccess(
          'Password Reset',
          'New password has been sent to the sub-admin\'s email address.'
      );

      return newPassword;
    } catch (error: any) {
      console.error('Reset password error:', error);
      notification.showError('Reset Failed', error.message || 'Failed to reset password');
      throw error;
    }
  };

  const getSubAdmins = async (): Promise<SubAdmin[]> => {
    try {
      const response = await apiClient.getSubAdmins();
      if (response.success) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to fetch sub-admins');
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

  const generateTempPassword = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
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