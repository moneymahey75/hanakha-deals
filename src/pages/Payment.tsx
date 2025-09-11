import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
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

// Helper function to determine wallet type from provider
const getWalletType = (provider: any): string => {
  if (provider.isMetaMask) return 'metamask';
  if (provider.isTrust) return 'trust';
  if (provider.isSafePal) return 'safepal';
  if (provider.isBinanceChain || provider.isBinance) return 'binance';
  return 'web3';
};

const Payment: React.FC = () => {
  const { user, fetchUserData } = useAuth();
  const { settings } = useAdmin();
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
  const [lastConnectedWallet, setLastConnectedWallet] = useState<any>(null);

  // Load saved wallet connections on component mount
  useEffect(() => {
    const loadSavedWalletConnections = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
            .from('tbl_user_wallet_connections')
            .select('tuwc_wallet_address, tuwc_wallet_name, tuwc_wallet_type, tuwc_chain_id, tuwc_last_connected_at')
            .eq('tuwc_user_id', user.id)
            .eq('tuwc_is_active', true)
            .order('tuwc_last_connected_at', { ascending: false })
            .limit(1)
            .single();

        if (data && !error) {
          setLastConnectedWallet(data);
        }
      } catch (error) {
        console.error('Error loading saved wallet connections:', error);
      }
    };

    loadSavedWalletConnections();
  }, [user]);

  // Configure wallet service with admin settings
  useEffect(() => {
    if (settings) {
      // Validate admin settings before using them
      if (!validateAddress(settings.usdtAddress) && settings.usdtAddress !== '') {
        console.error('Invalid USDT address in settings');
        notification.showError('Configuration Error', 'Invalid USDT contract address');
        return;
      }

      if (!validateAddress(settings.subscriptionContractAddress) && settings.subscriptionContractAddress !== '') {
        console.error('Invalid subscription contract address in settings');
        notification.showError('Configuration Error', 'Invalid subscription contract address');
        return;
      }

      if (!validateAddress(settings.subscriptionWalletAddress) && settings.subscriptionWalletAddress !== '') {
        console.error('Invalid subscription wallet address in settings');
        notification.showError('Configuration Error', 'Invalid subscription wallet address');
        return;
      }

      walletService.setAdminSettings({
        paymentMode: settings.paymentMode?.toString() || '0',
        usdtAddress: settings.usdtAddress || '',
        subscriptionContractAddress: settings.subscriptionContractAddress || '',
        subscriptionWalletAddress: settings.subscriptionWalletAddress || ''
      });
    }
  }, [settings, walletService, notification]);

  useEffect(() => {
    // Validate and get selected plan from navigation state
    const planFromState = location.state?.selectedPlan;

    if (planFromState) {
      // Validate plan data
      if (!planFromState.tsp_id || !planFromState.tsp_name ||
          !validatePrice(planFromState.tsp_price)) {
        notification.showError('Invalid Plan', 'The selected plan contains invalid data.');
        navigate('/subscription-plans', { replace: true });
        return;
      }

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

  // Input validation functions
  const validateAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const validatePrice = (price: number): boolean => {
    return price > 0 && price < 1000000; // Reasonable upper limit
  };

  // Save wallet connection to database
  const saveWalletConnection = async (address: string, walletName: string, walletType: string, chainId: number | null) => {
    if (!user || !address) return;

    try {
      // First, deactivate any existing active connections for this user
      await supabase
          .from('tbl_user_wallet_connections')
          .update({
            tuwc_is_active: false,
            tuwc_updated_at: new Date().toISOString()
          })
          .eq('tuwc_user_id', user.id)
          .eq('tuwc_is_active', true);

      // Check if this wallet already exists for the user
      const { data: existingWallet } = await supabase
          .from('tbl_user_wallet_connections')
          .select('tuwc_id')
          .eq('tuwc_user_id', user.id)
          .eq('tuwc_wallet_address', address)
          .single();

      if (existingWallet) {
        // Update existing wallet to be active and update timestamp
        await supabase
            .from('tbl_user_wallet_connections')
            .update({
              tuwc_is_active: true,
              tuwc_last_connected_at: new Date().toISOString(),
              tuwc_updated_at: new Date().toISOString()
            })
            .eq('tuwc_id', existingWallet.tuwc_id);
      } else {
        // Insert new wallet connection
        await supabase
            .from('tbl_user_wallet_connections')
            .insert({
              tuwc_user_id: user.id,
              tuwc_wallet_address: address,
              tuwc_wallet_name: walletName,
              tuwc_wallet_type: walletType,
              tuwc_chain_id: chainId,
              tuwc_is_active: true,
              tuwc_last_connected_at: new Date().toISOString()
            });
      }

      // Update local state
      setLastConnectedWallet({
        tuwc_wallet_address: address,
        tuwc_wallet_name: walletName,
        tuwc_wallet_type: walletType,
        tuwc_chain_id: chainId,
        tuwc_last_connected_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving wallet connection:', error);
      // Don't show error to user as this is a non-critical operation
    }
  };

  const handleWalletConnect = async (provider: any) => {
    setIsConnecting(true);
    try {
      // Validate admin settings before connecting
      if (!settings) {
        throw new Error('Admin settings not configured. Please contact support.');
      }

      const wallet = await walletService.connectWallet(provider);
      setWalletState(wallet);

      // Save wallet connection to database
      if (wallet.address) {
        const walletType = getWalletType(provider);
        await saveWalletConnection(
            wallet.address,
            wallet.walletName || 'Unknown Wallet',
            walletType,
            wallet.chainId
        );
      }

      notification.showSuccess('Wallet Connected', `Successfully connected to ${wallet.walletName}`);
    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      const errorMessage = error.message || 'Failed to connect wallet';

      // Sanitize error message before showing to user
      const sanitizedError = errorMessage.replace(/[<>]/g, '');
      notification.showError('Connection Failed', sanitizedError);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleWalletDisconnect = async () => {
    try {
      // Deactivate wallet connection in database
      if (user && walletState.address) {
        await supabase
            .from('tbl_user_wallet_connections')
            .update({
              tuwc_is_active: false,
              tuwc_updated_at: new Date().toISOString()
            })
            .eq('tuwc_user_id', user.id)
            .eq('tuwc_wallet_address', walletState.address);
      }
    } catch (error) {
      console.error('Error updating wallet connection status:', error);
    }

    walletService.disconnect();
    setWalletState({
      isConnected: false,
      address: null,
      chainId: null,
      balance: '0',
      usdtBalance: '0',
      walletName: null,
    });
    setLastConnectedWallet(null);
    notification.showInfo('Wallet Disconnected', 'Wallet has been disconnected');
  };

  const handlePayment = async () => {
    // Input validation
    if (!selectedPlan || !user) {
      notification.showError('Error', 'Missing plan or user information');
      return;
    }

    if (!walletState.isConnected || !walletState.address) {
      notification.showError('Wallet Required', 'Please connect your wallet first');
      return;
    }

    if (!validateAddress(walletState.address)) {
      notification.showError('Invalid Wallet', 'Connected wallet address is invalid');
      return;
    }

    // Ensure admin settings are configured before payment
    if (!settings) {
      notification.showError('Configuration Error', 'Admin settings not loaded. Please refresh the page.');
      return;
    }

    // Validate settings addresses
    if (!validateAddress(settings.usdtAddress) && settings.usdtAddress !== '') {
      notification.showError('Configuration Error', 'Invalid USDT contract address in settings');
      return;
    }

    if (!validateAddress(settings.subscriptionContractAddress) && settings.subscriptionContractAddress !== '') {
      notification.showError('Configuration Error', 'Invalid subscription contract address in settings');
      return;
    }

    if (!validateAddress(settings.subscriptionWalletAddress) && settings.subscriptionWalletAddress !== '') {
      notification.showError('Configuration Error', 'Invalid subscription wallet address in settings');
      return;
    }

    // Set admin settings again before payment to ensure they're current
    walletService.setAdminSettings({
      paymentMode: settings.paymentMode?.toString() || '0',
      usdtAddress: settings.usdtAddress || '',
      subscriptionContractAddress: settings.subscriptionContractAddress || '',
      subscriptionWalletAddress: settings.subscriptionWalletAddress || ''
    });

    const usdtBalance = parseFloat(walletState.usdtBalance);
    if (usdtBalance < selectedPlan.tsp_price) {
      notification.showError(
          'Insufficient Balance',
          `You need at least ${selectedPlan.tsp_price} USDT to complete this payment. Current balance: ${usdtBalance} USDT`
      );
      return;
    }

    // Reset transaction state
    setTransaction({
      isProcessing: true,
      hash: null,
      status: 'pending',
      error: null,
      distributionSteps: []
    });

    let subscriptionData = null;
    let paymentData = null;

    try {
      console.log('Processing smart contract payment for plan:', selectedPlan.tsp_name);

      // Execute USDT distribution
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
        throw new Error(`Subscription creation failed: ${subscriptionError.message}`);
      }

      console.log('✅ Subscription created:', subscriptionData);

      // Create payment record with dynamic contract address
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
              blockchain: settings.paymentMode == '1' ? 'BSC Mainnet' : 'BSC Testnet',
              contract_address: settings.subscriptionContractAddress,
              usdt_contract: settings.usdtAddress,
              subscription_wallet: settings.subscriptionWalletAddress,
              transaction_hash: hash,
              wallet_address: walletState.address,
              processed_at: new Date().toISOString(),
              status: 'success',
              steps: steps
            }
          })
          .select()
          .single();

      if (paymentError) {
        console.error('Payment record creation failed:', paymentError);
        throw new Error('Failed to create payment record');
      }

      console.log('✅ Payment record created:', paymentData);

      // Refresh user data to update subscription status
      await fetchUserData(user.id);

      notification.showSuccess('Payment Successful!', 'Your subscription has been activated via blockchain.');

      // Set processing to false after everything is completed
      setTransaction(prev => ({
        ...prev,
        isProcessing: false
      }));

    } catch (error: any) {
      console.error('Payment processing failed:', error);

      const errorMessage = error?.message || 'Payment processing failed';

      // Set error state and stop processing
      setTransaction({
        isProcessing: false,
        hash: transaction.hash,
        status: 'error',
        error: errorMessage,
        distributionSteps: transaction.distributionSteps
      });

      try {
        const { data: failedPayment, error: dbError } = await supabase
            .from('tbl_payments')
            .insert({
              tp_user_id: user.id,
              tp_subscription_id: subscriptionData?.tus_id || null,
              tp_amount: selectedPlan.tsp_price,
              tp_currency: 'USDT',
              tp_payment_method: 'blockchain',
              tp_payment_status: 'failed',
              tp_transaction_id: transaction.hash,
              tp_error_message: errorMessage,
              tp_gateway_response: {
                blockchain: settings.paymentMode == '1' ? 'BSC Mainnet' : 'BSC Testnet',
                contract_address: settings.subscriptionContractAddress,
                usdt_contract: settings.usdtAddress,
                subscription_wallet: settings.subscriptionWalletAddress,
                transaction_hash: transaction.hash,
                wallet_address: walletState.address,
                processed_at: new Date().toISOString(),
                status: 'failed',
                error: errorMessage,
                steps: transaction.distributionSteps,
                error_details: error?.response?.data || error?.toString()
              }
            })
            .select()
            .single();

        if (dbError) {
          console.error('❌ Failed to save failed payment record:', dbError);
        } else {
          console.log('✅ Failed payment record created:', failedPayment);
        }
      } catch (dbError) {
        console.error('❌ Error saving failed payment to database:', dbError);
      }

      notification.showError('Payment Failed', errorMessage);
    }
  };

  const handleGoToDashboard = () => {
    navigate('/customer/dashboard', {
      state: {
        paymentSuccess: true,
        planName: selectedPlan?.tsp_name,
        transactionHash: transaction.hash
      }
    });
  };

  const handleReconnectPreviousWallet = async () => {
    if (!lastConnectedWallet || !availableWallets.length) return;

    try {
      setIsConnecting(true);

      // Find the appropriate provider for the wallet type
      let provider = null;
      const walletType = lastConnectedWallet.tuwc_wallet_type;

      if (walletType === 'metamask' && window.ethereum?.isMetaMask) {
        provider = window.ethereum;
      } else if (walletType === 'trust' && window.ethereum?.isTrust) {
        provider = window.ethereum;
      } else if (walletType === 'safepal' && window.ethereum?.isSafePal) {
        provider = window.ethereum;
      } else if (walletType === 'binance' && window.BinanceChain) {
        provider = window.BinanceChain;
      } else if (window.ethereum) {
        // Fallback to generic Ethereum provider
        provider = window.ethereum;
      }

      if (!provider) {
        notification.showError('Wallet Not Available', 'The previously used wallet is not available. Please install it and try again.');
        return;
      }

      const wallet = await walletService.connectWallet(provider);
      setWalletState(wallet);

      // Update wallet connection in database
      await saveWalletConnection(
          wallet.address!,
          wallet.walletName || 'Unknown Wallet',
          walletType,
          wallet.chainId
      );

      notification.showSuccess('Wallet Reconnected', `Successfully reconnected to ${wallet.walletName}`);
    } catch (error: any) {
      console.error('Wallet reconnection failed:', error);
      const errorMessage = error.message || 'Failed to reconnect wallet';
      notification.showError('Reconnection Failed', errorMessage);
    } finally {
      setIsConnecting(false);
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
            <p className="text-purple-200">
              Secure blockchain payment processing
              {settings && (
                  <span className="ml-2 px-2 py-1 bg-purple-600/30 rounded-md text-sm">
                {settings.paymentMode === '1' ? 'BSC Mainnet' : 'BSC Testnet'}
              </span>
              )}
            </p>
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

                    {lastConnectedWallet && (
                        <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl p-4 mb-6">
                          <div className="flex items-center space-x-2 mb-2">
                            <Shield className="w-5 h-5 text-blue-300" />
                            <span className="font-medium text-blue-200">Previously Connected Wallet</span>
                          </div>
                          <div className="text-blue-100 text-sm">
                            <p className="break-all">{lastConnectedWallet.tuwc_wallet_address}</p>
                            <p className="text-blue-200 mt-1">
                              {lastConnectedWallet.tuwc_wallet_name} •
                              Last connected: {new Date(lastConnectedWallet.tuwc_last_connected_at).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                              onClick={handleReconnectPreviousWallet}
                              disabled={isConnecting}
                              className="mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                          >
                            {isConnecting ? 'Reconnecting...' : 'Reconnect Previous Wallet'}
                          </button>
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
                        settings={settings}
                    />
                    <PaymentSection
                        onPayment={handlePayment}
                        transaction={transaction}
                        distributionSteps={transaction.distributionSteps}
                        planPrice={selectedPlan.tsp_price}
                        settings={settings}
                        onGoToDashboard={handleGoToDashboard}
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
                <h4 className="font-medium text-white mb-2">Verify & Access</h4>
                <p>Verify your transaction using the provided link, then proceed to dashboard.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default Payment;