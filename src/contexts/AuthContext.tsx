import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, supabaseBatch, sessionManager } from '../lib/supabase';
import { adminSessionManager } from '../lib/adminSupabase';
import { OTPService, verifyOTPAPI } from '../services/otpService';
import { useNotification } from '../components/ui/NotificationProvider';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  userType: 'customer' | 'company' | 'admin';
  sponsorshipNumber?: string;
  parentId?: string;
  isVerified: boolean;
  hasActiveSubscription: boolean;
  mobileVerified: boolean;
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
  const [isInitialized, setIsInitialized] = useState(false);
  const [otpService] = useState(() => OTPService.getInstance());
  const notification = useNotification();
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

  const fetchUserData = useCallback(async (userId: string) => {
    if (!userId) {
      console.warn('⚠️ No userId provided to fetchUserData');
      return;
    }

    try {
      console.log('🔍 Fetching user data for:', userId);

      // Optimize user data fetching with single query using joins
      let userData = null;
      let profileData = null;
      let companyData = null;
      let subscriptionData = null;

      try {
        // Fetch user and profile data (always needed)
        const { data: userWithProfile, error: userError } = await supabase
            .from('tbl_users')
            .select(`
              *,
              tbl_user_profiles(*)
            `)
            .eq('tu_id', userId)
            .maybeSingle();

        if (userError) {
          console.log('⚠️ Error fetching user data:', userError.message);
        } else if (userWithProfile) {
          userData = userWithProfile;
          profileData = userWithProfile.tbl_user_profiles?.[0];
          console.log('✅ User and profile data loaded:', {
            hasUser: !!userData,
            hasProfile: !!profileData,
            firstName: profileData?.tup_first_name,
            lastName: profileData?.tup_last_name
          });
        }
      } catch (rlsError) {
        console.warn('RLS blocking users table:', rlsError);
      }

      // Only fetch additional data if not already retrieved from combined query
      if (!profileData) {
        try {
          const { data: profileDataArray } = await supabase
              .from('tbl_user_profiles')
              .select('*')
              .eq('tup_user_id', userId);
          console.log('📋 Profile data retrieved:', profileDataArray?.length || 0, 'records');
          profileData = profileDataArray?.[0];
        } catch (profileRlsError) {
          console.warn('RLS blocking user_profiles table:', profileRlsError);
        }
      }

      // if (!companyData && userData?.tu_user_type === 'company') {
      //   try {
      //     const { data: companyDataArray } = await supabase
      //       .from('tbl_companies')
      //       .select('*')
      //       .eq('tc_user_id', userId);
      //     console.log('🏢 Company data retrieved:', companyDataArray?.length || 0, 'records');
      //     companyData = companyDataArray?.[0];
      //   } catch (companyRlsError) {
      //     console.warn('RLS blocking companies table:', companyRlsError);
      //   }
      // }

      if (!subscriptionData) {
        try {
          console.log('💳 Checking for active subscription for user:', userId);
          const { data: subscriptionDataArray } = await supabase
              .from('tbl_user_subscriptions')
              .select('*')
              .eq('tus_user_id', userId)
              .eq('tus_status', 'active')
              .gte('tus_end_date', new Date().toISOString());
          console.log('💳 Subscription data retrieved:', subscriptionDataArray?.length || 0, 'records');
          subscriptionData = subscriptionDataArray?.[0];
        } catch (subscriptionRlsError) {
          console.warn('RLS blocking user_subscriptions table:', subscriptionRlsError);
        }
      }

      // Get current session to get email
      const { data: { session } } = await supabase.auth.getSession();

      // Ensure we have at least minimal user data
      if (!userData && !profileData) {
        console.error('❌ No user or profile data found for userId:', userId);
        throw new Error('User data not found');
      }

      const user: User = {
        id: userId,
        email: session?.user?.email || userData?.tu_email || 'unknown@example.com',
        firstName: profileData?.tup_first_name || '',
        lastName: profileData?.tup_last_name || '',
        userType: userData?.tu_user_type || 'customer',
        sponsorshipNumber: profileData?.tup_sponsorship_number || '',
        parentId: profileData?.tup_parent_account,
        isVerified: userData?.tu_is_verified || false,
        hasActiveSubscription: !!subscriptionData,
        mobileVerified: userData?.tu_mobile_verified || false
      };

      console.log('✅ User data compiled:', {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        hasProfile: !!profileData,
        hasActiveSubscription: !!subscriptionData
      });

      // Mark session as customer type when user data is loaded
      sessionStorage.setItem('session_type', 'customer');
      setUser(user);
    } catch (error) {
      console.error('❌ Error fetching user data:', error);
      // Don't throw error, just set user to null
      setUser(null);
    }
  }, []);

  const logout = useCallback(() => {
    setLoading(true);
    const currentUserId = user?.id;

    try {
      // Log logout activity before signing out
      if (user) {
        supabase
            .from('tbl_user_activity_logs')
            .insert({
              tual_user_id: user.id,
              tual_activity_type: 'logout',
              tual_ip_address: 'unknown',
              tual_user_agent: navigator.userAgent,
              tual_logout_time: new Date().toISOString()
            })
            .then(({ error }) => {
              if (error) console.warn('Failed to log logout activity:', error);
            });
      }

      // Clear all session data
      console.log('🧹 Clearing all session data during logout...');
      sessionManager.removeSession(currentUserId);
      sessionStorage.removeItem('session_type');

      // Sign out from Supabase
      supabase.auth.signOut();

      // Clear user state
      setUser(null);

      notification.showInfo('Logged Out', 'You have been successfully logged out.');
    } catch (error) {
      console.error('❌ Error during logout:', error);
    } finally {
      setLoading(false);
    }
  }, [notification, user]);

  useEffect(() => {
    if (isInitialized) return;

    let mounted = true;

    const initializeSession = async () => {
      setLoading(true);
      try {
        console.log('🔍 Initializing authentication...');

        const sessionType = sessionStorage.getItem('session_type');
        if (sessionType === 'admin') {
          console.log('⚠️ Admin session active, skipping customer session initialization');
          if (mounted) setUser(null);
          return;
        }

        const { data: { session: existingSession } } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'Initial getSession'
        );

        if (existingSession?.user) {
          console.log('✅ Found existing Supabase session:', existingSession.user.id);

          try {
            const { data: adminCheck, error: adminCheckError } = await withTimeout(
              supabase
                .from('tbl_admin_users')
                .select('tau_id')
                .eq('tau_auth_uid', existingSession.user.id)
                .maybeSingle(),
              8000,
              'Admin session check'
            );

            if (!adminCheckError && adminCheck) {
              console.log('⚠️ Session belongs to admin user, clearing for frontend');
              sessionStorage.removeItem('session_type');
              await supabase.auth.signOut();
              if (mounted) setUser(null);
            } else {
              sessionManager.saveSession(existingSession);
              await withTimeout(fetchUserData(existingSession.user.id), 15000, 'Initial user data load');
            }
          } catch (error) {
            console.log('ℹ️ Admin check failed, assuming regular user:', error);
            sessionManager.saveSession(existingSession);
            await withTimeout(fetchUserData(existingSession.user.id), 15000, 'Initial user data load');
          }
        } else {
          console.log('🔍 Checking sessionStorage for saved session...');
          const restoredSession = await withTimeout(
            sessionManager.restoreSession(),
            10000,
            'Restore saved session'
          );

          if (restoredSession?.user) {
            console.log('✅ Session restored from sessionStorage:', restoredSession.user.id);
            await withTimeout(fetchUserData(restoredSession.user.id), 15000, 'Restored user data load');
          } else if (mounted) {
            console.log('ℹ️ No existing session found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('❌ Failed to initialize session:', error);
        sessionManager.removeSession();
        if (mounted) setUser(null);
      } finally {
        if (mounted) {
          setLoading(false);
          setIsInitialized(true);
        }
      }
    };

    initializeSession();

    return () => {
      mounted = false;
    };
  }, [fetchUserData, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔄 Auth state change:', event, session?.user?.id);

      try {
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('✅ User signed in, saving session');
          sessionManager.saveSession(session);
          await withTimeout(fetchUserData(session.user.id), 15000, 'Auth change user load');
        } else if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out, clearing session');
          sessionManager.removeSession(user?.id);
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          console.log('🔄 Token refreshed, updating session');
          sessionManager.saveSession(session);
          if (!user || user.id !== session.user.id) {
            await withTimeout(fetchUserData(session.user.id), 15000, 'Token refresh user load');
          }
        }
      } catch (error) {
        console.error('❌ Error handling auth state change:', error);
        sessionManager.removeSession();
        setUser(null);
      }
    });

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !user) return;

      console.log('👁️ Tab became visible, checking session validity');
      try {
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'Visibility getSession'
        );

        if (error) {
          console.error('❌ Error checking session:', error);
          return;
        }

        if (session?.user) {
          console.log('✅ Session is valid');
          sessionManager.saveSession(session);
          return;
        }

        console.warn('⚠️ No live session found, attempting restore');
        const restoredSession = await withTimeout(
          sessionManager.restoreSession(),
          10000,
          'Visibility restore session'
        );

        if (restoredSession?.user) {
          console.log('✅ Session restored after tab became visible');
          sessionManager.saveSession(restoredSession);
          if (restoredSession.user.id !== user.id) {
            await withTimeout(fetchUserData(restoredSession.user.id), 15000, 'Visibility user reload');
          }
          return;
        }

        console.warn('⚠️ Unable to restore session, logging out');
        logout();
      } catch (error) {
        console.error('❌ Error handling visibility change:', error);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUserData, isInitialized, logout, user]);

  const login = async (emailOrUsername: string, password: string, userType: string) => {
    setLoading(true);
    try {
      console.log('🔍 Attempting login for:', emailOrUsername);

      // Clear any existing session data first (including admin sessions)
      console.log('🧹 Clearing existing session data...');
      sessionStorage.removeItem('session_type');
      sessionStorage.removeItem('admin_session_token');
      adminSessionManager.removeSession();
      sessionManager.removeSession();
      
      // Check if there's actually an active Supabase session before signing out
      console.log('🔍 Checking for active Supabase session...');
      let hasActiveSession = false;
      try {
        const { data: { session: activeSession } } = await withTimeout(
          supabase.auth.getSession(),
          3000,
          'Get session check'
        );
        hasActiveSession = !!activeSession;
      } catch (getSessionError) {
        console.warn('⚠️ Could not check active session:', getSessionError);
        hasActiveSession = false;
      }
      
      if (hasActiveSession) {
        console.log('🚪 Active session found, signing out...');
        try {
          await withTimeout(supabase.auth.signOut(), 5000, 'Supabase sign-out');
          console.log('✅ Supabase sign-out completed');
        } catch (signOutError) {
          console.warn('⚠️ Supabase sign-out failed or timed out, continuing with login anyway:', signOutError);
        }
      } else {
        console.log('ℹ️ No active Supabase session found, skipping sign-out');
      }
      setUser(null);

      // Longer delay to ensure auth state is reset and ready for fresh login
      console.log('⏳ Waiting for auth state to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 800));

      // Determine if input is email or username
      const isEmail = emailOrUsername.includes('@');
      let actualEmail = emailOrUsername;

      // If username/sponsor id provided, resolve the email using RPC
      if (!isEmail) {
        const handle = String(emailOrUsername || '').trim();

        console.log('🔎 Looking up email for username:', handle);
        const { data: usernameData, error: usernameError } = await supabase
          .rpc('get_email_by_username', { p_username: handle });

        if (!usernameError && usernameData && usernameData.length > 0) {
          actualEmail = usernameData[0].email;
          console.log('✅ Email resolved from username');
        } else {
          console.log('🔎 Looking up email for sponsorship number:', handle);
          const { data: sponsorData, error: sponsorError } = await supabase
            .rpc('get_email_by_sponsorship', { p_sponsorship: handle });

          if (sponsorError || !sponsorData || sponsorData.length === 0) {
            throw new Error('Username or Sponsor ID not found');
          }

          actualEmail = sponsorData[0].email;
          console.log('✅ Email resolved from sponsorship number');
        }
      }

      // Authenticate with Supabase (with extended timeout for network issues)
      console.log('🔐 Signing in with Supabase...');
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: actualEmail,
          password: password
        }),
        20000,
        'Supabase sign-in'
      );
      console.log('🔐 Supabase sign-in response received');

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user || !authData.session) {
        throw new Error('Authentication failed - no session created');
      }

      // Explicitly save the session
      console.log('💾 Saving session after login...');
      sessionManager.saveSession(authData.session);

      // Mark session type as customer
      sessionStorage.setItem('session_type', 'customer');
      console.log('🧾 session_type set to customer');

      // Set a minimal user immediately to avoid login hanging on slow DB calls
      const minimalUser: User = {
        id: authData.user.id,
        email: authData.user.email || actualEmail,
        userType: (userType as User['userType']) || 'customer',
        isVerified: false,
        hasActiveSubscription: false,
        mobileVerified: false
      };
      setUser(minimalUser);

      // Fire-and-forget: log activity and fetch full profile
      void (async () => {
        try {
          console.log('📝 Logging login activity...');
          await withTimeout(
            supabase
              .from('tbl_user_activity_logs')
              .insert({
                tual_user_id: authData.user.id,
                tual_activity_type: 'login',
                tual_ip_address: 'unknown',
                tual_user_agent: navigator.userAgent,
                tual_login_time: new Date().toISOString()
              }),
            8000,
            'Login activity insert'
          );
          console.log('✅ Login activity logged');
        } catch (logError) {
          console.warn('Failed to log login activity:', logError);
        }
      })();

      void (async () => {
        try {
          console.log('🔍 Fetching user profile after login...');
          await withTimeout(fetchUserData(authData.user.id), 15000, 'Fetch user data');
          console.log('✅ User profile loaded');
        } catch (fetchError) {
          console.warn('Failed to fetch user data after login:', fetchError);
        }
      })();

      notification.showSuccess('Login Successful!', 'Welcome back!');
      console.log('🎉 Login flow completed successfully');

    } catch (error: any) {
      console.error('❌ Login error:', error);
      const errorMessage = error?.message || 'Login failed';
      notification.showError('Login Failed', errorMessage);

      // Clear any partial session data on error
      sessionManager.removeSession();
      setUser(null);

      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData: any, userType: string) => {
    setLoading(true);
    try {
      console.log('🔍 Attempting registration for:', JSON.stringify(userData));

      // Clear any existing session data first
      sessionManager.removeSession();
      await supabase.auth.signOut();

      // Register with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          emailRedirectTo: undefined // Disable email confirmation for demo
        }
      });

      if (authError) {
        console.error('Supabase auth error:', authError);
        throw new Error(authError.message);
      }

      if (!authData.user) {
        console.error('No user data returned from Supabase');
        throw new Error('Registration failed');
      }

      console.log('✅ Supabase auth successful, user ID:', authData.user.id);

      // Save session immediately if available
      if (authData.session) {
        console.log('💾 Saving session to sessionStorage');
        sessionManager.saveSession(authData.session);
      }

      // Use the appropriate registration function based on user type
      if (userType === 'customer') {
        console.log('📝 Registering customer profile...');
        const { data, error: regError } = await supabase.rpc('register_customer', {
          p_user_id: authData.user.id,
          p_email: userData.email,
          p_first_name: userData.firstName,
          p_last_name: userData.lastName,
          p_username: userData.userName,
          p_mobile: userData.mobile,
          p_gender: userData.gender,
          p_parent_account: userData.parentAccount,
        });

        console.log('user profile data: ', data);

        if (regError) {
          console.error('Customer registration error:', regError);
          throw new Error(regError.message);
        }

        // Direct parent relationship only (no MLM tree placement)

      } else if (userType === 'company') {
        console.log('📝 Registering company profile...');
        const { error: regError } = await supabase.rpc('register_company', {
          p_user_id: authData.user.id,
          p_email: userData.email,
          p_company_name: userData.companyName,
          p_brand_name: userData.brandName,
          p_business_type: userData.businessType,
          p_business_category: userData.businessCategory,
          p_registration_number: userData.registrationNumber,
          p_gstin: userData.gstin,
          p_website_url: userData.websiteUrl,
          p_official_email: userData.email,
          p_affiliate_code: userData.affiliateCode
        });

        if (regError) {
          console.error('Company registration error:', regError);
          throw new Error(regError.message);
        }
      }

      // Registration should not fail if activity logging is unavailable.
      try {
        const { error: activityLogError } = await supabase
          .from('tbl_user_activity_logs')
          .insert({
            tual_user_id: authData.user.id,
            tual_activity_type: 'registration',
            tual_ip_address: 'unknown',
            tual_user_agent: navigator.userAgent,
            tual_login_time: new Date().toISOString()
          });

        if (activityLogError) {
          console.warn('Failed to log registration activity:', activityLogError);
        }
      } catch (activityLogError) {
        console.warn('Failed to log registration activity:', activityLogError);
      }

      console.log('✅ Registration completed successfully');
      notification.showSuccess('Registration Successful!', 'Your account has been created successfully.');

      // Fetch user data immediately after successful registration
      if (authData.session) {
        await fetchUserData(authData.user.id);
      }

      return authData.user.id;

    } catch (error: any) {
      console.error('❌ Registration failed:', error);
      const errorMessage = error?.message || 'Registration failed';
      notification.showError('Registration Failed', errorMessage);

      // Clear any partial session data on error
      sessionManager.removeSession();
      setUser(null);

      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        throw new Error(error.message);
      }

      notification.showSuccess('Reset Email Sent', 'Please check your email for password reset instructions.');
    } catch (error: any) {
      notification.showError('Reset Failed', error?.message || 'Failed to send reset email');
      throw error;
    }
  };

  const resetPassword = async (token: string, password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        throw new Error(error.message);
      }

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

      console.log('🔍 Starting OTP verification for user:', user.id);
      const result = await verifyOTPAPI(user.id, otp, 'mobile');

      if (!result.success) {
        throw new Error(result.error || 'OTP verification failed');
      }

      console.log('✅ OTP verification successful');
      setUser({ ...user, mobileVerified: true });
      notification.showSuccess('Verification Successful', 'Mobile number verified successfully.');
    } catch (error: any) {
      console.error('❌ OTP verification failed:', error);
      notification.showError('Verification Failed', error?.message || 'Invalid OTP code');
      throw error;
    }
  };

  const sendOTPToUser = async (userId: string, contactInfo: string, otpType: 'email' | 'mobile') => {
    try {
      console.log('📤 Sending OTP to user:', { userId, contactInfo, otpType });

      // Validate inputs
      if (!userId || !contactInfo || !otpType) {
        throw new Error('Missing required information for OTP sending');
      }

      const result = await otpService.sendOTP(userId, contactInfo, otpType);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send OTP');
      }

      console.log('✅ OTP sent successfully');
      notification.showSuccess('OTP Sent', `Verification code sent to ${contactInfo}`);
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send OTP:', error);
      const errorMessage = error?.message || 'Failed to send OTP. Please try again.';
      notification.showError('Send Failed', errorMessage);
      throw error;
    }
  };

  const checkVerificationStatus = useCallback(async (userId: string) => {
    try {
      console.log('🔍 Checking verification status for user:', userId);

      // Use authenticated supabase client
      const { data: userData, error: userError } = await withTimeout(
        supabase
          .from('tbl_users')
          .select('tu_email_verified, tu_mobile_verified, tu_is_verified')
          .eq('tu_id', userId)
          .maybeSingle(),
        8000,
        'Fetch user verification'
      );

      if (userError) {
        console.warn('Could not fetch user verification status:', userError);
        return { needsVerification: false, settings: null };
      }

      // Get system settings with authenticated client
      const { data: settingsData } = await withTimeout(
        supabase
          .from('tbl_system_settings')
          .select('tss_setting_key, tss_setting_value')
          .in('tss_setting_key', [
            'email_verification_required',
            'mobile_verification_required',
            'either_verification_required'
          ]),
        8000,
        'Fetch verification settings'
      );

      const settings = settingsData?.reduce((acc: any, setting: any) => {
        try {
          acc[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value);
        } catch {
          acc[setting.tss_setting_key] = setting.tss_setting_value;
        }
        return acc;
      }, {}) || {};

      const emailRequired = settings.email_verification_required || false;
      const mobileRequired = settings.mobile_verification_required || false;
      const eitherRequired = settings.either_verification_required || false;

      let needsVerification = false;

      if (eitherRequired) {
        // For either verification, user needs at least one verified
        needsVerification = !userData.tu_email_verified && !userData.tu_mobile_verified;
      } else {
        // Check individual requirements
        if (emailRequired && !userData.tu_email_verified) {
          needsVerification = true;
        }
        if (mobileRequired && !userData.tu_mobile_verified) {
          needsVerification = true;
        }
      }

      console.log('📋 Verification check result:', {
        emailVerified: userData.tu_email_verified,
        mobileVerified: userData.tu_mobile_verified,
        isVerified: userData.tu_is_verified,
        emailRequired,
        mobileRequired,
        eitherRequired,
        needsVerification
      });

      return {
        needsVerification,
        settings: {
          emailVerificationRequired: emailRequired,
          mobileVerificationRequired: mobileRequired,
          eitherVerificationRequired: eitherRequired
        }
      };
    } catch (error) {
      console.error('Error checking verification status:', error);
      return { needsVerification: false, settings: null };
    }
  }, []);

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
