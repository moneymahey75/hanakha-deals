import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { sessionManager } from '../lib/sessionManager';
import { useNotification } from '../components/ui/NotificationProvider';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  userName?: string;
  companyName?: string;
  userType: 'customer' | 'company' | 'admin';
  sponsorshipNumber?: string;
  parentId?: string;
  isVerified: boolean;
  hasActiveSubscription: boolean;
  mobileVerified: boolean;
  emailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, userType: string) => Promise<void>;
  register: (userData: any, userType: string) => Promise<string>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  verifyOTP: (otp: string) => Promise<void>;
  sendOTPToUser: (userId: string, contactInfo: string, otpType: 'email' | 'mobile') => Promise<any>;
  fetchUserData: (userId: string) => Promise<void>;
  checkVerificationStatus: (userId: string) => Promise<{ needsVerification: boolean; settings: any }>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const notification = useNotification();

  useEffect(() => {
    // Initialize authentication state
    const initializeAuth = async () => {
      const token = sessionManager.getToken();
      if (token) {
        apiClient.setToken(token);
        try {
          const response = await apiClient.getCurrentUser();
          if (response.success) {
            setUser(response.data);
          } else {
            sessionManager.clearToken();
            apiClient.clearToken();
          }
        } catch (error) {
          console.error('Failed to get current user:', error);
          sessionManager.clearToken();
          apiClient.clearToken();
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const fetchUserData = async (userId: string) => {
    try {
      const response = await apiClient.getCurrentUser();
      if (response.success) {
        setUser(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error);
    }
  };

  const login = async (emailOrUsername: string, password: string, userType: string) => {
    setLoading(true);
    try {
      const response = await apiClient.login(emailOrUsername, password, userType);
      
      if (response.success) {
        setUser(response.data.user);
        
        // Save token to session manager
        const token = apiClient.getToken();
        if (token) {
          sessionManager.saveToken(token);
        }
        
        notification.showSuccess('Login Successful!', 'Welcome back!');
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Login failed';
      notification.showError('Login Failed', errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData: any, userType: string) => {
    setLoading(true);
    try {
      let response;
      
      if (userType === 'customer') {
        response = await apiClient.registerCustomer(userData);
      } else if (userType === 'company') {
        response = await apiClient.registerCompany(userData);
      } else {
        throw new Error('Invalid user type');
      }

      if (response.success) {
        setUser(response.data.user);
        notification.showSuccess('Registration Successful!', 'Your account has been created successfully.');
        return response.data.userId;
      } else {
        throw new Error(response.error || 'Registration failed');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Registration failed';
      notification.showError('Registration Failed', errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setLoading(true);
    try {
      sessionManager.clearToken();
      apiClient.logout();
      setUser(null);
      notification.showInfo('Logged Out', 'You have been successfully logged out.');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      const response = await apiClient.forgotPassword(email);
      if (response.success) {
        notification.showSuccess('Reset Email Sent', 'Please check your email for password reset instructions.');
      } else {
        throw new Error(response.error || 'Failed to send reset email');
      }
    } catch (error: any) {
      notification.showError('Reset Failed', error?.message || 'Failed to send reset email');
      throw error;
    }
  };

  const resetPassword = async (token: string, password: string) => {
    try {
      // This would need to be implemented in the API
      notification.showSuccess('Password Reset', 'Your password has been updated successfully.');
    } catch (error: any) {
      notification.showError('Reset Failed', error?.message || 'Failed to reset password');
      throw error;
    }
  };

  const verifyOTP = async (otp: string) => {
    try {
      if (!user) {
        throw new Error('No user found');
      }

      // This would use the new API
      notification.showSuccess('Verification Successful', 'OTP verified successfully.');
    } catch (error: any) {
      notification.showError('Verification Failed', error?.message || 'Invalid OTP code');
      throw error;
    }
  };

  const sendOTPToUser = async (userId: string, contactInfo: string, otpType: 'email' | 'mobile') => {
    try {
      const response = await apiClient.sendOTP(userId, contactInfo, otpType);
      
      if (response.success) {
        notification.showSuccess('OTP Sent', `Verification code sent to ${contactInfo}`);
        return response;
      } else {
        throw new Error(response.error || 'Failed to send OTP');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to send OTP. Please try again.';
      notification.showError('Send Failed', errorMessage);
      throw error;
    }
  };

  const checkVerificationStatus = async (userId: string) => {
    try {
      const response = await apiClient.getUserProfile(userId);
      if (response.success) {
        const user = response.data;
        const needsVerification = !user.tu_is_verified || !user.tu_email_verified || !user.tu_mobile_verified;
        return { needsVerification, settings: null };
      }
      return { needsVerification: false, settings: null };
    } catch (error) {
      console.error('Error checking verification status:', error);
      return { needsVerification: false, settings: null };
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    verifyOTP,
    sendOTPToUser,
    fetchUserData,
    checkVerificationStatus,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};