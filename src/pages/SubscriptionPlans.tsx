import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Check, Star, Zap, DollarSign, ArrowRight, CheckCircle, Package, Calendar, Users, Shield, CreditCard } from 'lucide-react';

interface SubscriptionPlan {
  tsp_id: string;
  tsp_name: string;
  tsp_description: string;
  tsp_price: number;
  tsp_duration_days: number;
  tsp_features: string[];
  tsp_is_active: boolean;
  tsp_created_at: string;
}

const SubscriptionPlans: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🔍 Loading subscription plans from database...');
      
      const { data, error } = await supabase
        .from('tbl_subscription_plans')
        .select('*')
        .eq('tsp_is_active', true)
        .order('tsp_price', { ascending: true });

      if (error) {
        console.error('❌ Failed to load plans:', error);
        throw error;
      }
      
      console.log('✅ Plans loaded successfully:', data?.length || 0, 'plans');
      setPlans(data || []);
    } catch (error) {
      console.error('Failed to load subscription plans:', error);
      setError('Failed to load subscription plans. Please try again.');
      // Fallback to default plans if database fails
      setPlans([
        {
          tsp_id: '1',
          tsp_name: 'Basic Plan',
          tsp_description: 'Perfect for beginners starting their MLM journey',
          tsp_price: 50,
          tsp_duration_days: 30,
          tsp_features: ['MLM Tree Access', 'Basic Dashboard', 'Email Support', 'Mobile App Access'],
          tsp_is_active: true,
          tsp_created_at: new Date().toISOString()
        },
        {
          tsp_id: '2',
          tsp_name: 'Premium Plan',
          tsp_description: 'For serious entrepreneurs ready to scale',
          tsp_price: 100,
          tsp_duration_days: 30,
          tsp_features: ['MLM Tree Access', 'Advanced Dashboard', 'Priority Support', 'Analytics & Reports', 'Marketing Tools', 'API Access'],
          tsp_is_active: true,
          tsp_created_at: new Date().toISOString()
        },
        {
          tsp_id: '3',
          tsp_name: 'Enterprise Plan',
          tsp_description: 'Complete solution for enterprise-level operations',
          tsp_price: 200,
          tsp_duration_days: 30,
          tsp_features: ['MLM Tree Access', 'Advanced Dashboard', 'Priority Support', 'Analytics & Reports', 'Marketing Tools', 'API Access', 'Custom Branding', 'White Label Options'],
          tsp_is_active: true,
          tsp_created_at: new Date().toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (planId: string) => {
    // If user not logged in, redirect to login first
    if (!user) {
      navigate('/customer/login', { state: { from: '/subscription-plans', selectedPlanId: planId } });
      return;
    }
    
    // If logged in, proceed to payment
    navigate('/payment', { state: { selectedPlanId: planId, fromPlanSelection: true } });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading subscription plans...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center space-x-2 bg-indigo-100 rounded-full px-6 py-3 mb-6">
            <Package className="h-5 w-5 text-indigo-600" />
            <span className="text-sm font-semibold text-indigo-600">USDT Subscription Plans</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Choose Your <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">USDT Plan</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            {user 
              ? 'Select the perfect USDT subscription plan to unlock your MLM dashboard and start earning.'
              : 'Explore our USDT subscription plans. Login to purchase and start your MLM journey.'
            }
          </p>
          
          {/* USDT Payment Info */}
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-center space-x-3 mb-3">
              <CreditCard className="h-6 w-6" />
              <h3 className="text-xl font-bold">Secure USDT Payments</h3>
              <Shield className="h-6 w-6" />
            </div>
            <p className="text-green-100">
              All payments are processed in USDT (BEP-20) on BNB Smart Chain for instant, secure, and transparent transactions.
            </p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8 max-w-2xl mx-auto">
            <div className="flex items-center space-x-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <Package className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">Unable to Load Plans</h3>
                <p className="text-red-700">{error}</p>
                <p className="text-sm text-red-600 mt-2">Showing default plans below.</p>
              </div>
            </div>
          </div>
        )}

        {/* Plans Grid - Same format as admin panel */}
        {plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={plan.tsp_id}
                className={`bg-white rounded-2xl shadow-xl border-2 p-8 relative transform transition-all duration-300 hover:scale-105 hover:shadow-2xl ${
                  index === 1 ? 'border-indigo-500 ring-4 ring-indigo-200' : 'border-gray-200 hover:border-indigo-300'
                }`}
              >
                {/* Popular Badge */}
                {index === 1 && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-2 rounded-full text-sm font-bold flex items-center space-x-2 shadow-lg">
                      <Star className="h-4 w-4" />
                      <span>Most Popular</span>
                    </div>
                  </div>
                )}

                {/* Plan Header */}
                <div className="text-center mb-8">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                    index === 0 ? 'bg-blue-100' : index === 1 ? 'bg-indigo-100' : 'bg-purple-100'
                  }`}>
                    <Package className={`h-8 w-8 ${
                      index === 0 ? 'text-blue-600' : index === 1 ? 'text-indigo-600' : 'text-purple-600'
                    }`} />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.tsp_name}</h3>
                  
                  {/* USDT Price Display - Same as admin panel */}
                  <div className="flex items-center justify-center mb-4">
                    <span className="text-4xl font-bold text-gray-900">{plan.tsp_price}</span>
                    <span className="text-2xl font-bold text-indigo-600 ml-2">USDT</span>
                  </div>
                  
                  <div className="flex items-center justify-center space-x-2 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>{plan.tsp_duration_days} days subscription</span>
                  </div>
                  
                  <p className="text-gray-600 mt-3">{plan.tsp_description}</p>
                </div>

                {/* Features List - Same as admin panel */}
                <div className="space-y-4 mb-8">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                    Included Features:
                  </h4>
                  {plan.tsp_features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center space-x-3 bg-gray-50 rounded-lg p-3">
                      <div className="bg-green-100 rounded-full p-1 flex-shrink-0">
                        <Check className="h-4 w-4 text-green-600" />
                      </div>
                      <span className="text-gray-700 font-medium">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Plan Stats */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-gray-900">{plan.tsp_price}</div>
                      <div className="text-xs text-gray-600">USDT Price</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900">{plan.tsp_duration_days}</div>
                      <div className="text-xs text-gray-600">Days Access</div>
                    </div>
                  </div>
                </div>

                {/* Select Button */}
                <button
                  onClick={() => handleSelectPlan(plan.tsp_id)}
                  className={`w-full py-4 px-6 rounded-xl font-bold transition-all duration-300 flex items-center justify-center space-x-3 shadow-lg hover:shadow-xl transform hover:-translate-y-1 ${
                    index === 1
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700'
                      : 'bg-gradient-to-r from-gray-800 to-gray-900 text-white hover:from-gray-900 hover:to-black'
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span>
                    {user 
                      ? `Pay ${plan.tsp_price} USDT - Select Plan`
                      : `Select ${plan.tsp_name} - ${plan.tsp_price} USDT`
                    }
                  </span>
                  <ArrowRight className="h-5 w-5" />
                </button>

                {/* Plan Benefits */}
                <div className="mt-4 text-center">
                  <p className="text-xs text-gray-500">
                    ✓ Instant activation • ✓ 24/7 support • ✓ USDT payments
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="bg-yellow-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-yellow-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Subscription Plans Available</h3>
            <p className="text-gray-600 mb-6">
              No active subscription plans are currently available. Please contact support.
            </p>
            {!user && (
              <div className="mt-6">
                <Link
                  to="/customer/login"
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center space-x-2"
                >
                  <span>Login to Continue</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Why Choose USDT Section */}
        <div className="mt-20 bg-white rounded-3xl shadow-xl p-8 border border-gray-200">
          <div className="text-center mb-12">
            <div className="inline-flex items-center space-x-2 bg-green-100 rounded-full px-6 py-3 mb-6">
              <Shield className="h-5 w-5 text-green-600" />
              <span className="text-sm font-semibold text-green-600">USDT Advantages</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Why We Use <span className="text-green-600">USDT</span> Payments?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Experience the benefits of cryptocurrency payments with USDT on BNB Smart Chain.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: Zap,
                title: 'Instant Transactions',
                description: 'Payments are processed instantly on the blockchain with immediate confirmation.',
                color: 'from-yellow-500 to-orange-600',
                bgColor: 'bg-yellow-50',
                iconColor: 'text-yellow-600'
              },
              {
                icon: Shield,
                title: 'Maximum Security',
                description: 'Blockchain technology ensures your payments are secure and tamper-proof.',
                color: 'from-green-500 to-emerald-600',
                bgColor: 'bg-green-50',
                iconColor: 'text-green-600'
              },
              {
                icon: DollarSign,
                title: 'Low Fees',
                description: 'Minimal transaction fees compared to traditional payment methods.',
                color: 'from-blue-500 to-cyan-600',
                bgColor: 'bg-blue-50',
                iconColor: 'text-blue-600'
              },
              {
                icon: CheckCircle,
                title: 'Transparent',
                description: 'Every transaction is recorded on the blockchain for complete transparency.',
                color: 'from-purple-500 to-pink-600',
                bgColor: 'bg-purple-50',
                iconColor: 'text-purple-600'
              }
            ].map((benefit, index) => (
              <div key={index} className="text-center group">
                <div className={`${benefit.bgColor} w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                  <benefit.icon className={`h-8 w-8 ${benefit.iconColor}`} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{benefit.title}</h3>
                <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Process */}
        <div className="mt-16 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-8 text-white">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Simple Payment Process</h2>
            <p className="text-xl text-indigo-100">
              Get started in just 3 easy steps
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Select Your Plan',
                description: 'Choose the subscription plan that best fits your goals and budget.',
                icon: Package
              },
              {
                step: '2',
                title: 'Connect Wallet',
                description: 'Connect your MetaMask or compatible wallet with USDT balance.',
                icon: CreditCard
              },
              {
                step: '3',
                title: 'Complete Payment',
                description: 'Approve the USDT transaction and get instant access to your dashboard.',
                icon: CheckCircle
              }
            ].map((step, index) => (
              <div key={index} className="text-center">
                <div className="bg-white/20 backdrop-blur-sm w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 relative">
                  <step.icon className="h-8 w-8 text-white" />
                  <div className="absolute -top-2 -right-2 bg-yellow-400 text-gray-900 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                    {step.step}
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-indigo-100 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 bg-white rounded-3xl shadow-xl p-8 border border-gray-200">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {[
              {
                question: "What is USDT?",
                answer: "USDT (Tether) is a stable cryptocurrency pegged to the US Dollar, providing price stability for payments."
              },
              {
                question: "Why BNB Smart Chain?",
                answer: "BNB Smart Chain offers fast transactions with low fees, making it perfect for subscription payments."
              },
              {
                question: "Is my payment secure?",
                answer: "Yes! All payments are processed through audited smart contracts on the blockchain for maximum security."
              },
              {
                question: "Can I upgrade my plan?",
                answer: "Yes, you can upgrade to a higher plan at any time. The difference will be calculated automatically."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-6">
                <h4 className="font-bold text-gray-900 mb-3">{faq.question}</h4>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        {!user && (
          <div className="mt-16 text-center">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-8 text-white">
              <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
              <p className="text-xl text-emerald-100 mb-8">
                Join thousands of successful entrepreneurs building their financial future.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/customer/register"
                  className="bg-white text-emerald-600 px-8 py-4 rounded-2xl font-bold hover:bg-gray-100 transition-colors flex items-center justify-center space-x-3"
                >
                  <Users className="h-5 w-5" />
                  <span>Register as Customer</span>
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  to="/customer/login"
                  className="border-2 border-white text-white px-8 py-4 rounded-2xl font-bold hover:bg-white hover:text-emerald-600 transition-colors flex items-center justify-center space-x-3"
                >
                  <span>Login to Continue</span>
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPlans;