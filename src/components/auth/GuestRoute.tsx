import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminAuth } from '../../contexts/AdminAuthContext';

interface GuestRouteProps {
  children: React.ReactNode;
}

const GuestRoute: React.FC<GuestRouteProps> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { admin, loading: adminLoading } = useAdminAuth();

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (admin) {
    return <Navigate to="/backpanel/dashboard" replace />;
  }

  if (user) {
    const redirectPath = user.userType === 'company' ? '/company/dashboard' : '/customer/dashboard';
    return <Navigate to={redirectPath} replace />;
  }

  return <>{children}</>;
};

export default GuestRoute;
