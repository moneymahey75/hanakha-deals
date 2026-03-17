import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { adminSessionManager } from '../../lib/adminSupabase';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: {
    module: string;
    action: 'read' | 'write' | 'delete';
  };
}

const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({
                                                                   children,
                                                                   requiredPermission
                                                                 }) => {
  const { admin, loading, hasPermission } = useAdminAuth();

  if (loading) {
    console.log('⏳ AdminProtectedRoute loading', {
      has_admin_session: adminSessionManager.hasValidSession(),
      admin_present: !!admin
    });
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Validating admin session...</p>
          </div>
        </div>
    );
  }

  // Check if admin session exists in sessionStorage
  const hasAdminSession = adminSessionManager.hasValidSession();

  // Redirect if no valid session
  if (!admin) {
    console.log('🔒 No admin found, checking session:', {
      hasAdminSession,
      path: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    });

    // If no session, redirect to login
    if (!hasAdminSession) {
      console.log('🔒 No valid admin session, redirecting to login');
      return <Navigate to="/backpanel/login" replace />;
    }

    // If session exists but admin state not ready, show loading
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Restoring admin session...</p>
          </div>
        </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission.module as any, requiredPermission.action)) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to access this section.</p>
          </div>
        </div>
    );
  }

  return <>{children}</>;
};

export default AdminProtectedRoute;
