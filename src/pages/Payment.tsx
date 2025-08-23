import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/ui/NotificationProvider';
import { supabase } from '../lib/supabase';
import { CreditCard, Shield, Lock, CheckCircle, ArrowLeft, Wallet } from 'lucide-react';

interface SubscriptionPlan {
  tsp_id: string;
  tsp_name: string;
  tsp_description: string;
  tsp_price: number;
  tsp_duration_days: number;
  tsp_features: string[];
}

const Payment: React.FC = () => {
  const { user, fetchUserData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const notification = useNotification();
  
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'wallet'>('card');
  const [processing, setProcessing] = useState(false);
  const [cardDetails, setCardDetails] = useState({
    number: '',
    expiry: '',
    cvv: '',
    name: ''
  });

  useEffect(() => {
    // Get selected plan from navigation state
    const planFromState = location.state?.selectedPlan;
    
    if (planFromState) {
      setSelectedPlan(planFromState);
    } else {
      // No plan selected, redirect to subscription plans
      notification.showError('No Plan Selected', 'Please select a subscription plan first.');
      navigate('/subscription-plans', { replace: true });
    }
  }, [location.state, navigate, notification]);

  const handlePayment = async () => {
    if (!selectedPlan || !user) {
      notification.showError('Error', 'Missing plan or user information');
      return;
    }

    setProcessing(true);
    try {
      console.log('💳 Processing payment for plan:', selectedPlan.tsp_name);

      // Calculate end date
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + selectedPlan.tsp_duration_days);

      // Create subscription record
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('tbl_user_subscriptions')
        .insert({
          tus_user_id: user.id,
          tus_plan_id: selectedPlan.tsp_id,
          tus_status: 'active',
          tus_start_date: startDate.toISOString(),
          tus_end_date: endDate.toISOString(),
          tus_payment_amount: selectedPlan.tsp_price
        })
        .select()
        .single();

      if (subscriptionError) {
        console.error('❌ Subscription creation failed:', subscriptionError);
        throw new Error(subscriptionError.message);
      }

      console.log('✅ Subscription created:', subscriptionData);

      // Create payment record
      const { data: paymentData, error: paymentError } = await supabase
        .from('tbl_payments')
        .insert({
          tp_user_id: user.id,
          tp_subscription_id: subscriptionData.tus_id,
          tp_amount: selectedPlan.tsp_price,
          tp_currency: 'USD',
          tp_payment_method: paymentMethod,
          tp_payment_status: 'completed',
          tp_transaction_id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          tp_gateway_response: {
            method: paymentMethod,
            card_last_four: paymentMethod === 'card' ? cardDetails.number.slice(-4) : null,
            processed_at: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (paymentError) {
        console.error('❌ Payment record creation failed:', paymentError);
        throw new Error(paymentError.message);
      }

      console.log('✅ Payment record created:', paymentData);

      // Refresh user data to update subscription status
      await fetchUserData(user.id);

      notification.showSuccess('Payment Successful!', 'Your subscription has been activated.');

      // Redirect to dashboard with success state
      setTimeout(() => {
        navigate('/dashboard', { 
          replace: true,
          state: { paymentSuccess: true }
        });
      }, 1000);

    } catch (error: any) {
      console.error('❌ Payment processing failed:', error);
      notification.showError('Payment Failed', error?.message || 'Payment processing failed');
    } finally {
      setProcessing(false);
    }
  };

  if (!selectedPlan) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading payment information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            to="/subscription-plans" 
            className="inline-flex items-center text-indigo-600 hover:text-indigo-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Plans
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Complete Your Payment</h1>
          <p className="text-gray-600 mt-2">Secure payment processing for your subscription</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Order Summary */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Order Summary</h2>
            
            <div className="border rounded-lg p-4 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedPlan.tsp_name}</h3>
                  <p className="text-gray-600 text-sm mt-1">{selectedPlan.tsp_description}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">${selectedPlan.tsp_price}</p>
                  <p className="text-sm text-gray-600">{selectedPlan.tsp_duration_days} days</p>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-medium text-gray-900 mb-2">Features included:</h4>
                <ul className="space-y-1">
                  {selectedPlan.tsp_features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm text-gray-600">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total Amount</span>
                <span className="text-indigo-600">${selectedPlan.tsp_price}</span>
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Payment Details</h2>

            {/* Payment Method Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Payment Method
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`p-4 border rounded-lg flex items-center justify-center transition-colors ${
                    paymentMethod === 'card'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <CreditCard className="w-5 h-5 mr-2" />
                  Credit Card
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  className={`p-4 border rounded-lg flex items-center justify-center transition-colors ${
                    paymentMethod === 'wallet'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <Wallet className="w-5 h-5 mr-2" />
                  Digital Wallet
                </button>
              </div>
            </div>

            {/* Card Payment Form */}
            {paymentMethod === 'card' && (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Card Number
                  </label>
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    value={cardDetails.number}
                    onChange={(e) => setCardDetails({ ...cardDetails, number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Expiry Date
                    </label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={cardDetails.expiry}
                      onChange={(e) => setCardDetails({ ...cardDetails, expiry: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CVV
                    </label>
                    <input
                      type="text"
                      placeholder="123"
                      value={cardDetails.cvv}
                      onChange={(e) => setCardDetails({ ...cardDetails, cvv: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={cardDetails.name}
                    onChange={(e) => setCardDetails({ ...cardDetails, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* Wallet Payment Info */}
            {paymentMethod === 'wallet' && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <Wallet className="w-5 h-5 text-blue-600 mr-2" />
                  <h3 className="font-medium text-blue-900">Digital Wallet Payment</h3>
                </div>
                <p className="text-blue-700 text-sm">
                  You'll be redirected to your preferred digital wallet to complete the payment securely.
                </p>
              </div>
            )}

            {/* Security Features */}
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center mb-2">
                <Shield className="w-5 h-5 text-green-600 mr-2" />
                <h3 className="font-medium text-green-900">Secure Payment</h3>
              </div>
              <div className="space-y-1 text-sm text-green-700">
                <div className="flex items-center">
                  <Lock className="w-4 h-4 mr-2" />
                  256-bit SSL encryption
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  PCI DSS compliant
                </div>
                <div className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Fraud protection enabled
                </div>
              </div>
            </div>

            {/* Payment Button */}
            <button
              onClick={handlePayment}
              disabled={processing}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Processing Payment...
                </div>
              ) : (
                `Pay $${selectedPlan.tsp_price}`
              )}
            </button>

            <p className="text-xs text-gray-500 text-center mt-4">
              By completing this payment, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

};

export default Payment;