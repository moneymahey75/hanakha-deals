import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../components/ui/NotificationProvider';
import { DollarSign, CheckCircle, ArrowRight, Wallet, Shield, Clock, CreditCard, Zap } from 'lucide-react';

interface RegistrationPlan {
  tsp_id: string;
  tsp_name: string;
  tsp_description: string;
  tsp_price: number;
  tsp_features: any;
}

interface PaymentSettings {
  admin_wallet: string;
  wallets_enabled: {
    trust_wallet: boolean;
    metamask: boolean;
    safepal: boolean;
  };
}

const RegistrationPayment: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const notification = useNotification();

  const [plan, setPlan] = useState<RegistrationPlan | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<'trust_wallet' | 'metamask' | 'safepal' | null>(null);
  const [transactionHash, setTransactionHash] = useState('');
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/customer/login');
      return;
    }
    loadRegistrationData();
  }, [user]);

  const loadRegistrationData = async () => {
    try {
      const [planResult, settingsResult] = await Promise.all([
        supabase
          .from('tbl_subscription_plans')
          .select('*')
          .eq('tsp_type', 'registration')
          .eq('tsp_is_active', true)
          .maybeSingle(),
        supabase
          .from('tbl_system_settings')
          .select('tss_setting_key, tss_setting_value')
          .in('tss_setting_key', ['admin_payment_wallet', 'payment_wallets_enabled'])
      ]);

      if (planResult.error) throw planResult.error;
      if (!planResult.data) {
        notification.showError('Error', 'No active registration plan found');
        navigate('/customer/dashboard');
        return;
      }

      setPlan(planResult.data);

      if (settingsResult.data) {
        const adminWallet = settingsResult.data.find(s => s.tss_setting_key === 'admin_payment_wallet');
        const walletsEnabled = settingsResult.data.find(s => s.tss_setting_key === 'payment_wallets_enabled');

        setSettings({
          admin_wallet: adminWallet ? String(adminWallet.tss_setting_value || '').replace(/"/g, '') : '',
          wallets_enabled: walletsEnabled ? walletsEnabled.tss_setting_value as any : {
            trust_wallet: true,
            metamask: true,
            safepal: true
          }
        });
      }
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedWallet) {
      notification.showError('Error', 'Please select a wallet');
      return;
    }

    if (!plan || !settings) {
      notification.showError('Error', 'Payment configuration not loaded');
      return;
    }

    setSubmitting(true);
    try {
      // First create the subscription
      const { data: subscription, error: subscriptionError } = await supabase
        .from('tbl_user_subscriptions')
        .insert({
          tus_user_id: user?.tu_id,
          tus_plan_id: plan.tsp_id,
          tus_status: 'pending',
          tus_start_date: new Date().toISOString(),
          tus_payment_amount: plan.tsp_price
        })
        .select()
        .single();

      if (subscriptionError) throw subscriptionError;

      // Then create the payment linked to the subscription
      const { error: paymentError } = await supabase
        .from('tbl_payments')
        .insert({
          tp_user_id: user?.tu_id,
          tp_subscription_id: subscription.tus_id,
          tp_amount: plan.tsp_price,
          tp_payment_method: selectedWallet,
          tp_payment_status: 'pending',
          tp_transaction_id: transactionHash || null
        });

      if (paymentError) throw paymentError;

      notification.showSuccess(
        'Payment Submitted',
        'Your registration payment is pending admin approval'
      );

      setTimeout(() => {
        navigate('/customer/dashboard');
      }, 2000);
    } catch (error: any) {
      notification.showError('Payment Failed', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const walletOptions = [
    { id: 'trust_wallet' as const, name: 'Trust Wallet', icon: Wallet, enabled: settings?.wallets_enabled.trust_wallet },
    { id: 'metamask' as const, name: 'MetaMask', icon: Wallet, enabled: settings?.wallets_enabled.metamask },
    { id: 'safepal' as const, name: 'SafePal', icon: Wallet, enabled: settings?.wallets_enabled.safepal }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No registration plan available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Registration Successful!</h1>
          <p className="text-gray-600">Complete your payment to activate your account</p>
        </div>

        {/* USDT Payment Info */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl p-6 max-w-3xl mx-auto mb-10">
          <div className="flex items-center justify-center space-x-3 mb-3">
            <CreditCard className="h-6 w-6" />
            <h3 className="text-xl font-bold">Secure USDT Payments</h3>
            <Shield className="h-6 w-6" />
          </div>
          <p className="text-green-100 text-center">
            All payments are processed in USDT (BEP-20) on BNB Smart Chain for fast, secure, and transparent transactions.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Registration Plan</h2>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{plan.tsp_name}</h3>
                  <p className="text-gray-600 text-sm mt-1">{plan.tsp_description}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-600">${plan.tsp_price}</div>
                  <div className="text-sm text-gray-500">One-time fee</div>
                </div>
              </div>

              {typeof plan.tsp_features === 'object' && Object.keys(plan.tsp_features).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Features Included:</h4>
                  <ul className="space-y-2">
                    {Object.keys(plan.tsp_features).map((key, idx) => (
                      <li key={idx} className="flex items-center text-gray-600">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                        <span>{key.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Select Payment Wallet</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {walletOptions.filter(w => w.enabled).map(wallet => (
                  <button
                    key={wallet.id}
                    onClick={() => setSelectedWallet(wallet.id)}
                    className={`p-4 border-2 rounded-lg transition-all ${
                      selectedWallet === wallet.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <wallet.icon className="h-8 w-8 mx-auto mb-2 text-gray-700" />
                    <p className="text-sm font-medium text-gray-900">{wallet.name}</p>
                  </button>
                ))}
              </div>
            </div>

            {selectedWallet && settings?.admin_wallet && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Instructions</h2>
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Send payment to:</p>
                    <div className="bg-white p-3 rounded border border-gray-200 font-mono text-sm break-all">
                      {settings.admin_wallet}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <Clock className="h-5 w-5 text-amber-600 mt-0.5 mr-2" />
                      <div className="text-sm text-amber-800">
                        <p className="font-medium mb-1">Important:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Send exactly ${plan.tsp_price} USD equivalent in crypto</li>
                          <li>Your account will be activated after admin verification</li>
                          <li>Save your transaction hash for reference</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transaction Hash (Optional)
                    </label>
                    <input
                      type="text"
                      value={transactionHash}
                      onChange={(e) => setTransactionHash(e.target.value)}
                      placeholder="Enter transaction hash after payment"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h3>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Registration Fee</span>
                  <span className="font-medium">${plan.tsp_price}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Processing Fee</span>
                  <span className="font-medium">$0.00</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between text-lg font-bold text-gray-900">
                  <span>Total</span>
                  <span className="text-blue-600">${plan.tsp_price}</span>
                </div>
              </div>

              <div className="space-y-3 mb-6 text-sm text-gray-600">
                <div className="flex items-start">
                  <Shield className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>Secure payment processing</span>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>$2 referral bonus to your sponsor</span>
                </div>
              </div>

              <button
                onClick={handlePayment}
                disabled={!selectedWallet || submitting}
                className={`w-full py-3 rounded-lg font-medium flex items-center justify-center space-x-2 ${
                  selectedWallet && !submitting
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Payment</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                By proceeding, you agree to our terms and conditions
              </p>
            </div>
          </div>
        </div>

        {/* Why Choose USDT Section */}
        <div className="mt-16 bg-white rounded-3xl shadow-xl p-8 border border-gray-200">
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
                bgColor: 'bg-yellow-50',
                iconColor: 'text-yellow-600'
              },
              {
                icon: Shield,
                title: 'Maximum Security',
                description: 'Blockchain technology ensures your payments are secure and tamper-proof.',
                bgColor: 'bg-green-50',
                iconColor: 'text-green-600'
              },
              {
                icon: DollarSign,
                title: 'Low Fees',
                description: 'Minimal transaction fees compared to traditional payment methods.',
                bgColor: 'bg-blue-50',
                iconColor: 'text-blue-600'
              },
              {
                icon: CheckCircle,
                title: 'Transparent',
                description: 'Every transaction is recorded on the blockchain for complete transparency.',
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
                title: 'Select Your Wallet',
                description: 'Choose your preferred wallet to make the registration payment.',
                icon: Wallet
              },
              {
                step: '2',
                title: 'Send USDT',
                description: 'Send the exact USDT amount to the provided wallet address.',
                icon: CreditCard
              },
              {
                step: '3',
                title: 'Submit Details',
                description: 'Provide your transaction hash and submit for confirmation.',
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
                answer: "BNB Smart Chain offers fast transactions with low fees, making it perfect for registration payments."
              },
              {
                question: "Is my payment secure?",
                answer: "Yes! All payments are processed through audited smart contracts on the blockchain for maximum security."
              },
              {
                question: "When will my account activate?",
                answer: "Your account is activated after admin verification of your registration payment."
              }
            ].map((faq, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-6">
                <h4 className="font-bold text-gray-900 mb-3">{faq.question}</h4>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationPayment;
