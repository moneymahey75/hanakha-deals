import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { Shield, CheckCircle, DollarSign, Wallet, CreditCard, Zap, Lock, AlertTriangle } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { Package } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

// Import smart contract components and services
import { WalletService } from '../services/walletService';
import { WalletState, TransactionState } from '../types/wallet';
import { TrustIndicators } from '../components/payment/TrustIndicators';
import { WalletSelector } from '../components/payment/WalletSelector';
import { WalletInfo } from '../components/payment/WalletInfo';
import { PaymentSection } from '../components/payment/PaymentSection';

const Payment: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { subscriptionPlans } = useAdmin();
  const { user } = useAuth();

  // Check if user is authenticated
  if (!user) {
    return <Navigate to="/customer/login" replace state={{ from: '/payment' }} />;
  }

  // If user already has active subscription and not coming from plan selection, redirect to dashboard
  if (user.hasActiveSubscription && !location.state?.fromPlanSelection && !location.state?.requiresSubscription) {
    const dashboardPath = user.userType === 'company' ? '/company/dashboard' : '/customer/dashboard';
    return <Navigate to={dashboardPath} replace />;
  }

  // Get selected plan from navigation state
  const selectedPlanId = location.state?.selectedPlanId;
  const selectedPlan = location.state?.selectedPlan || 
    (selectedPlanId ? subscriptionPlans.find(plan => plan.tsp_id === selectedPlanId) : null);

  console.log('💳 Payment page - Selected plan ID:', selectedPlanId);
  console.log('💳 Payment page - Selected plan:', selectedPlan);
  console.log('💳 Payment page - User has subscription:', user.hasActiveSubscription);

  // If no plan selected and user doesn't have subscription, redirect to plan selection
  if (!selectedPlan && !user.hasActiveSubscription) {
    console.log('🔄 No plan selected, redirecting to plan selection');
    return <Navigate to="/subscription-plans" replace />;
  }

  // Fallback to first plan if somehow no plan is found but user needs subscription
  const finalSelectedPlan = selectedPlan || subscriptionPlans[0];
  // Smart contract state - exactly from App.tsx
  const [wallets, setWallets] = useState(WalletService.getInstance().detectWallets());
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    address: null,
    chainId: null,
    balance: '0.00',
    usdtBalance: '0.00',
    walletName: null,
  });
  const [transactionState, setTransactionState] = useState<TransactionState>({
    isProcessing: false,
    hash: null,
    status: 'idle',
    error: null,
    distributionSteps: [],
  });

  // Wallet detection effect - enhanced with cleanup
  useEffect(() => {
    // Clear any pending states on component mount
    setIsConnecting(false);
    
    // Clear any stale wallet state
    setWalletState({
      isConnected: false,
      address: null,
      chainId: null,
      balance: '0.00',
      usdtBalance: '0.00',
      walletName: null,
    });

    // Re-detect wallets periodically in case they get installed
    const interval = setInterval(() => {
      setWallets(WalletService.getInstance().detectWallets());
    }, 2000);

    // Cleanup function
    return () => {
      clearInterval(interval);
      // Reset connecting state on unmount
      setIsConnecting(false);
    };
  }, []);

  // Enhanced MetaMask connection with better error handling
  const handleDirectMetaMaskConnect = async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    try {
      console.log('Direct MetaMask connection attempt...');

      if (!window.ethereum) {
        throw new Error('MetaMask not installed');
      }

      // Check for pending requests first
      try {
        const currentAccounts = await window.ethereum.request({
          method: 'eth_accounts',
        });
        
        if (currentAccounts.length > 0) {
          console.log('✅ MetaMask already connected:', currentAccounts[0]);
          // Use existing connection
          const chainId = await window.ethereum.request({
            method: 'eth_chainId',
          });

          setWalletState({
            isConnected: true,
            address: currentAccounts[0],
            chainId: chainId,
            balance: '0.00',
            usdtBalance: '0.00',
            walletName: 'MetaMask',
          });

          toast.success(`Connected to MetaMask: ${currentAccounts[0].substring(0, 6)}...${currentAccounts[0].substring(38)}`);
          return;
        }
      } catch (checkError) {
        console.log('Could not check existing accounts, proceeding with fresh connection');
      }

      // Add delay before requesting new connection
      await new Promise(resolve => setTimeout(resolve, 200));

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const chainId = await window.ethereum.request({
        method: 'eth_chainId',
      });

      // Set wallet state directly
      setWalletState({
        isConnected: true,
        address: accounts[0],
        chainId: chainId,
        balance: '0.00', // Will be updated later
        usdtBalance: '0.00', // Will be updated later
        walletName: 'MetaMask',
      });

      toast.success(`Connected to MetaMask: ${accounts[0].substring(0, 6)}...${accounts[0].substring(38)}`);

    } catch (error: any) {
      console.error('Direct connection error:', error);
      
      // Enhanced error handling
      if (error.code === -32002) {
        toast.error('MetaMask is busy. Please open MetaMask, check for pending requests, and try again.', {
          duration: 6000,
        });
      } else if (error.code === 4001) {
        toast.error('Connection cancelled by user');
      } else if (error.message?.includes('already pending') || error.message?.includes('pending')) {
        toast.error('Please check MetaMask for pending requests. Close and reopen MetaMask if needed.', {
          duration: 6000,
        });
      } else {
        toast.error(`Connection failed: ${error.message}`);
      }
    } finally {
      // Add delay before allowing next attempt
      setTimeout(() => {
        setIsConnecting(false);
      }, 1000);
    }
  };
  
  const handleConnectWallet = async (provider: any) => {
    // Prevent multiple simultaneous connections
    if (isConnecting) {
      toast.error('Connection already in progress. Please wait...');
      return;
    }

    setIsConnecting(true);
    try {
      // Add delay to prevent rapid requests
      await new Promise(resolve => setTimeout(resolve, 200));

      // Request connection
      const walletService = WalletService.getInstance();
      const newWalletState = await walletService.connectWallet(provider);
      setWalletState(newWalletState);
      toast.success(`Connected to ${newWalletState.walletName}`);

    } catch (error: any) {
      console.error('Wallet connection error:', error);

      // Handle specific MetaMask errors
      if (error.code === -32002) {
        toast.error('MetaMask is busy. Please open MetaMask, check for pending requests, and try again.', {
          duration: 6000,
        });
      } else if (error.message?.includes('already pending') || error.message?.includes('pending')) {
        toast.error('Please check MetaMask for pending requests. Close and reopen MetaMask if needed.', {
          duration: 6000,
        });
      } else if (error.code === 4001) {
        toast.error('Connection cancelled by user');
      } else {
        toast.error(error.message || 'Failed to connect wallet');
      }
    } finally {
      // Add delay before allowing next connection attempt
      setTimeout(() => {
        setIsConnecting(false);
      }, 1500);
    }
  };

  // Smart contract wallet disconnection - exactly from App.tsx
  const handleDisconnectWallet = () => {
    WalletService.getInstance().disconnect();
    setWalletState({
      isConnected: false,
      address: null,
      chainId: null,
      balance: '0.00',
      usdtBalance: '0.00',
      walletName: null,
    });
    setTransactionState({
      isProcessing: false,
      hash: null,
      status: 'idle',
      error: null,
      distributionSteps: [],
    });
    toast.success('Wallet disconnected');
  };

  // Smart contract payment - enhanced from App.tsx + original Payment.tsx success flow
  const handleSmartContractPayment = async () => {
    if (!walletState.isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    setTransactionState({
      isProcessing: true,
      hash: null,
      status: 'pending',
      error: null,
      distributionSteps: [],
    });

    try {
      const walletService = WalletService.getInstance();

      toast.loading('Processing USDT distribution...');

      // Execute the USDT distribution following your script pattern - from App.tsx
      const result = await walletService.executeUSDTDistribution(selectedPlan.tsp_price);

      setTransactionState({
        isProcessing: false,
        hash: result.hash,
        status: 'success',
        error: null,
        distributionSteps: result.steps,
      });

      toast.dismiss();
      toast.success('USDT distribution successful!');

      // Update balances after successful distribution - from App.tsx
      setTimeout(async () => {
        try {
          const newBalance = await walletService.getBNBBalance(walletState.address!);
          const newUsdtBalance = await walletService.getUSDTBalance(walletState.address!);
          setWalletState(prev => ({
            ...prev,
            balance: newBalance,
            usdtBalance: newUsdtBalance,
          }));
        } catch (error) {
          console.error('Failed to update balances:', error);
        }
      }, 5000);

      // SUCCESS FLOW - exactly from original Payment.tsx
      // Update user's subscription status in context
      if (user) {
        // Create subscription record in database
        try {
          const { error: subscriptionError } = await supabase
            .from('tbl_user_subscriptions')
            .insert({
              tus_user_id: user.id,
              tus_plan_id: finalSelectedPlan.id,
              tus_status: 'active',
              tus_start_date: new Date().toISOString(),
              tus_end_date: new Date(Date.now() + finalSelectedPlan.tsp_duration_days * 24 * 60 * 60 * 1000).toISOString(),
              tus_payment_amount: finalSelectedPlan.tsp_price
            });

          if (subscriptionError) {
            console.error('Failed to create subscription record:', subscriptionError);
          } else {
            console.log('✅ Subscription record created successfully');
          }
        } catch (dbError) {
          console.error('Database error creating subscription:', dbError);
        }
      }

      // Show success message - from original Payment.tsx
      toast.success('🎉 Payment Successful! Your subscription is now active.');

      // Redirect based on user type - from original Payment.tsx
      setTimeout(() => {
        if (user?.userType === 'company') {
          navigate('/company/dashboard');
        } else {
          navigate('/customer/dashboard');
        }
        // Reload the page to refresh user data with new subscription
        window.location.reload();
      }, 1500);

    } catch (error: any) {
      console.error('Payment error:', error);

      setTransactionState({
        isProcessing: false,
        hash: null,
        status: 'error',
        error: error.message || 'Payment failed',
        distributionSteps: [],
      });

      toast.dismiss();
      toast.error(error.message || 'Distribution failed');
    }
  };

  // Plan not found check - from original Payment.tsx
  if (!finalSelectedPlan) {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="bg-yellow-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">No Subscription Plans Available</h2>
            <p className="text-gray-600 mb-6">Please contact support to set up subscription plans.</p>
            <button
                onClick={() => navigate('/subscription-plans')}
                className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Select a Subscription Plan
            </button>
          </div>
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
        {/* Mandatory Subscription Notice */}
        {(location.state?.requiresSubscription || !user.hasActiveSubscription) && (
          <div className="max-w-4xl mx-auto mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
              <div className="flex items-center space-x-3">
                <div className="bg-yellow-100 p-2 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-yellow-800">Subscription Required</h3>
                  <p className="text-yellow-700">
                    {selectedPlan 
                      ? `Complete your payment for ${selectedPlan.tsp_name} (${selectedPlan.tsp_price} USDT) to access the dashboard.`
                      : 'You need an active subscription to access the dashboard. Please complete your payment below.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast notifications - enhanced styling */}
        <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1f2937',
                color: '#f9fafb',
                border: '1px solid #374151',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '500',
              },
              success: {
                style: {
                  background: '#065f46',
                  color: '#ecfdf5',
                  border: '1px solid #10b981',
                },
              },
              error: {
                style: {
                  background: '#7f1d1d',
                  color: '#fef2f2',
                  border: '1px solid #ef4444',
                },
              },
            }}
        />

        <div className="max-w-7xl mx-auto">
          {/* Enhanced Header section */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center space-x-4 mb-6">
              <div className="p-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg">
                <CreditCard className="w-10 h-10 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                  Complete Payment: {finalSelectedPlan.tsp_name}
                </h1>
                <p className="text-lg text-gray-600 mt-1">
                  Pay {finalSelectedPlan.tsp_price} USDT via Smart Contract
                </p>
              </div>
            </div>
            
            {/* Enhanced payment info banner */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-xl max-w-2xl mx-auto">
              <div className="flex items-center justify-center space-x-3 mb-3">
                <Zap className="w-6 h-6 text-yellow-300" />
                <h3 className="text-xl font-bold">
                  {finalSelectedPlan.tsp_name} - {finalSelectedPlan.tsp_price} USDT
                </h3>
                <Zap className="w-6 h-6 text-yellow-300" />
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <Shield className="w-5 h-5 mx-auto mb-1 text-green-300" />
                  <p className="text-sm font-medium">BNB Smart Chain</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <Lock className="w-5 h-5 mx-auto mb-1 text-blue-300" />
                  <p className="text-sm font-medium">Total: {finalSelectedPlan.tsp_price} USDT</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <CheckCircle className="w-5 h-5 mx-auto mb-1 text-emerald-300" />
                  <p className="text-sm font-medium">Instant Settlement</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Enhanced Order Summary */}
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-white/50">
              <div className="flex items-center space-x-3 mb-8">
                <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl">
                  <DollarSign className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Order Summary</h2>
              </div>

              {/* Plan details card */}
              <div className="bg-gradient-to-r from-gray-50 to-blue-50 border-2 border-gray-200 rounded-2xl p-6 mb-8">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{finalSelectedPlan.tsp_name}</h3>
                    <div className="flex items-center space-x-2">
                      <span className="bg-indigo-100 text-indigo-800 text-sm font-medium px-3 py-1 rounded-full">
                        {finalSelectedPlan.tsp_duration_days} days subscription
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-gray-900">{finalSelectedPlan.tsp_price}</span>
                    <span className="text-xl font-bold text-indigo-600 ml-1">USDT</span>
                  </div>
                </div>

                {/* Features list */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-800 mb-3">Included Features:</h4>
                  {finalSelectedPlan.tsp_features.map((feature, index) => (
                      <div key={index} className="flex items-center space-x-3 bg-white/50 rounded-lg p-3">
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                        <span className="text-gray-700 font-medium">{feature}</span>
                      </div>
                  ))}
                </div>
              </div>

              {/* Pricing breakdown */}
              <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700 font-medium">Subtotal</span>
                  <span className="text-gray-900 font-semibold">{finalSelectedPlan.tsp_price} USDT</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700 font-medium">Processing Fee</span>
                  <span className="text-green-600 font-semibold">0 USDT</span>
                </div>
                <div className="border-t-2 border-gray-200 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-bold text-gray-900">Total</span>
                    <span className="text-2xl font-bold text-indigo-600">{finalSelectedPlan.tsp_price} USDT</span>
                  </div>
                </div>
              </div>

              {/* Plan Selection Link */}
              <div className="mt-6 text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <Package className="h-5 w-5 text-blue-600" />
                    <span className="font-semibold text-blue-900">Selected Plan</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-900 mb-1">
                    {finalSelectedPlan.tsp_name}
                  </div>
                  <div className="text-lg font-semibold text-blue-700">
                    {finalSelectedPlan.tsp_price} USDT
                  </div>
                </div>
                <Link
                  to="/subscription-plans"
                  className="inline-flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 px-4 py-2 rounded-lg transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Change Selected Plan</span>
                </Link>
              </div>

              {/* Enhanced security section */}
              <div className="mt-8 bg-gradient-to-r from-green-50 via-blue-50 to-indigo-50 rounded-2xl p-6 border-2 border-green-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-6 w-6 text-green-600" />
                    <span className="text-lg font-bold text-green-900">Blockchain Protected</span>
                  </div>
                  <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-bold px-4 py-2 rounded-full">
                    USDT BEP-20
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/60 rounded-lg p-3 text-center">
                    <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-500" />
                    <span className="text-sm font-medium text-green-800">Smart Contract Verified</span>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3 text-center">
                    <Zap className="h-5 w-5 mx-auto mb-2 text-blue-500" />
                    <span className="text-sm font-medium text-blue-800">Instant Settlement</span>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3 text-center">
                    <DollarSign className="h-5 w-5 mx-auto mb-2 text-green-500" />
                    <span className="text-sm font-medium text-green-800">Zero Hidden Fees</span>
                  </div>
                  <div className="bg-white/60 rounded-lg p-3 text-center">
                    <Lock className="h-5 w-5 mx-auto mb-2 text-purple-500" />
                    <span className="text-sm font-medium text-purple-800">BSC Network</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Smart Contract Payment Section */}
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-2xl p-8 border border-white/50">
              <div className="flex items-center space-x-3 mb-8">
                <div className="p-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Smart Contract Payment</h2>
              </div>

              <div className="space-y-6">
                {/* Enhanced value proposition */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-indigo-600 rounded-lg">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-lg font-bold text-indigo-900">Why Choose Crypto Payment?</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 bg-white/60 rounded-lg p-3">
                      <div className="w-2 h-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"></div>
                      <span className="text-indigo-800 font-medium">Instant global transactions with USDT</span>
                    </div>
                    <div className="flex items-center space-x-3 bg-white/60 rounded-lg p-3">
                      <div className="w-2 h-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"></div>
                      <span className="text-indigo-800 font-medium">Lower fees than traditional payment methods</span>
                    </div>
                    <div className="flex items-center space-x-3 bg-white/60 rounded-lg p-3">
                      <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"></div>
                      <span className="text-indigo-800 font-medium">Transparent & verifiable on blockchain</span>
                    </div>
                  </div>
                </div>

                {/* Enhanced Debug section with better visibility */}
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-2xl p-6">
                  <h4 className="text-lg font-bold text-yellow-900 mb-4 flex items-center space-x-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span>Debug MetaMask Connection</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <button
                        onClick={async () => {
                          try {
                            if (window.ethereum) {
                              console.log('🔄 Refreshing MetaMask state...');
                              try {
                                await window.ethereum.request({ 
                                  method: 'wallet_getPermissions' 
                                });
                              } catch (e) {
                                console.log('Permissions check completed');
                              }
                              toast.success('MetaMask state refreshed. Try connecting again.');
                            } else {
                              toast.error('MetaMask not found!');
                            }
                          } catch (error) {
                            console.error('Refresh error:', error);
                            toast.error(`Refresh failed: ${error.message}`);
                          }
                        }}
                        className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 shadow-lg"
                    >
                      🔄 Refresh State
                    </button>
                    
                    <button
                        onClick={async () => {
                          console.log('=== MetaMask Debug Info ===');
                          console.log('window.ethereum exists:', !!window.ethereum);
                          console.log('MetaMask installed:', !!window.ethereum?.isMetaMask);
                          console.log('Detected wallets:', wallets);

                          if (window.ethereum) {
                            try {
                              const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                              console.log('Current accounts:', accounts);
                              const chainId = await window.ethereum.request({ method: 'eth_chainId' });
                              console.log('Current chain:', chainId);
                              
                              try {
                                const permissions = await window.ethereum.request({ 
                                  method: 'wallet_getPermissions' 
                                });
                                console.log('Current permissions:', permissions);
                              } catch (permError) {
                                console.log('Permissions check:', permError.message);
                              }

                              toast.success(`MetaMask: ${window.ethereum.isMetaMask ? 'Detected' : 'Not detected'}\nAccounts: ${accounts.length}\nChain: ${chainId}`);
                            } catch (error) {
                              console.error('MetaMask check error:', error);
                              
                              if (error.code === -32002) {
                                toast.error('MetaMask has pending requests. Please open MetaMask and clear them.');
                              } else {
                                toast.error(`Error: ${error.message}`);
                              }
                            }
                          } else {
                            toast.error('MetaMask not found!');
                          }
                        }}
                        className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 shadow-lg"
                    >
                      🔍 Check Status
                    </button>

                    <button
                        onClick={handleDirectMetaMaskConnect}
                        disabled={isConnecting}
                        className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 shadow-lg"
                    >
                      ⚡ Direct Connect
                    </button>
                  </div>
                  
                  {/* Enhanced debug info */}
                  <div className="bg-white/80 rounded-xl p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Wallets Detected:</span>
                        <span className="ml-2 text-gray-900 font-medium">{wallets.length}</span>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Is Connecting:</span>
                        <span className={`ml-2 font-medium ${isConnecting ? 'text-orange-600' : 'text-green-600'}`}>
                          {isConnecting ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Wallet Connected:</span>
                        <span className={`ml-2 font-medium ${walletState.isConnected ? 'text-green-600' : 'text-red-600'}`}>
                          {walletState.isConnected ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Network:</span>
                        <span className="ml-2 text-gray-900 font-medium">BSC Testnet</span>
                      </div>
                    </div>
                    <div className="bg-yellow-100 rounded-lg p-3 mt-4">
                      <p className="text-sm font-medium text-yellow-800">
                        <span className="font-bold">💡 Tip:</span> If you get "pending requests" error, open MetaMask extension and check for any pending popups or notifications.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Trust Indicators */}
                <TrustIndicators />

                {/* Enhanced Wallet Connection or Payment Section */}
                {!walletState.isConnected ? (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border-2 border-indigo-200">
                      <div className="text-center mb-6">
                        <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl inline-block mb-4">
                          <Wallet className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Connect Your Wallet</h3>
                        <p className="text-gray-600">Choose your preferred wallet to continue with the payment</p>
                      </div>
                      
                      {/* Enhanced WalletSelector with better visibility */}
                      <div className="space-y-4">
                        
                        <WalletSelector
                            wallets={wallets}
                            onConnect={handleConnectWallet}
                            isConnecting={isConnecting}
                        />
                        
                        {/* Fallback message if no wallets detected */}
                        {wallets.length === 0 && (
                          <div className="bg-white/80 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                            <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <h4 className="text-lg font-semibold text-gray-700 mb-2">No Wallets Detected</h4>
                            <p className="text-gray-600 mb-4">Please install MetaMask or another compatible wallet to continue.</p>
                            <a 
                              href="https://metamask.io/download/" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 shadow-lg inline-block"
                            >
                              Install MetaMask
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                      {/* Enhanced Wallet Info */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border-2 border-green-200">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="p-2 bg-green-500 rounded-lg">
                            <CheckCircle className="h-5 w-5 text-white" />
                          </div>
                          <h3 className="text-lg font-bold text-green-900">Wallet Connected</h3>
                        </div>
                        <WalletInfo
                            wallet={walletState}
                            onDisconnect={handleDisconnectWallet}
                        />
                      </div>

                      {/* Enhanced Payment Section */}
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border-2 border-purple-200">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="p-2 bg-purple-500 rounded-lg">
                            <CreditCard className="h-5 w-5 text-white" />
                          </div>
                          <h3 className="text-lg font-bold text-purple-900">Execute Payment</h3>
                        </div>
                        <PaymentSection
                            onPayment={handleSmartContractPayment}
                            transaction={transactionState}
                            distributionSteps={transactionState.distributionSteps}
                            planPrice={finalSelectedPlan.tsp_price}
                        />
                      </div>
                    </div>
                )}

                {/* Enhanced Footer note */}
                <div className="bg-gradient-to-r from-gray-100 to-blue-100 rounded-2xl p-6 text-center border-2 border-gray-200">
                  <div className="flex items-center justify-center space-x-2 mb-3">
                    <Shield className="w-5 h-5 text-blue-600" />
                    <Lock className="w-5 h-5 text-green-600" />
                    <Zap className="w-5 h-5 text-purple-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    This uses BNB Smart Chain Testnet. No real funds are involved.
                  </p>
                  <div className="flex items-center justify-center space-x-4 text-xs text-gray-600">
                    <span className="bg-white/70 px-3 py-1 rounded-full font-medium">USDT Distribution</span>
                    <span className="bg-white/70 px-3 py-1 rounded-full font-medium">Secure</span>
                    <span className="bg-white/70 px-3 py-1 rounded-full font-medium">Encrypted</span>
                  </div>
                </div>
              </div>

              {/* Enhanced Terms section */}
              <div className="mt-8 bg-gray-50 rounded-2xl p-6 border-2 border-gray-200">
                <div className="flex items-start space-x-3">
                  <div className="p-1 bg-blue-500 rounded-full mt-1">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700 leading-relaxed">
                      By completing this payment, you agree to our{' '}
                      <a href="/terms" className="text-blue-600 hover:text-blue-800 font-semibold underline">
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a href="/privacy" className="text-blue-600 hover:text-blue-800 font-semibold underline">
                        Privacy Policy
                      </a>.
                      Your subscription will be activated immediately upon successful payment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Bottom Banner */}
          <div className="mt-12 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-3xl p-8 text-white text-center shadow-2xl">
            <div className="flex items-center justify-center space-x-4 mb-4">
              <Shield className="w-8 h-8 text-green-300" />
              <h3 className="text-2xl font-bold">Secure & Transparent Payment</h3>
              <Lock className="w-8 h-8 text-blue-300" />
            </div>
            <p className="text-lg text-white/90 mb-6 max-w-3xl mx-auto">
              Experience the future of payments with blockchain technology. Every transaction is recorded on the blockchain for complete transparency and security.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <Zap className="w-6 h-6 mx-auto mb-2 text-yellow-300" />
                <h4 className="font-semibold mb-1">Lightning Fast</h4>
                <p className="text-sm text-white/80">Instant transactions</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <Shield className="w-6 h-6 mx-auto mb-2 text-green-300" />
                <h4 className="font-semibold mb-1">Bank-Grade Security</h4>
                <p className="text-sm text-white/80">Military encryption</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <DollarSign className="w-6 h-6 mx-auto mb-2 text-blue-300" />
                <h4 className="font-semibold mb-1">Low Fees</h4>
                <p className="text-sm text-white/80">Minimal transaction costs</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                <CheckCircle className="w-6 h-6 mx-auto mb-2 text-purple-300" />
                <h4 className="font-semibold mb-1">100% Verified</h4>
                <p className="text-sm text-white/80">Smart contract audited</p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default Payment;