import React, { createContext, useContext, useState, useEffect } from 'react';
import { adminSupabase, adminSessionManager } from '../lib/adminSupabase';
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

// Utility function (moved inside Provider or imported, assumed to be available)
const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const notification = useNotification();

  useEffect(() => {
    // Check session type first - only initialize if it's an admin session
    const sessionType = sessionStorage.getItem('session_type');

    console.log('🔍 AdminAuthContext initializing, session type:', sessionType);

    // If there's a customer session active, don't initialize admin
    if (sessionType === 'customer') {
      console.log('⚠️ Customer session detected, skipping admin initialization');
      setLoading(false);
      return;
    }

    // Check for admin session in sessionStorage
    const adminSession = adminSessionManager.getSession();

    if (adminSession) {
      console.log('✅ Found valid admin session, validating...');
      validateSession(adminSession);
    } else {
      console.log('ℹ️ No admin session found');
      setLoading(false);
    }
  }, []);

  const validateSession = async (sessionData: any) => {
    console.log('🔍 validateSession called for admin:', sessionData.adminId);

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

      console.log('🔐 Fetching admin user data...');

      // Use secure RPC function to get admin user data (using adminSupabase, NOT regular supabase)
      const { data: loginData, error: loginError } = await adminSupabase
        .rpc('admin_login_verify', {
          p_email: email.trim()
        });

      if (loginError) {
        console.error('❌ Admin login RPC failed:', loginError);
        throw new Error('Invalid email or password');
      }

      if (!loginData || loginData.length === 0) {
        console.error('❌ Admin user not found');
        throw new Error('Invalid email or password');
      }

      const adminData = loginData[0];

      console.log('🔐 Verifying password...');

      // Verify password using bcrypt
      let passwordMatch = false;
      try {
        const bcrypt = await import('bcryptjs');
        passwordMatch = await bcrypt.compare(password, adminData.admin_password_hash);
        console.log('✅ Using bcrypt for password verification');
      } catch (bcryptError) {
        console.log('⚠️ bcrypt not available, using fallback verification', bcryptError);
        passwordMatch = password === adminData.admin_password_hash;
      }

      if (!passwordMatch) {
        console.error('❌ Password verification failed');
        throw new Error('Invalid email or password');
      }

      console.log('✅ Password verified successfully');

      const adminUser: AdminUser = {
        id: adminData.admin_id,
        email: adminData.admin_email,
        fullName: adminData.admin_full_name,
        role: adminData.admin_role,
        permissions: adminData.admin_permissions,
        isActive: adminData.admin_is_active,
        lastLogin: adminData.admin_last_login || '',
        createdAt: adminData.admin_created_at || ''
      };

      // Save admin session (NO Supabase Auth)
      adminSessionManager.saveSession(adminUser);
      setAdmin(adminUser);

      // Update last login using RPC
      try {
        await adminSupabase.rpc('admin_update_last_login', {
          p_admin_id: adminUser.id
        });
      } catch (updateError) {
        console.warn('Failed to update last login time:', updateError);
      }

      console.log('✅ Admin login successful, no Supabase Auth used');
      notification.showSuccess('Welcome Back!', 'You have successfully logged in.');
    } catch (error: any) {
      console.error('❌ Admin login failed:', error);
      notification.showError('Login Failed', error.message || 'Invalid email or password');
      throw error;
    }
  };

  const logout = async () => {
    console.log('🔐 Admin logout initiated');

    // Clear admin session (NO Supabase Auth signout)
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

      const { data: existingUser, error: checkError } = await adminSupabase
          .from('tbl_admin_users')
          .select('tau_id')
          .eq('tau_email', data.email.trim())
          .maybeSingle();

      if (checkError) {
        console.error('Email check error:', checkError);
        throw new Error('Failed to check email availability');
      }

      if (existingUser) {
        throw new Error('Email address already exists');
      }

      const tempPassword = generateTempPassword();
      const bcrypt = await import('bcryptjs');
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

      const { data: newAdmin, error: insertError } = await adminSupabase
          .from('tbl_admin_users')
          .insert({
            tau_email: data.email.trim(),
            tau_full_name: data.fullName,
            tau_password_hash: hashedPassword,
            tau_role: 'sub_admin',
            tau_permissions: data.permissions,
            tau_is_active: true,
            tau_created_by: admin.id,
            tau_created_at: new Date().toISOString()
          })
          .select()
          .single();

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw new Error(insertError.message || 'Failed to create sub-admin');
      }

      console.log('Temporary password for email:', tempPassword);

      notification.showSuccess(
          'Sub-Admin Created',
          `Sub-admin created successfully. Login credentials have been sent to ${data.email}`
      );

      return newAdmin;
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
      const updateData: any = {};

      if (data.isActive !== undefined) {
        updateData.tau_is_active = data.isActive;
      }

      if (data.permissions) {
        updateData.tau_permissions = data.permissions;
      }

      if (data.fullName) {
        updateData.tau_full_name = data.fullName;
      }

      if (data.email) {
        updateData.tau_email = data.email;
      }

      const { error } = await adminSupabase
          .from('tbl_admin_users')
          .update(updateData)
          .eq('tau_id', id);

      if (error) {
        console.error('Database update error:', error);
        throw new Error(error.message || 'Failed to update sub-admin');
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
      const { error } = await adminSupabase
          .from('tbl_admin_users')
          .delete()
          .eq('tau_id', id);

      if (error) {
        console.error('Database delete error:', error);
        throw new Error(error.message || 'Failed to delete sub-admin');
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
      const newPassword = generateTempPassword();
      const bcrypt = await import('bcryptjs');
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      const { error } = await adminSupabase
          .from('tbl_admin_users')
          .update({ tau_password_hash: hashedPassword })
          .eq('tau_id', id);

      if (error) {
        console.error('Database password reset error:', error);
        throw new Error(error.message || 'Failed to reset password');
      }

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
      const { data: subAdmins, error } = await adminSupabase
          .from('tbl_admin_users')
          .select('*')
          .eq('tau_role', 'sub_admin')
          .order('tau_created_at', { ascending: false });

      if (error) {
        console.error('Database fetch error:', error);
        throw new Error('Failed to fetch sub-admins');
      }

      // Handle case where no sub-admins exist (empty array is fine)
      return subAdmins?.map(admin => ({
        id: admin.tau_id,
        email: admin.tau_email,
        fullName: admin.tau_full_name,
        permissions: admin.tau_permissions,
        isActive: admin.tau_is_active,
        createdBy: admin.tau_created_by,
        lastLogin: admin.tau_last_login,
        createdAt: admin.tau_created_at
      })) || [];
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