import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../components/ui/NotificationProvider';
import { supabase } from '../lib/supabase';
import { WalletService } from '../services/walletService';
import { WalletInfo, WalletState, TransactionState } from '../types/wallet';
import { WalletSelector } from '../components/payment/WalletSelector';
import { WalletInfo as WalletInfoComponent } from '../components/payment/WalletInfo';
import { PaymentSection } from '../components/payment/PaymentSection';
import { TrustIndicators } from '../components/payment/TrustIndicators';
import { CreditCard, Shield, ArrowLeft, Wallet, AlertTriangle } from 'lucide-react';

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
  const [walletService] = useState(() => WalletService.getInstance());
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    address: null,
    chainId: null,
    balance: '0',
    usdtBalance: '0',
    walletName: null,
  });
  const [transaction, setTransaction] = useState<TransactionState>({
    isProcessing: false,
    hash: null,
    status: 'idle',
    error: null,
    distributionSteps: [],
  });
  const [isConnecting, setIsConnecting] = useState(false);

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

    // Detect available wallets
    const wallets = walletService.detectWallets();
    setAvailableWallets(wallets);
  }, [location.state, navigate, notification, walletService]);

  const handleWalletConnect = async (provider: any) => {
    setIsConnecting(true);
    try {
      const wallet = await walletService.connectWallet(provider);
      setWalletState(wallet);
      notification.showSuccess('Wallet Connected', `Successfully connected to ${wallet.walletName}`);
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      notification.showError('Connection Failed', error.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWalletDisconnect = () => {
    walletService.disconnect();
    setWalletState({
      isConnected: false,
      address: null,
      chainId: null,
      balance: '0',
      usdtBalance: '0',
      walletName: null,
    });
    notification.showInfo('Wallet Disconnected', 'Wallet has been disconnected');
  };

  const handlePayment = async () => {
    if (!selectedPlan || !user) {
      notification.showError('Error', 'Missing plan or user information');
      return;
    }

    if (!walletState.isConnected) {
      notification.showError('Wallet Required', 'Please connect your wallet first');
      return;
    }

    const usdtBalance = parseFloat(walletState.usdtBalance);
    if (usdtBalance < selectedPlan.tsp_price) {
      notification.showError(
        'Insufficient Balance', 
        `You need at least ${selectedPlan.tsp_price} USDT to complete this payment. Current balance: ${usdtBalance} USDT`
      );
      return;
    }

    setTransaction(prev => ({
      ...prev,
      isProcessing: true,
      status: 'pending',
      error: null,
      distributionSteps: []
    }));

    try {
      console.log('💳 Processing smart contract payment for plan:', selectedPlan.tsp_name);

      // Execute USDT distribution through smart contract
      const { hash, steps } = await walletService.executeUSDTDistribution(selectedPlan.tsp_price);

      setTransaction(prev => ({
        ...prev,
        hash,
        distributionSteps: steps,
        status: 'success'
      }));

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
          tp_currency: 'USDT',
          tp_payment_method: 'blockchain',
          tp_payment_status: 'completed',
          tp_transaction_id: hash,
          tp_gateway_response: {
            blockchain: 'BSC',
            contract_address: '0x337efE1be3dA9Bb3Aa6D6d90f8A0CD9e1c4C9641',
            transaction_hash: hash,
            wallet_address: walletState.address,
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
      console.log('🔄 Refreshing user data to update subscription status...');
      await fetchUserData(user.id);

      notification.showSuccess('Payment Successful!', 'Your subscription has been activated via blockchain.');

      // Redirect to dashboard with success state
      setTimeout(() => {
        navigate('/customer/dashboard', { 
          replace: true,
          state: { 
            paymentSuccess: true,
            planName: selectedPlan.tsp_name,
            transactionHash: hash
          }
        });
      }, 1000);

    } catch (error: any) {
      console.error('❌ Payment processing failed:', error);
      setTransaction(prev => ({
        ...prev,
        status: 'error',
        error: error?.message || 'Payment processing failed'
      }));
      notification.showError('Payment Failed', error?.message || 'Smart contract payment failed');
    } finally {
      setTransaction(prev => ({
        ...prev,
        isProcessing: false
      }));
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link 
            to="/subscription-plans" 
            className="inline-flex items-center text-purple-300 hover:text-purple-200 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Plans
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">USDT Smart Contract Payment</h1>
          <p className="text-purple-200">Secure blockchain payment processing</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Plan Summary */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center">
              <CreditCard className="w-6 h-6 mr-3 text-purple-300" />
              Subscription Details
            </h2>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-white">{selectedPlan.tsp_name}</h3>
                  <p className="text-purple-200 text-sm mt-1">{selectedPlan.tsp_description}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-white">{selectedPlan.tsp_price}</p>
                  <p className="text-purple-300 text-sm">USDT</p>
                </div>
              </div>
              
              <div className="border-t border-white/20 pt-4">
                <h4 className="font-medium text-white mb-3">Features included:</h4>
                <ul className="space-y-2">
                  {selectedPlan.tsp_features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm text-purple-200">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-3 flex-shrink-0"></div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-4 border border-green-400/30">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">Total Payment</span>
                <span className="text-2xl font-bold text-green-300">{selectedPlan.tsp_price} USDT</span>
              </div>
              <p className="text-green-200 text-sm mt-1">
                {selectedPlan.tsp_duration_days} days subscription • BEP-20 Token
              </p>
            </div>
          </div>

          {/* Payment Section */}
          <div className="space-y-6">
            {!walletState.isConnected ? (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-xl">
                <h2 className="text-2xl font-semibold text-white mb-6 flex items-center">
                  <Wallet className="w-6 h-6 mr-3 text-purple-300" />
                  Connect Your Wallet
                </h2>
                
                {availableWallets.length === 0 && (
                  <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-xl p-4 mb-6">
                    <div className="flex items-center space-x-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-300" />
                      <span className="font-medium text-yellow-200">No Wallet Detected</span>
                    </div>
                    <p className="text-yellow-100 text-sm">
                      Please install MetaMask, Trust Wallet, or another Web3 wallet to continue with USDT payments.
                    </p>
                  </div>
                )}
                
                <WalletSelector
                  wallets={availableWallets}
                  onConnect={handleWalletConnect}
                  isConnecting={isConnecting}
                />
              </div>
            ) : (
              <>
                <WalletInfoComponent
                  wallet={walletState}
                  onDisconnect={handleWalletDisconnect}
                />
                <PaymentSection
                  onPayment={handlePayment}
                  transaction={transaction}
                  distributionSteps={transaction.distributionSteps}
                />
              </>
            )}
          </div>
        </div>

        <TrustIndicators />

        {/* Instructions */}
        <div className="mt-12 bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
          <h3 className="text-xl font-semibold text-white mb-4">Payment Instructions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-purple-200">
            <div>
              <div className="bg-purple-500/30 w-8 h-8 rounded-full flex items-center justify-center mb-3">
                <span className="text-white font-bold">1</span>
              </div>
              <h4 className="font-medium text-white mb-2">Connect Wallet</h4>
              <p>Connect your MetaMask or compatible wallet with USDT balance on BNB Smart Chain.</p>
            </div>
            <div>
              <div className="bg-purple-500/30 w-8 h-8 rounded-full flex items-center justify-center mb-3">
                <span className="text-white font-bold">2</span>
              </div>
              <h4 className="font-medium text-white mb-2">Approve Transaction</h4>
              <p>Review the smart contract transaction and approve the USDT distribution.</p>
            </div>
            <div>
              <div className="bg-purple-500/30 w-8 h-8 rounded-full flex items-center justify-center mb-3">
                <span className="text-white font-bold">3</span>
              </div>
              <h4 className="font-medium text-white mb-2">Access Dashboard</h4>
              <p>Once confirmed on blockchain, your subscription will be activated instantly.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;