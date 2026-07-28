import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  registrationPaid?: boolean;
  currentPlanPhase?: 'prelaunch' | 'launch';
  emailVerified: boolean;
  mobileVerified: boolean;
  profileLoaded?: boolean;
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
  checkVerificationStatus: (userId: string) => Promise<{
    needsVerification: boolean;
    emailVerified?: boolean;
    mobileVerified?: boolean;
    settings: any;
  }>;
  loading: boolean;
  userDataLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PORTAL_USER_TYPES: User['userType'][] = ['customer', 'company'];

const formatUserType = (userType: string) => userType.charAt(0).toUpperCase() + userType.slice(1);

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
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [otpService] = useState(() => OTPService.getInstance());
  const userLoadSequenceRef = useRef(0);
  const notification = useNotification();
  const withTimeout = useCallback(async <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
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
  }, []);

  const fetchUserData = useCallback(async (userId: string) => {
    if (!userId) {
      return;
    }

    const loadSequence = ++userLoadSequenceRef.current;
    setUserDataLoading(true);

    try {
      // Optimize user data fetching with single query using joins
      let userData = null;
      let profileData = null;
      let companyData = null;
      let subscriptionData = null;
      let activePlanPhase: 'prelaunch' | 'launch' = 'prelaunch';

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

        if (!userError && userWithProfile) {
          userData = userWithProfile;
          profileData = userWithProfile.tbl_user_profiles?.[0];
        }
      } catch (rlsError) {
      }

      // Only fetch additional data if not already retrieved from combined query
      if (!profileData) {
        try {
          const { data: profileDataArray } = await supabase
              .from('tbl_user_profiles')
              .select('*')
              .eq('tup_user_id', userId);
          profileData = profileDataArray?.[0];
        } catch (profileRlsError) {
        }
      }

      // if (!companyData && userData?.tu_user_type === 'company') {
      //   try {
      //     const { data: companyDataArray } = await supabase
      //       .from('tbl_companies')
      //       .select('*')
      //       .eq('tc_user_id', userId);
      //     companyData = companyDataArray?.[0];
      //   } catch (companyRlsError) {
      //   }
      // }

      if (!subscriptionData) {
        try {
          const { data: subscriptionDataArray } = await supabase
              .from('tbl_user_subscriptions')
              .select('*, plan:tus_plan_id(tsp_plan_phase, tsp_type)')
              .eq('tus_user_id', userId)
              .eq('tus_status', 'active')
              .or(`tus_end_date.is.null,tus_end_date.gt.${new Date().toISOString()}`);
          subscriptionData = subscriptionDataArray?.[0];
          const launchSubscription = subscriptionDataArray?.find((row: any) =>
            String(row?.plan?.tsp_plan_phase || row?.tus_plan_phase || '').toLowerCase() === 'launch'
          );
          activePlanPhase = launchSubscription ? 'launch' : 'prelaunch';
        } catch (subscriptionRlsError) {
        }
      }

      // Get current session to get email
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || session.user.id !== userId || loadSequence !== userLoadSequenceRef.current) {
        return;
      }

      // Ensure we have at least minimal user data
      if (!userData && !profileData) {
        throw new Error('User data not found');
      }

      if (userData?.tu_is_active === false && sessionStorage.getItem('session_type') !== 'admin_impersonation') {
        userLoadSequenceRef.current += 1;
        sessionManager.removeSession(userId);
        sessionStorage.removeItem('session_type');
        sessionStorage.removeItem('last_customer_route');
        localStorage.removeItem('last_customer_route');
        await supabase.auth.signOut();
        setUser(null);
        notification.showError('Account Disabled', 'Your account has been disabled. Please contact support.');
        return;
      }

      const registrationPaid = userData?.tu_registration_paid === true;

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
        registrationPaid,
        currentPlanPhase: (userData?.tu_current_plan_phase === 'launch' || activePlanPhase === 'launch') ? 'launch' : 'prelaunch',
        emailVerified: userData?.tu_email_verified || false,
        mobileVerified: userData?.tu_mobile_verified || false,
        profileLoaded: true
      };

      // Mark session as customer type when user data is loaded
      sessionStorage.setItem('session_type', 'customer');
      if (loadSequence === userLoadSequenceRef.current) {
        setUser(user);
      }
    } catch {
      // Non-fatal: keep existing user state to avoid auth flicker/redirect loops.
      if (loadSequence === userLoadSequenceRef.current) {
        setUser((prev) => {
          if (!prev) return null;
          if (prev.id && prev.id !== userId) return null;
          return prev;
        });
      }
    } finally {
      if (loadSequence === userLoadSequenceRef.current) {
        setUserDataLoading(false);
      }
    }
  }, []);

  const safeFetchUserData = useCallback(async (userId: string, label: string) => {
    try {
      await withTimeout(fetchUserData(userId), 20000, label);
    } catch {
      // Non-fatal: a slow DB/RPC should not log the user out or cause route guards to redirect.
    }
  }, [fetchUserData, withTimeout]);

  const logout = useCallback(() => {
    userLoadSequenceRef.current += 1;
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
            .then(() => {});
      }

      // Clear all session data
      sessionStorage.setItem('customer_logout_in_progress', 'true');
      sessionManager.removeSession(currentUserId);
      sessionStorage.removeItem('session_type');
      sessionStorage.removeItem('admin_impersonation_customer_id');
      sessionStorage.removeItem('last_customer_route');
      localStorage.removeItem('last_customer_route');
      sessionStorage.removeItem('registration_payment_recovery_attempt');
      localStorage.removeItem('registration_payment_recovery_attempt');
      sessionStorage.removeItem('registration_payment_pending_tx');
      localStorage.removeItem('registration_payment_pending_tx');

      // Sign out from Supabase
      supabase.auth.signOut();

      // Clear user state
      setUser(null);

      notification.showInfo('Logged Out', 'You have been successfully logged out.');
    } catch {
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
        const sessionType = sessionStorage.getItem('session_type');
        if (sessionType === 'admin') {
          if (mounted) setUser(null);
          return;
        }

        const { data: { session: existingSession } } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'Initial getSession'
        );

        if (existingSession?.user) {
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
              userLoadSequenceRef.current += 1;
              sessionStorage.removeItem('session_type');
              await supabase.auth.signOut();
              if (mounted) setUser(null);
            } else {
              sessionManager.saveSession(existingSession);
              await safeFetchUserData(existingSession.user.id, 'Initial user data load');
            }
          } catch {
            sessionManager.saveSession(existingSession);
            await safeFetchUserData(existingSession.user.id, 'Initial user data load');
          }
        } else {
          const restoredSession = await withTimeout(
            sessionManager.restoreSession(),
            10000,
            'Restore saved session'
          );

          if (restoredSession?.user) {
            await safeFetchUserData(restoredSession.user.id, 'Restored user data load');
          } else if (mounted) {
            setUser(null);
          }
        }
      } catch {
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
  }, [fetchUserData, isInitialized, safeFetchUserData, withTimeout]);

  useEffect(() => {
    if (!isInitialized) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (event === 'SIGNED_IN' && session?.user) {
          sessionManager.saveSession(session);
          // Non-blocking; avoid timeouts causing auth flicker.
          void safeFetchUserData(session.user.id, 'Auth change user load');
        } else if (event === 'SIGNED_OUT') {
          userLoadSequenceRef.current += 1;
          sessionManager.removeSession(user?.id);
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          sessionManager.saveSession(session);
          if (!user || user.id !== session.user.id) {
            void safeFetchUserData(session.user.id, 'Token refresh user load');
          }
        }
      } catch {
        // Non-fatal: do not clear session or force logout on transient errors.
      }
    });

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !user) return;

      try {
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          'Visibility getSession'
        );

        if (error) {
          return;
        }

        if (session?.user) {
          sessionManager.saveSession(session);
          return;
        }

        const restoredSession = await withTimeout(
          sessionManager.restoreSession(),
          10000,
          'Visibility restore session'
        );

        if (restoredSession?.user) {
          sessionManager.saveSession(restoredSession);
          if (restoredSession.user.id !== user.id) {
            void safeFetchUserData(restoredSession.user.id, 'Visibility user reload');
          }
          return;
        }

        logout();
      } catch {
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUserData, isInitialized, logout, safeFetchUserData, user, withTimeout]);

  const login = async (emailOrUsername: string, password: string, userType: string) => {
    setLoading(true);
    try {
      // Clear any existing session data first (including admin sessions)
      userLoadSequenceRef.current += 1;
      sessionStorage.removeItem('session_type');
      sessionStorage.removeItem('admin_session_token');
      adminSessionManager.removeSession();
      sessionManager.removeSession();
      
      // Check if there's actually an active Supabase session before signing out
      let hasActiveSession = false;
      try {
        const { data: { session: activeSession } } = await withTimeout(
          supabase.auth.getSession(),
          3000,
          'Get session check'
        );
        hasActiveSession = !!activeSession;
      } catch {
        hasActiveSession = false;
      }
      
      if (hasActiveSession) {
        try {
          await withTimeout(supabase.auth.signOut(), 5000, 'Supabase sign-out');
        } catch {
        }
      }
      setUser(null);

      // Longer delay to ensure auth state is reset and ready for fresh login
      await new Promise(resolve => setTimeout(resolve, 800));

      // Determine if input is email or username
      const isEmail = emailOrUsername.includes('@');
      let actualEmail = emailOrUsername;

      // If username/sponsor id provided, resolve the email using RPC
      if (!isEmail) {
        const handle = String(emailOrUsername || '').trim();

        const { data: usernameData, error: usernameError } = await supabase
          .rpc('get_email_by_username', { p_username: handle });

        if (!usernameError && usernameData && usernameData.length > 0) {
          actualEmail = usernameData[0].email;
        } else {
          const { data: sponsorData, error: sponsorError } = await supabase
            .rpc('get_email_by_sponsorship', { p_sponsorship: handle });

          if (sponsorError || !sponsorData || sponsorData.length === 0) {
            throw new Error('Username or Sponsor ID not found');
          }

          actualEmail = sponsorData[0].email;
        }
      }

      // Authenticate with Supabase (with extended timeout for network issues)
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: actualEmail,
          password: password
        }),
        20000,
        'Supabase sign-in'
      );

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user || !authData.session) {
        throw new Error('Authentication failed - no session created');
      }

      const expectedUserType = PORTAL_USER_TYPES.includes(userType as User['userType'])
        ? (userType as User['userType'])
        : null;

      if (expectedUserType) {
        const { data: accountData, error: accountError } = await withTimeout(
          supabase
            .from('tbl_users')
            .select('tu_user_type, tu_is_active')
            .eq('tu_id', authData.user.id)
            .maybeSingle(),
          8000,
          'Verify account type'
        );

        if (accountError || !accountData?.tu_user_type) {
          await supabase.auth.signOut();
          throw new Error('Unable to verify account type. Please try again.');
        }

        if (accountData.tu_user_type !== expectedUserType) {
          await supabase.auth.signOut();
          throw new Error(
            `${formatUserType(expectedUserType)} login is only for ${expectedUserType} accounts.`
          );
        }

        if (accountData.tu_is_active === false) {
          userLoadSequenceRef.current += 1;
          sessionManager.removeSession(authData.user.id);
          sessionStorage.removeItem('session_type');
          sessionStorage.removeItem('admin_impersonation_customer_id');
          sessionStorage.removeItem('last_customer_route');
          localStorage.removeItem('last_customer_route');
          await supabase.auth.signOut();
          setUser(null);
          throw new Error('Your account has been disabled. Please contact support.');
        }
      }

      // Explicitly save the session
      sessionManager.saveSession(authData.session);

      // Mark session type as customer
      sessionStorage.removeItem('customer_logout_in_progress');
      sessionStorage.setItem('session_type', 'customer');

      // Set a minimal user immediately to avoid login hanging on slow DB calls
      const minimalUser: User = {
        id: authData.user.id,
        email: authData.user.email || actualEmail,
        userType: (userType as User['userType']) || 'customer',
        isVerified: false,
        hasActiveSubscription: false,
        registrationPaid: false,
        currentPlanPhase: 'prelaunch',
        emailVerified: false,
        mobileVerified: false,
        profileLoaded: false
      };
      setUser(minimalUser);

      // Fire-and-forget: log activity and fetch full profile
      void (async () => {
        try {
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
        } catch {
        }
      })();

      void (async () => {
        try {
          await withTimeout(fetchUserData(authData.user.id), 15000, 'Fetch user data');
        } catch {
        }
      })();

      notification.showSuccess('Login Successful!', 'Welcome back!');

    } catch (error: any) {
      const errorMessage = error?.message || 'Login failed';
      notification.showError('Login Failed', errorMessage);

      // Clear any partial session data on error
      userLoadSequenceRef.current += 1;
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
      // Clear any existing session data first
      userLoadSequenceRef.current += 1;
      sessionManager.removeSession();
      await supabase.auth.signOut();

      // Register with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          emailRedirectTo: undefined, // Disable email confirmation for demo
          data: userType === 'customer'
            ? {
              user_type: 'customer',
              first_name: userData.firstName,
              last_name: userData.lastName,
              username: userData.userName,
              mobile: userData.mobile,
              gender: userData.gender,
              parent_account: userData.parentAccount
            }
            : {
              user_type: userType
            }
        }
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Registration failed');
      }

      // Save session immediately if available
      if (authData.session) {
        sessionStorage.removeItem('customer_logout_in_progress');
        sessionManager.saveSession(authData.session);
      }

      // Use the appropriate registration function based on user type
      if (userType === 'customer') {

      } else if (userType === 'company') {
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
        }
      } catch {
      }

      notification.showSuccess('Registration Successful!', 'Your account has been created successfully.');

      // Fetch user data immediately after successful registration
      if (authData.session) {
        await fetchUserData(authData.user.id);
      }

      return authData.user.id;

    } catch (error: any) {
      const errorMessage = error?.message || 'Registration failed';
      notification.showError('Registration Failed', errorMessage);

      // Clear any partial session data on error
      userLoadSequenceRef.current += 1;
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

      const result = await verifyOTPAPI(user.id, otp, 'mobile');

      if (!result.success) {
        throw new Error(result.error || 'OTP verification failed');
      }

      setUser({ ...user, mobileVerified: true });
      notification.showSuccess('Verification Successful', 'Mobile number verified successfully.');
    } catch (error: any) {
      notification.showError('Verification Failed', error?.message || 'Invalid OTP code');
      throw error;
    }
  };

  const sendOTPToUser = async (userId: string, contactInfo: string, otpType: 'email' | 'mobile') => {
    try {
      // Validate inputs
      if (!userId || !contactInfo || !otpType) {
        throw new Error('Missing required information for OTP sending');
      }

      const result = await otpService.sendOTP(userId, contactInfo, otpType);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send OTP');
      }

      const contactDisplay = otpType === 'mobile'
        ? contactInfo.replace(/(.{3}).*(.{4})/, '$1***$2')
        : contactInfo.replace(/(.{3}).*(@.*)/, '$1***$2');
      notification.showSuccess('OTP Sent', `Verification code sent to ${contactDisplay}`);
      return result;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to send OTP. Please try again.';
      notification.showError('Send Failed', errorMessage);
      throw error;
    }
  };

  const checkVerificationStatus = useCallback(async (userId: string) => {
    try {
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
      const emailVerified = userData.tu_email_verified === true;
      const mobileVerified = userData.tu_mobile_verified === true;
      const needsVerification = eitherRequired
        ? !emailVerified && !mobileVerified
        : (emailRequired && !emailVerified) || (mobileRequired && !mobileVerified);

      return {
        needsVerification,
        emailVerified,
        mobileVerified,
        settings: {
          emailVerificationRequired: emailRequired,
          mobileVerificationRequired: mobileRequired,
          eitherVerificationRequired: eitherRequired
        }
      };
    } catch {
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
    loading,
    userDataLoading
  };

  return (
      <AuthContext.Provider value={value}>
        {children}
      </AuthContext.Provider>
  );
};
