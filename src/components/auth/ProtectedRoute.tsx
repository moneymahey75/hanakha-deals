import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../../contexts/AdminContext';
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
  const { user, loading, userDataLoading, checkVerificationStatus } = useAuth();
  const { settings } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    needsVerification: boolean;
    settings: any;
  } | null>(null);

  useEffect(() => {
    // Skip the expensive live session + verification check while auth context is still loading,
    // or when we already have a user (saves a round-trip and prevents isChecking=true flicker
    // that can interrupt in-progress payment flows).
    if (loading) {
      // Auth context is still initialising — wait for it.
      return;
    }

    const checkSession = async () => {
      setIsChecking(true);

      try {
        const sessionInfo = sessionUtils.getSessionInfo();

        if (sessionInfo.isValid) {
          setHasValidSession(true);
        } else if (!user) {
          // Only do the expensive live check when we have no cached session AND no user.
          console.log('🔍 Cached session is invalid and no user, checking live Supabase session');
          try {
            const sessionResult = await Promise.race([
              supabase.auth.getSession(),
              new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error('ProtectedRoute session check timed out')), 8000);
              })
            ]);

            let liveSession = sessionResult.data.session;

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
        } else {
          // We have a user — trust that the session is valid without a round-trip.
          setHasValidSession(true);
        }

        // Only check verification status when required AND user exists.
        // Skip for pages that are always accessible without subscription (e.g. /registration-payment)
        // to avoid blocking payment flows with an extra network call.
        const skipVerificationPages = [
          '/registration-payment',
          '/registration-payment-success',
          '/payment',
          '/subscription-plans',
          '/verify-otp',
        ];
        const isSkipPage = skipVerificationPages.some(
          p => location.pathname === p || location.pathname.startsWith(p)
        );

        if (user && requiresVerification && !isSkipPage) {
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

  const hasCustomerAccess = user.hasActiveSubscription || Boolean((user as any).registrationPaid);

  if (
    requiresSubscription &&
    user.userType === 'customer' &&
    !hasCustomerAccess &&
    userDataLoading &&
    (user as any).profileLoaded === false
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading account...</p>
        </div>
      </div>
    );
  }

  // Check if user has paid access (mandatory for all authenticated pages except specific pages)
  if (requiresSubscription && user.userType !== 'admin' && !hasCustomerAccess) {
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
      const launchPhase = (settings?.launchPhase || 'prelaunch') as 'prelaunch' | 'launched';
      const customerDestination = launchPhase === 'launched' ? '/subscription-plans' : '/registration-payment';
      return (
          <Navigate
              to={user.userType === 'customer' ? customerDestination : '/subscription-plans'}
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
