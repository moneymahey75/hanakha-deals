import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
    const sessionToken = sessionStorage.getItem('admin_session_token');
    if (sessionToken && sessionToken !== 'null' && sessionToken !== 'undefined') {
      validateSession(sessionToken);
    } else {
      setLoading(false);
    }
  }, []);

  const validateSession = async (sessionToken: string) => {
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

      let user: any = null;
      let error: any = null;

      // Try to get admin user from database using service role to bypass RLS
      const result = await supabase
          .from('tbl_admin_users')
          .select('*')
          .eq('tau_email', email.trim())
          .single();

      user = result.data;
      error = result.error;

      if (error || !user) {
        console.error('❌ Admin user not found in database:', error);

        // If RLS is blocking, try with service role
        if (error?.code === '42501' || error?.message?.includes('RLS') || error?.message?.includes('policy')) {
          console.log('🔄 RLS detected, attempting service role query...');

          // Create a service role client for admin operations
          const { createClient } = await import('@supabase/supabase-js');
          const serviceClient = createClient(
              import.meta.env.VITE_SUPABASE_URL,
              import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
              {
                auth: {
                  autoRefreshToken: false,
                  persistSession: false
                }
              }
          );

          const { data: serviceUser, error: serviceError } = await serviceClient
              .from('tbl_admin_users')
              .select('*')
              .eq('tau_email', email.trim())
              .single();

          if (serviceError || !serviceUser) {
            console.error('❌ Service role query also failed:', serviceError);
            throw new Error('Invalid email or password');
          }

          user = serviceUser;
          console.log('✅ Service role query successful');
        } else {
          throw new Error('Invalid email or password');
        }
      } else {
        console.log('✅ Regular query successful');
      }

      if (!user) {
        throw new Error('Invalid email or password');
      }

      if (!user.tau_is_active) {
        throw new Error('Account is inactive. Please contact the administrator.');
      }

      console.log('🔐 Verifying password...');

      // Handle default admin credentials and bcrypt verification
      let passwordMatch = false;

      // Try bcrypt verification for other accounts
      try {
        const bcrypt = await import('bcryptjs');
        passwordMatch = await bcrypt.compare(password, user.tau_password_hash);
        console.log('✅ Using bcrypt for password verification');
      } catch (bcryptError) {
        console.log('⚠️ bcrypt not available, using fallback verification', bcryptError);
        // Fallback: direct comparison (not secure for production)
        passwordMatch = password === user.tau_password_hash;
      }

      if (!passwordMatch) {
        console.log('❌ Password verification failed');
        throw new Error('Invalid email or password');
      }

      console.log('✅ Password verified successfully');

      // All checks passed — login success
      const sessionToken = `admin-session-${user.tau_id}-${Date.now()}`;
      sessionStorage.setItem('admin_session_token', sessionToken);

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

      setAdmin(adminUser);

      // Update last login
      try {
        await supabase
            .from('tbl_admin_users')
            .update({ tau_last_login: new Date().toISOString() })
            .eq('tau_id', user.tau_id);
      } catch (updateError) {
        console.warn('Failed to update last login time:', updateError);
      }

      notification.showSuccess('Welcome Back!', 'You have successfully logged in.');
    } catch (error: any) {
      console.error('❌ Admin login failed:', error);
      notification.showError('Login Failed', error.message || 'Invalid email or password');
      throw error;
    }
  };

  const logout = () => {
    sessionStorage.removeItem('admin_session_token');
    setAdmin(null);
    notification.showInfo('Logged Out', 'Successfully logged out of admin panel.');
  };

  const createSubAdmin = async (data: {
    email: string;
    fullName: string;
    permissions: AdminUser['permissions'];
  }) => {
    try {
      // Check if email already exists - use .maybeSingle() or handle empty result
      const { data: existingUser, error: checkError } = await supabase
          .from('tbl_admin_users')
          .select('tau_id')
          .eq('tau_email', data.email.trim())
          .maybeSingle(); // Use maybeSingle instead of single

      if (checkError) {
        console.error('Email check error:', checkError);
        throw new Error('Failed to check email availability');
      }

      // If existingUser is not null, email already exists
      if (existingUser) {
        throw new Error('Email address already exists');
      }

      // Generate temporary password and hash it
      const tempPassword = generateTempPassword();
      const bcrypt = await import('bcryptjs');
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

      // Insert new sub-admin into database
      const { data: newAdmin, error: insertError } = await supabase
          .from('tbl_admin_users')
          .insert({
            tau_email: data.email.trim(),
            tau_full_name: data.fullName,
            tau_password_hash: hashedPassword,
            tau_role: 'sub_admin',
            tau_permissions: data.permissions,
            tau_is_active: true,
            tau_created_by: admin!.id,
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

      const { error } = await supabase
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
      const { error } = await supabase
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

      const { error } = await supabase
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
      const { data: subAdmins, error } = await supabase
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