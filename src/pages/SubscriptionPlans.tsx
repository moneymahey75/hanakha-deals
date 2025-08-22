import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { Check, Star, Zap, DollarSign } from 'lucide-react';
const SubscriptionPlans: React.FC = () => {
  const { subscriptionPlans } = useAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();

  // If user is not authenticated, allow viewing but require login for selection
  if (!user) {
    // Show plans but require login for purchase
  }

  // If user already has active subscription, redirect to dashboard
  if (user && user.hasActiveSubscription) {
    const dashboardPath = user.userType === 'company' ? '/company/dashboard' : '/customer/dashboard';
    return <Navigate to={dashboardPath} replace />;
  }

  const handleSelectPlan = (planId: string) => {
    // If user not logged in, redirect to login first
    if (!user) {
      navigate('/customer/login', { state: { from: '/subscription-plans', selectedPlanId: planId } });
      return;
    }
    
    // If logged in, proceed to payment
    navigate('/payment', { state: { selectedPlanId: planId, fromPlanSelection: true } });
  };

  const activePlans = subscriptionPlans.filter(plan => plan.tsp_is_active);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {user ? 'Choose Your USDT Subscription Plan' : 'USDT Subscription Plans'}
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            {user 
              ? 'Select the perfect USDT subscription plan to start your MLM journey and unlock your earning potential.'
              : 'Explore our USDT subscription plans. Login to purchase and start your MLM journey.'
            }
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {activePlans.map((plan, index) => (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl shadow-xl p-8 relative ${
                index === 1 ? 'ring-4 ring-indigo-500 transform scale-105' : ''
              }`}
            >
              {index === 1 && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-indigo-500 text-white px-4 py-2 rounded-full text-sm font-semibold flex items-center space-x-1">
                    <Star className="h-4 w-4" />
                    <span>Most Popular</span>
                  </div>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.tsp_name}</h3>
                <div className="flex items-center justify-center mb-4">
                  <span className="text-4xl font-bold text-gray-900">{plan.tsp_price}</span>
                  <span className="text-2xl font-bold text-indigo-600 ml-2">USDT</span>
                  <span className="text-gray-600 ml-2">/{plan.tsp_duration_days} days</span>
                </div>
                <p className="text-gray-600">
                  Perfect for {plan.tsp_name.toLowerCase().includes('basic') ? 'beginners' : 'professionals'}
                </p>
              </div>

              <div className="space-y-4 mb-8">
                {plan.tsp_features.map((feature, featureIndex) => (
                  <div key={featureIndex} className="flex items-center space-x-3">
                    <div className="bg-green-100 rounded-full p-1">
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => handleSelectPlan(plan.id)}
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                  index === 1
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {user 
                  ? `Pay ${plan.tsp_price} USDT - Select ${plan.tsp_name}`
                  : `Select ${plan.tsp_name} - ${plan.tsp_price} USDT`
                }
              </button>
            </div>
          ))}
        </div>

        {activePlans.length === 0 && (
          <div className="text-center py-12">
            <div className="bg-yellow-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-yellow-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {user?.hasActiveSubscription ? 'Manage Your Plan' : 'Choose Your Subscription Plan'}
            </h3>
            <p className="text-gray-600">
              {user?.hasActiveSubscription 
                ? 'Your current subscription details and upgrade options.'
                : user 
                  ? 'You must select and pay for a subscription plan to access your dashboard and start your MLM journey.'
                  : 'Login to select and purchase a subscription plan to start your MLM journey.'
              }
            </p>
            {(!user || !user.hasActiveSubscription) && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-center space-x-2 text-blue-800">
                  <DollarSign className="h-5 w-5" />
                  <span className="font-semibold">All Payments in USDT (BEP-20)</span>
                </div>
                <p className="text-sm text-blue-700 mt-2">
                  {user 
                    ? 'Select a plan above and pay with USDT on BNB Smart Chain for instant activation.'
                    : 'Login first, then select a plan and pay with USDT on BNB Smart Chain for instant activation.'
                  }
                </p>
              </div>
            )}
            {!user && (
              <div className="mt-6">
                <Link
                  to="/customer/login"
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center space-x-2"
                >
                  <span>Login to Purchase</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="mt-16 bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Why Choose Our USDT MLM Platform?
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Binary Tree System</h3>
              <p className="text-gray-600 text-sm">
                Fair and transparent binary compensation with automated placement.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-green-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">USDT Smart Contracts</h3>
              <p className="text-gray-600 text-sm">
                USDT blockchain payments with transparent and secure smart contract transactions.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">24/7 Support</h3>
              <p className="text-gray-600 text-sm">
                Round-the-clock customer support to help you succeed.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPlans;