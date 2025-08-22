import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { sessionUtils } from '../../utils/sessionUtils';

interface ProtectedRouteProps {
  children: React.ReactNode;
  userType: 'customer' | 'company' | 'admin';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, userType }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Additional session check when route changes
    const checkSession = async () => {
      setIsChecking(true);

      try {
        // Wait a bit for auth context to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check if we have a valid session
        const sessionInfo = sessionUtils.getSessionInfo();

        if (!sessionInfo.isValid && !loading) {
          console.log('🔒 No valid session found in ProtectedRoute');
          // Session will be cleared by sessionUtils, no need to clear here
        }
      } catch (error) {
        console.error('❌ Error checking session in ProtectedRoute:', error);
      } finally {
        setIsChecking(false);
      }
    };

    checkSession();
  }, [location.pathname, loading]);

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
    console.log('🔒 No user found, redirecting to login');
    // Clear any stale session data
    sessionUtils.clearAllSessions();
    return <Navigate to={`/${userType}/login`} replace state={{ from: location }} />;
  }

  // Check if user type matches the required type
  if (user.userType !== userType) {
    console.log('🔒 User type mismatch, redirecting to home');
    return <Navigate to="/" replace />;
  }

  // Additional session validity check
  const sessionInfo = sessionUtils.getSessionInfo();
  if (!sessionInfo.isValid) {
    console.log('🔒 Invalid session detected, redirecting to login');
    sessionUtils.clearAllSessions();
    return <Navigate to={`/${userType}/login`} replace state={{ from: location }} />;
  }

  // Check if user has active subscription (mandatory for all authenticated pages except payment)
  if (user.userType !== 'admin' && !user.hasActiveSubscription) {
    // Allow access to payment and subscription-plans pages only
    if (location.pathname !== '/payment' && 
        location.pathname !== '/subscription-plans' && 
        !location.pathname.startsWith('/verify-otp')) {
      console.log('🔒 No active subscription, redirecting to payment');
      return <Navigate to="/subscription-plans" replace state={{ from: location, requiresSubscription: true }} />;
    }
  }

  // All checks passed, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;