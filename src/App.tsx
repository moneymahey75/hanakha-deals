import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './components/ui/NotificationProvider';
import SessionWarning from './components/ui/SessionWarning';
import { MLMProvider } from './contexts/MLMContext';
import { AdminProvider } from './contexts/AdminContext';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import CustomerLogin from './pages/auth/CustomerLogin';
import CustomerRegister from './pages/auth/CustomerRegister';
import CompanyLogin from './pages/auth/CompanyLogin';
import CompanyRegister from './pages/auth/CompanyRegister';
import CustomerDashboard from './pages/dashboard/CustomerDashboard';
import CompanyDashboard from './pages/dashboard/CompanyDashboard';
import BackpanelLogin from './pages/backpanel/AdminLogin';
import BackpanelDashboard from './pages/backpanel/AdminDashboard';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import AuthCallback from './pages/auth/AuthCallback';
import VerifyOTP from './pages/auth/VerifyOTP';
import SubscriptionPlans from './pages/SubscriptionPlans';
import Payment from './pages/Payment';
import ContactUs from './pages/ContactUs';
import AboutUs from './pages/AboutUs';
import SitePolicies from './pages/SitePolicies';
import FAQ from './pages/FAQ';
import JoinAsCustomer from './pages/JoinAsCustomer';
import JoinAsCompany from './pages/JoinAsCompany';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminProtectedRoute from './components/auth/AdminProtectedRoute';

// Scroll to top component
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Smooth scroll to top when route changes
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth'
    });
  }, [pathname]);

  return null;
}

function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <SessionWarning />
        <MLMProvider>
          <AdminProvider>
            <AdminAuthProvider>
              <Router>
                <div className="min-h-screen bg-gray-50">
                  <ScrollToTop />
                  <Routes>
                    {/* Backpanel Routes (No Navbar/Footer) */}
                    <Route path="/backpanel/login" element={<BackpanelLogin />} />
                    <Route path="/backpanel/dashboard" element={
                      <AdminProtectedRoute>
                        <BackpanelDashboard />
                      </AdminProtectedRoute>
                    } />
                    
                    {/* Main App Routes (With Navbar/Footer) */}
                    <Route path="/*" element={
                      <>
                        <Navbar />
                        <main className="pt-16">
                          <Routes>
                            <Route path="/" element={<Home />} />
                            
                            {/* Static Pages */}
                            <Route path="/contact" element={<ContactUs />} />
                            <Route path="/about" element={<AboutUs />} />
                            <Route path="/policies" element={<SitePolicies />} />
                            <Route path="/faq" element={<FAQ />} />
                            <Route path="/join-customer" element={<JoinAsCustomer />} />
                            <Route path="/join-company" element={<JoinAsCompany />} />
                            
                            {/* Customer Routes */}
                            <Route path="/customer/login" element={<CustomerLogin />} />
                            <Route path="/customer/register" element={<CustomerRegister />} />
                            <Route path="/customer/dashboard" element={
                              <ProtectedRoute userType="customer">
                                <CustomerDashboard />
                              </ProtectedRoute>
                            } />
                            
                            {/* Company Routes */}
                            <Route path="/company/login" element={<CompanyLogin />} />
                            <Route path="/company/register" element={<CompanyRegister />} />
                            <Route path="/company/dashboard" element={
                              <ProtectedRoute userType="company">
                                <CompanyDashboard />
                              </ProtectedRoute>
                            } />
                            
                            {/* Shared Routes */}
                            <Route path="/forgot-password" element={<ForgotPassword />} />
                            <Route path="/reset-password" element={<ResetPassword />} />
                            <Route path="/auth/callback" element={<AuthCallback />} />
                            <Route path="/verify-otp" element={<VerifyOTP />} />
                            <Route path="/subscription-plans" element={
                              <ProtectedRoute userType="customer">
                                <SubscriptionPlans />
                              </ProtectedRoute>
                            } />
                            <Route path="/payment" element={
                              <ProtectedRoute userType="customer">
                                <Payment />
                              </ProtectedRoute>
                            } />
                            
                            <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
                        </main>
                        <Footer />
                      </>
                    } />
                  </Routes>
                </div>
              </Router>
            </AdminAuthProvider>
          </AdminProvider>
        </MLMProvider>
      </AuthProvider>
    </NotificationProvider>
  );
}

export default App;