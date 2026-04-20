import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { sessionUtils } from '../../utils/sessionUtils';
import { supabase } from '../../lib/supabase';

interface ProtectedRouteProps {
  children: React.ReactNode;
  userType: 'customer' | 'company' | 'admin';
  requiresVerification?: boolean;
  requiresSubscription?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
                                                         children,
                                                         userType,
                                                         requiresVerification = true,
                                                         requiresSubscription = true
                                                       }) => {
  const { user, loading, checkVerificationStatus } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    needsVerification: boolean;
    settings: any;
  } | null>(null);

  useEffect(() => {
    // Additional session check when route changes
    const checkSession = async () => {
      setIsChecking(true);

      try {
        // Wait a bit for auth context to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        const sessionInfo = sessionUtils.getSessionInfo();
        let liveSession = null;

        if (sessionInfo.isValid) {
          setHasValidSession(true);
        }

        if (!sessionInfo.isValid && !loading) {
          console.log('🔍 Cached session is invalid, checking live Supabase session');
          try {
            const sessionResult = await Promise.race([
              supabase.auth.getSession(),
              new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error('ProtectedRoute session check timed out')), 8000);
              })
            ]);

            liveSession = sessionResult.data.session;

            if (!liveSession) {
              console.log('🔄 No live session, attempting restore');
              liveSession = await Promise.race([
                import('../../lib/supabase').then(({ sessionManager }) => sessionManager.restoreSession()),
                new Promise<never>((_, reject) => {
                  window.setTimeout(() => reject(new Error('ProtectedRoute session restore timed out')), 10000);
                })
              ]);
            }

            setHasValidSession(!!liveSession);
          } catch (error) {
            console.error('❌ Live session check failed in ProtectedRoute:', error);
            setHasValidSession(false);
          }
        }

        // If user exists and verification is required, check verification status
        if (user && requiresVerification) {
          console.log('🔍 Checking verification status for user:', user.id);
          const status = await Promise.race([
            checkVerificationStatus(user.id),
            new Promise<{ needsVerification: boolean; settings: any }>((resolve) => {
              window.setTimeout(() => resolve({ needsVerification: false, settings: null }), 10000);
            })
          ]);
          setVerificationStatus(status);
          console.log('📋 Verification status:', status);
        }
      } catch (error) {
        console.error('❌ Error checking session in ProtectedRoute:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkSession();
  }, [location.pathname, loading, user?.id, requiresVerification, checkVerificationStatus]);

  // Show loading spinner while checking authentication
  if (loading || isChecking) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
    );
  }

  // Check if user is authenticated
  if (!user) {
    // If we have a valid live session but user data hasn't hydrated yet, don't redirect.
    if (hasValidSession) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Restoring session...</p>
          </div>
        </div>
      );
    }

    console.log('🔒 No user found, redirecting to login');
    return <Navigate to={`/${userType}/login`} replace state={{ from: location }} />;
  }

  // Check if user type matches the required type
  if (user.userType !== userType) {
    console.log('🔒 User type mismatch, redirecting to home');
    return <Navigate to="/" replace />;
  }

  // Use the result of the route-level live session check instead of relying only on local cache.
  if (!hasValidSession) {
    console.log('🔒 Invalid session detected, redirecting to login');
    sessionUtils.clearAllSessions();
    return <Navigate to={`/${userType}/login`} replace state={{ from: location }} />;
  }

  // Check verification status if required
  if (requiresVerification && verificationStatus?.needsVerification) {
    // Allow access to verification page itself
    if (!location.pathname.startsWith('/verify-otp')) {
      console.log('🔐 User needs verification, redirecting to verify-otp');

      // Get user mobile number for verification
      const getUserMobile = async () => {
        try {
          const { data: profileData } = await supabase
              .from('tbl_user_profiles')
              .select('tup_mobile')
              .eq('tup_user_id', user.id)
            .maybeSingle();

          return profileData?.tup_mobile || '';
        } catch (error) {
          console.warn('Could not fetch user mobile:', error);
          return '';
        }
      };

      // Get mobile and redirect
      getUserMobile().then(mobile => {
        navigate('/verify-otp', {
          state: {
            userId: user.id,
            email: user.email,
            mobile: mobile,
            verificationSettings: {
              emailRequired: verificationStatus.settings?.emailVerificationRequired || false,
              mobileRequired: verificationStatus.settings?.mobileVerificationRequired || false,
              eitherRequired: verificationStatus.settings?.eitherVerificationRequired || false
            },
            from: location
          },
          replace: true
        });
      });

      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Redirecting to verification...</p>
            </div>
          </div>
      );
    }
  }

  // Check if user has active subscription (mandatory for all authenticated pages except specific pages)
  if (requiresSubscription && user.userType !== 'admin' && !user.hasActiveSubscription) {
    // Allow access to specific pages without subscription
    const allowedWithoutSubscription = [
      '/payment',
      '/subscription-plans',
      '/registration-payment',
      '/registration-payment-success',
      '/verify-otp'
    ];

    const isAllowedPage = allowedWithoutSubscription.some(path =>
        location.pathname === path || location.pathname.startsWith(path)
    );

    if (!isAllowedPage) {
      console.log('🔒 No active subscription, redirecting to subscription plans');
      return (
          <Navigate
              to={user.userType === 'customer' ? '/registration-payment' : '/subscription-plans'}
              replace
              state={{
                from: location,
                requiresSubscription: true,
                message: 'Please select a subscription plan to continue using our services.'
              }}
          />
      );
    }
  }

  // All checks passed, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;
