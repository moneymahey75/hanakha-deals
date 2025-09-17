import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, supabaseBatch, sessionManager, addUserToMLMTree } from '../lib/supabase';
import { OTPService } from '../services/otpService';
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

  useEffect(() => {
    // Initialize session from sessionStorage
    const initializeSession = async () => {
      if (isInitialized) return; // Prevent multiple initializations

      setLoading(true);
      try {
        console.log('🔍 Initializing authentication...');

        // First, check if there's an existing Supabase session
        const { data: { session: existingSession } } = await supabase.auth.getSession();

        if (existingSession?.user) {
          console.log('✅ Found existing Supabase session:', existingSession.user.id);
          // Save to sessionStorage if not already saved
          sessionManager.saveSession(existingSession);
          await fetchUserData(existingSession.user.id);
        } else {
          // Try to restore from sessionStorage
          console.log('🔍 Checking sessionStorage for saved session...');
          const restoredSession = await sessionManager.restoreSession();

          if (restoredSession?.user) {
            console.log('✅ Session restored from sessionStorage:', restoredSession.user.id);
            await fetchUserData(restoredSession.user.id);
          } else {
            console.log('ℹ️ No existing session found');
            setUser(null);
          }
        }
      } catch (error) {
        console.error('❌ Failed to initialize session:', error);
        // Clear any corrupted session data
        sessionManager.removeSession();
        setUser(null);
      } finally {
        setLoading(false);
        setIsInitialized(true);
      }
    };

    initializeSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isInitialized) return; // Don't process auth changes until initialized

      console.log('🔄 Auth state change:', event, session?.user?.id);

      try {
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('✅ User signed in, saving session');
          sessionManager.saveSession(session);
          await fetchUserData(session.user.id);
        } else if (event === 'SIGNED_OUT' || !session) {
          console.log('👋 User signed out, clearing session');
          const currentUserId = user?.id;
          sessionManager.removeSession(currentUserId);
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          console.log('🔄 Token refreshed, updating session');
          sessionManager.saveSession(session);
          // Optionally refresh user data if needed
          if (!user || user.id !== session.user.id) {
            await fetchUserData(session.user.id);
          }
        }
      } catch (error) {
        console.error('❌ Error handling auth state change:', error);
        sessionManager.removeSession();
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [isInitialized, user?.id]);

  const fetchUserData = async (userId: string) => {
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
        // Use a single query with joins to reduce connection usage
        const { data: combinedData, error: combinedError } = await supabaseBatch
          .from('tbl_users')
          .select(`
            *,
            tbl_user_profiles(*),
            tbl_companies(*),
            tbl_user_subscriptions!inner(
              tus_status,
              tus_end_date
            )
          `)
          .eq('tu_id', userId)
          .eq('tbl_user_subscriptions.tus_status', 'active')
          .gte('tbl_user_subscriptions.tus_end_date', new Date().toISOString())
          .maybeSingle();

        if (combinedError) {
          console.log('⚠️ Combined query failed, falling back to individual queries:', combinedError.message);
          
          // Fallback to individual queries
          const { data: userDataArray, error: userError } = await supabase
            .from('tbl_users')
            .select('*')
            .eq('tu_id', userId);

          if (userError) {
            console.log('⚠️ RLS blocking users table access:', userError.message);
          } else if (userDataArray && userDataArray.length > 0) {
            userData = userDataArray[0];
          }
        } else if (combinedData) {
          userData = combinedData;
          profileData = combinedData.tbl_user_profiles?.[0];
          companyData = combinedData.tbl_companies?.[0];
          subscriptionData = combinedData.tbl_user_subscriptions?.[0];
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

      if (!companyData && userData?.tu_user_type === 'company') {
        try {
          const { data: companyDataArray } = await supabase
            .from('tbl_companies')
            .select('*')
            .eq('tc_user_id', userId);
          console.log('🏢 Company data retrieved:', companyDataArray?.length || 0, 'records');
          companyData = companyDataArray?.[0];
        } catch (companyRlsError) {
          console.warn('RLS blocking companies table:', companyRlsError);
        }
      }

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

      const user: User = {
        id: userId,
        email: session?.user?.email || userData?.tu_email || 'unknown@example.com',
        firstName: profileData?.tup_first_name,
        lastName: profileData?.tup_last_name,
        companyName: companyData?.tc_company_name,
        userType: userData?.tu_user_type || 'customer',
        sponsorshipNumber: profileData?.tup_sponsorship_number,
        parentId: profileData?.tup_parent_account,
        isVerified: userData?.tu_is_verified || false,
        hasActiveSubscription: !!subscriptionData, // Check if user has active subscription
        mobileVerified: userData?.tu_mobile_verified || false
      };

      console.log('✅ User data compiled:', {
        ...user,
        hasActiveSubscription: !!subscriptionData,
        subscriptionFound: !!subscriptionData
      });
      setUser(user);
    } catch (error) {
      console.error('❌ Error fetching user data:', error);
      // Don't throw error, just set user to null
      setUser(null);
    }
  };

  const login = async (emailOrUsername: string, password: string, userType: string) => {
    setLoading(true);
    try {
      console.log('🔍 Attempting login for:', emailOrUsername);

      // Clear any existing session data first
      console.log('🧹 Clearing existing session data...');
      sessionManager.removeSession();
      await supabase.auth.signOut();
      setUser(null);

      // Small delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Determine if input is email or username
      const isEmail = emailOrUsername.includes('@');
      let actualEmail = emailOrUsername;

      // If username provided, get the email from user_profiles
      if (!isEmail) {
        const { data: profileData, error: profileError } = await supabase
            .from('tbl_user_profiles')
            .select('tup_user_id, tbl_users!inner(tu_email)')
            .eq('tup_username', emailOrUsername)
            .single();

        if (profileError || !profileData) {
          throw new Error('Username not found');
        }
        actualEmail = profileData.tbl_users.tu_email;
      }

      // Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: actualEmail,
        password: password
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user || !authData.session) {
        throw new Error('Authentication failed - no session created');
      }

      // Explicitly save the session
      console.log('💾 Saving session after login...');
      sessionManager.saveSession(authData.session);

      // Log login activity
      try {
        await supabase
            .from('tbl_user_activity_logs')
            .insert({
              tual_user_id: authData.user.id,
              tual_activity_type: 'login',
              tual_ip_address: 'unknown',
              tual_user_agent: navigator.userAgent,
              tual_login_time: new Date().toISOString()
            });
      } catch (logError) {
        console.warn('Failed to log login activity:', logError);
      }

      // Fetch user data explicitly
      await fetchUserData(authData.user.id);

      notification.showSuccess('Login Successful!', 'Welcome back!');

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
      console.log('🔍 Attempting registration for:', userData.email);

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
        const { error: regError } = await supabase.rpc('register_customer', {
          p_user_id: authData.user.id,
          p_email: userData.email,
          p_first_name: userData.firstName,
          p_last_name: userData.lastName,
          p_username: userData.userName,
          p_mobile: userData.mobile,
          p_gender: userData.gender,
          p_parent_account: userData.parentAccount
        });

        if (regError) {
          console.error('Customer registration error:', regError);
          throw new Error(regError.message);
        }

        // Add user to MLM tree if parent account is provided
        if (userData.parentAccount) {
          try {
            console.log('🌳 Adding user to MLM tree with sponsor:', userData.parentAccount);

            const { data: profileData, error: profileError } = await supabase
                .from('tbl_user_profiles')
                .select('tup_sponsorship_number')
                .eq('tup_user_id', authData.user.id)
                .single();

            if (profileError) {
              console.error('❌ Could not get sponsorship number for MLM tree placement:', profileError);
              throw profileError;
            }

            if (profileData?.tup_sponsorship_number) {
              const treeResult = await addUserToMLMTree(
                  authData.user.id,
                  profileData.tup_sponsorship_number,
                  userData.parentAccount
              );

              if (treeResult?.success) {
                console.log('✅ MLM tree placement successful');
              } else {
                console.error('❌ MLM tree placement failed:', treeResult);
                throw new Error(treeResult?.error || 'MLM tree placement failed');
              }
            }
          } catch (treeError) {
            console.error('❌ MLM tree placement failed:', treeError);
            console.warn('⚠️ Registration completed but MLM tree placement failed');
          }
        }
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

      // Log registration activity
      await supabase
          .from('tbl_user_activity_logs')
          .insert({
            tual_user_id: authData.user.id,
            tual_activity_type: 'registration',
            tual_ip_address: 'unknown',
            tual_user_agent: navigator.userAgent,
            tual_login_time: new Date().toISOString()
          });

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

  const logout = () => {
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

  const checkVerificationStatus = async (userId: string) => {
    try {
      console.log('🔍 Checking verification status for user:', userId);
      
      // Optimize verification status check with single query
      const { data: userData, error: userError } = await supabaseBatch
        .from('tbl_users')
        .select('tu_email_verified, tu_mobile_verified, tu_is_verified')
        .eq('tu_id', userId)
        .maybeSingle();

      if (userError) {
        console.warn('Could not fetch user verification status:', userError);
        return { needsVerification: false, settings: null };
      }

      // Get system settings with caching
      const { data: settingsData } = await supabaseBatch
        .from('tbl_system_settings')
        .select('tss_setting_key, tss_setting_value')
        .in('tss_setting_key', [
          'email_verification_required',
          'mobile_verification_required', 
          'either_verification_required'
        ]);

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