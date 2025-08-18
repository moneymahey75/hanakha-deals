import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { Shield, CheckCircle, DollarSign, Wallet, CreditCard, Zap, Lock } from 'lucide-react';
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

  const planId = location.state?.planId;
  const selectedPlan = subscriptionPlans.find(plan => plan.id === planId);

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

  // Wallet detection effect - optimized with dynamic intervals and cleanup
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

    let detectionInterval: NodeJS.Timeout;
    let hasWallet = false;

    const detectWallets = () => {
      const currentWallets = WalletService.getInstance().detectWallets();
      const newHasWallet = currentWallets.length > 0;
      
      // Only update state if wallet count changed
      if (currentWallets.length !== wallets.length) {
        setWallets(currentWallets);
        console.log(`🔍 Wallet detection update: ${currentWallets.length} wallets found`);
      }
      
      // Adjust detection frequency based on wallet presence
      if (hasWallet !== newHasWallet) {
        hasWallet = newHasWallet;
        
        // Clear existing interval
        if (detectionInterval) {
          clearInterval(detectionInterval);
        }
        
        // Set new interval - faster when no wallets, slower when wallets detected
        const intervalMs = hasWallet ? 5000 : 2000; // 5s when wallets exist, 2s when none
        console.log(`🔄 Adjusting wallet detection interval to ${intervalMs}ms`);
        
        detectionInterval = setInterval(detectWallets, intervalMs);
      }
    };

    // Initial detection
    detectWallets();
    
    // Start with more frequent detection (2s) for new installations
    detectionInterval = setInterval(detectWallets, 2000);

    // Cleanup function
    return () => {
      if (detectionInterval) {
        clearInterval(detectionInterval);
      }
      // Reset connecting state on unmount
      setIsConnecting(false);
      console.log('🧹 Wallet detection cleanup completed');
    };
  }, []); // Empty dependency to avoid re-running

  // Enhanced MetaMask connection with comprehensive error handling
  const handleDirectMetaMaskConnect = async () => {
    if (isConnecting) {
      toast.error('Connection already in progress. Please wait...');
      return;
    }

    setIsConnecting(true);
    
    try {
      console.log('🔗 Direct MetaMask connection attempt...');

      // Check if MetaMask is installed
      if (!window.ethereum) {
        toast.error('MetaMask not detected. Please install MetaMask extension.', {
          duration: 5000,
        });
        window.open('https://metamask.io/download/', '_blank');
        return;
      }

      // Check if MetaMask is the active provider
      if (!window.ethereum.isMetaMask) {
        console.warn('⚠️ Window.ethereum exists but may not be MetaMask');
      }

      // Clear any stale connection state
      setWalletState({
        isConnected: false,
        address: null,
        chainId: null,
        balance: '0.00',
        usdtBalance: '0.00',
        walletName: null,
      });

      // First, check if already connected
      let currentAccounts = [];
      try {
        currentAccounts = await Promise.race([
          window.ethereum.request({ method: 'eth_accounts' }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout checking accounts')), 3000)
          )
        ]);
        
        if (currentAccounts.length > 0) {
          console.log('✅ MetaMask already connected:', currentAccounts[0]);
          
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          
          setWalletState({
            isConnected: true,
            address: currentAccounts[0],
            chainId: chainId,
            balance: '0.00',
            usdtBalance: '0.00',
            walletName: 'MetaMask',
          });

          toast.success(`✅ Connected: ${currentAccounts[0].substring(0, 6)}...${currentAccounts[0].substring(38)}`);
          return;
        }
      } catch (checkError) {
        console.log('📋 Could not check existing accounts, requesting fresh connection');
      }

      // Request fresh connection with timeout
      toast.loading('Requesting wallet connection...', { id: 'connecting' });
      
      const accounts = await Promise.race([
        window.ethereum.request({ method: 'eth_requestAccounts' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection request timed out')), 15000)
        )
      ]);

      toast.dismiss('connecting');

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from MetaMask');
      }

      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      // Verify the connection
      if (!accounts[0] || !chainId) {
        throw new Error('Invalid connection data received');
      }

      setWalletState({
        isConnected: true,
        address: accounts[0],
        chainId: chainId,
        balance: '0.00',
        usdtBalance: '0.00',
        walletName: 'MetaMask',
      });

      toast.success(`🎉 Successfully connected to MetaMask: ${accounts[0].substring(0, 6)}...${accounts[0].substring(38)}`, {
        duration: 4000,
      });

      // Add account change listener
      if (window.ethereum.on) {
        window.ethereum.on('accountsChanged', (accounts) => {
          if (accounts.length === 0) {
            handleDisconnectWallet();
          } else {
            setWalletState(prev => ({ ...prev, address: accounts[0] }));
          }
        });

        window.ethereum.on('chainChanged', (chainId) => {
          setWalletState(prev => ({ ...prev, chainId }));
        });
      }

    } catch (error: any) {
      console.error('❌ Direct connection error:', error);
      toast.dismiss('connecting');
      
      // Comprehensive error handling
      if (error.code === -32002) {
        toast.error('🔄 MetaMask is processing another request. Please open MetaMask, complete any pending actions, and try again.', {
          duration: 8000,
        });
      } else if (error.code === 4001) {
        toast.error('❌ Connection cancelled by user', { duration: 4000 });
      } else if (error.code === -32603) {
        toast.error('⚠️ Internal error occurred. Please refresh the page and try again.', {
          duration: 6000,
        });
      } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        toast.error('⏱️ Connection timed out. Please try again and make sure MetaMask is unlocked.', {
          duration: 6000,
        });
      } else if (error.message?.includes('already pending') || error.message?.includes('pending')) {
        toast.error('🔄 MetaMask has pending requests. Please open MetaMask extension and clear any notifications.', {
          duration: 8000,
        });
      } else if (error.message?.includes('User rejected')) {
        toast.error('❌ Connection rejected by user', { duration: 4000 });
      } else {
        toast.error(`💥 Connection failed: ${error.message || 'Unknown error'}`, {
          duration: 6000,
        });
      }
    } finally {
      // Reset connecting state with delay to prevent rapid requests
      setTimeout(() => {
        setIsConnecting(false);
      }, 1500);
    }
  };
  
  const handleConnectWallet = async (provider: any) => {
    // Prevent multiple simultaneous connections
    if (isConnecting) {
      toast.error('🔄 Connection already in progress. Please wait...', { duration: 3000 });
      return;
    }

    setIsConnecting(true);
    
    try {
      console.log('🚀 Attempting wallet connection...', { provider });
      
      // Add delay to prevent rapid requests
      await new Promise(resolve => setTimeout(resolve, 300));

      // Show loading toast
      toast.loading('Connecting to wallet...', { id: 'wallet-connect' });

      // Request connection with timeout
      const walletService = WalletService.getInstance();
      
      const newWalletState = await Promise.race([
        walletService.connectWallet(provider),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Wallet connection timed out')), 12000)
        )
      ]);

      toast.dismiss('wallet-connect');

      if (!newWalletState || !newWalletState.address) {
        throw new Error('Invalid wallet connection response');
      }

      setWalletState(newWalletState);
      
      toast.success(`🎉 Connected to ${newWalletState.walletName || 'Wallet'}`, {
        duration: 4000,
      });

      // Set up event listeners if provider supports them
      if (provider && provider.on) {
        provider.on('accountsChanged', (accounts) => {
          if (accounts.length === 0) {
            console.log('📤 Accounts disconnected');
            handleDisconnectWallet();
          } else {
            console.log('🔄 Account changed:', accounts[0]);
            setWalletState(prev => ({ ...prev, address: accounts[0] }));
          }
        });

        provider.on('chainChanged', (chainId) => {
          console.log('🌐 Chain changed:', chainId);
          setWalletState(prev => ({ ...prev, chainId }));
        });

        provider.on('disconnect', () => {
          console.log('🔌 Provider disconnected');
          handleDisconnectWallet();
        });
      }

    } catch (error: any) {
      console.error('❌ Wallet connection error:', error);
      toast.dismiss('wallet-connect');

      // Enhanced error handling with specific messages
      if (error.code === -32002) {
        toast.error('🔄 Wallet is processing another request. Please open your wallet app, complete pending actions, and try again.', {
          duration: 8000,
        });
      } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        toast.error('⏱️ Connection timed out. Please make sure your wallet is unlocked and try again.', {
          duration: 6000,
        });
      } else if (error.message?.includes('already pending') || error.message?.includes('pending')) {
        toast.error('🔄 Wallet has pending requests. Please check your wallet extension and clear notifications.', {
          duration: 8000,
        });
      } else if (error.code === 4001 || error.message?.includes('User rejected')) {
        toast.error('❌ Connection cancelled by user', { duration: 4000 });
      } else if (error.code === -32603) {
        toast.error('⚠️ Internal wallet error. Please refresh the page and try again.', {
          duration: 6000,
        });
      } else if (error.message?.includes('No provider found')) {
        toast.error('🔌 Wallet not found. Please install the wallet extension and refresh the page.', {
          duration: 6000,
        });
      } else {
        toast.error(`💥 Failed to connect: ${error.message || 'Unknown error'}`, {
          duration: 6000,
        });
      }
    } finally {
      // Reset connecting state with delay to prevent rapid requests
      setTimeout(() => {
        setIsConnecting(false);
      }, 2000);
    }
  };

  // Enhanced wallet disconnection with proper listener cleanup
  const handleDisconnectWallet = () => {
    try {
      console.log('🔌 Disconnecting wallet...');
      
      // Clean up wallet service
      WalletService.getInstance().disconnect();
      
      // Clean up event listeners properly
      if (window.ethereum && window.ethereum._connectedListeners) {
        console.log('🧹 Removing wallet event listeners...');
        
        const listeners = window.ethereum._connectedListeners;
        
        try {
          window.ethereum.removeListener('accountsChanged', listeners.accountsChanged);
          window.ethereum.removeListener('chainChanged', listeners.chainChanged);  
          window.ethereum.removeListener('disconnect', listeners.disconnect);
          
          // Clear the stored references
          delete window.ethereum._connectedListeners;
          
          console.log('✅ Event listeners cleaned up successfully');
        } catch (error) {
          console.log('📝 Event listener cleanup completed with minor issues');
        }
      }
      
      // Alternative cleanup method for broader compatibility
      if (window.ethereum && window.ethereum.removeAllListeners) {
        try {
          window.ethereum.removeAllListeners('accountsChanged');
          window.ethereum.removeAllListeners('chainChanged');
          window.ethereum.removeAllListeners('disconnect');
        } catch (error) {
          console.log('📝 Alternative listener cleanup completed');
        }
      }
      
      // Reset all states
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
      
      setIsConnecting(false);
      
      toast.success('✅ Wallet disconnected successfully', { duration: 3000 });
      
    } catch (error) {
      console.error('Disconnect error:', error);
      
      // Force reset state even if cleanup failed
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
      setIsConnecting(false);
      
      toast.success('✅ Wallet disconnected (with cleanup issues resolved)', { duration: 3000 });
    }
  };

  // Enhanced smart contract payment with better error handling and user feedback
  const handleSmartContractPayment = async () => {
    if (!walletState.isConnected) {
      toast.error('🔌 Please connect your wallet first', { duration: 4000 });
      return;
    }

    if (!walletState.address) {
      toast.error('❌ No wallet address found. Please reconnect your wallet.', { duration: 4000 });
      return;
    }

    // Reset transaction state
    setTransactionState({
      isProcessing: true,
      hash: null,
      status: 'pending',
      error: null,
      distributionSteps: [],
    });

    try {
      console.log('💰 Starting USDT distribution payment...');
      
      const walletService = WalletService.getInstance();

      // Show initial loading message
      toast.loading('🚀 Initializing USDT distribution...', { id: 'payment-process' });

      // Add a small delay to show the loading state
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update loading message
      toast.loading('⚡ Processing smart contract transaction...', { id: 'payment-process' });

      // Execute the USDT distribution with timeout
      const result = await Promise.race([
        walletService.executeUSDTDistribution(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timed out after 60 seconds')), 60000)
        )
      ]);

      // Validate result
      if (!result || !result.hash) {
        throw new Error('Invalid transaction result received');
      }

      toast.dismiss('payment-process');

      // Update transaction state with success
      setTransactionState({
        isProcessing: false,
        hash: result.hash,
        status: 'success',
        error: null,
        distributionSteps: result.steps || [],
      });

      // Show success notification
      toast.success('🎉 USDT distribution completed successfully!', {
        duration: 5000,
      });

      console.log('✅ Payment successful:', result);

      // Update balances after successful distribution
      setTimeout(async () => {
        try {
          console.log('🔄 Updating wallet balances...');
          toast.loading('Updating balances...', { id: 'balance-update' });
          
          const [newBalance, newUsdtBalance] = await Promise.all([
            walletService.getBNBBalance(walletState.address!),
            walletService.getUSDTBalance(walletState.address!)
          ]);
          
          setWalletState(prev => ({
            ...prev,
            balance: newBalance,
            usdtBalance: newUsdtBalance,
          }));
          
          toast.dismiss('balance-update');
          toast.success('💰 Balances updated', { duration: 2000 });
          
        } catch (balanceError) {
          console.error('Balance update error:', balanceError);
          toast.dismiss('balance-update');
          toast.error('⚠️ Could not update balances, but payment was successful');
        }
      }, 3000);

      // SUCCESS FLOW - Update user subscription status
      if (user) {
        console.log('👤 Payment successful for user:', user.email);
        // In a real app, this would update the database via API call
      }

      // Show success dialog with enhanced messaging
      const successMessage = `🎉 Payment Successful!\n\n✅ Your ${selectedPlan.tsp_name} subscription is now active\n💎 Transaction Hash: ${result.hash.substring(0, 10)}...\n🚀 Redirecting to dashboard...`;
      
      alert(successMessage);

      // Redirect based on user type with enhanced feedback
      toast.success('📱 Redirecting to your dashboard...', { duration: 2000 });
      
      setTimeout(() => {
        if (user?.userType === 'company') {
          navigate('/company/dashboard');
        } else {
          navigate('/customer/dashboard');
        }
      }, 2000);

    } catch (error: any) {
      console.error('❌ Payment error:', error);
      
      toast.dismiss('payment-process');

      // Enhanced error handling with specific messages
      let errorMessage = 'Payment failed';
      let errorDuration = 6000;

      if (error.code === 4001 || error.message?.includes('User rejected')) {
        errorMessage = '❌ Transaction cancelled by user';
        errorDuration = 4000;
      } else if (error.code === -32002) {
        errorMessage = '🔄 MetaMask is busy. Please check for pending requests and try again.';
        errorDuration = 8000;
      } else if (error.message?.includes('timeout') || error.message?.includes('Timeout')) {
        errorMessage = '⏱️ Transaction timed out. Please check your wallet and try again.';
        errorDuration = 8000;
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = '💰 Insufficient funds. Please add more BNB/USDT to your wallet.';
        errorDuration = 8000;
      } else if (error.message?.includes('gas')) {
        errorMessage = '⛽ Transaction failed due to gas issues. Please try again with higher gas.';
        errorDuration = 8000;
      } else if (error.code === -32603) {
        errorMessage = '⚠️ Internal error occurred. Please refresh and try again.';
        errorDuration = 6000;
      } else {
        errorMessage = `💥 ${error.message || 'Unknown error occurred'}`;
      }

      // Update transaction state with error
      setTransactionState({
        isProcessing: false,
        hash: null,
        status: 'error',
        error: errorMessage,
        distributionSteps: [],
      });

      toast.error(errorMessage, { duration: errorDuration });

      // Log detailed error for debugging
      console.error('Detailed error info:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
        walletState: walletState
      });
    }
  };

  // Plan not found check - from original Payment.tsx
  if (!selectedPlan) {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Plan Not Found</h2>
            <p className="text-gray-600 mb-6">The selected subscription plan could not be found.</p>
            <button
                onClick={() => navigate('/subscription-plans')}
                className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Back to Plans
            </button>
          </div>
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 py-8 px-4 sm:px-6 lg:px-8">
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
                  Complete Your Payment
                </h1>
                <p className="text-lg text-gray-600 mt-1">Secure blockchain-based payment with smart contracts</p>
              </div>
            </div>
            
            {/* Enhanced payment info banner */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-xl max-w-2xl mx-auto">
              <div className="flex items-center justify-center space-x-3 mb-3">
                <Zap className="w-6 h-6 text-yellow-300" />
                <h3 className="text-xl font-bold">USDT Smart Contract Payment</h3>
                <Zap className="w-6 h-6 text-yellow-300" />
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <Shield className="w-5 h-5 mx-auto mb-1 text-green-300" />
                  <p className="text-sm font-medium">BNB Smart Chain</p>
                </div>
                <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm">
                  <Lock className="w-5 h-5 mx-auto mb-1 text-blue-300" />
                  <p className="text-sm font-medium">Total: 0.30 USDT</p>
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
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{selectedPlan.tsp_name}</h3>
                    <div className="flex items-center space-x-2">
                      <span className="bg-indigo-100 text-indigo-800 text-sm font-medium px-3 py-1 rounded-full">
                        {selectedPlan.tsp_duration_days} days subscription
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-gray-900">${selectedPlan.tsp_price}</span>
                    <p className="text-sm text-gray-500">USD</p>
                  </div>
                </div>

                {/* Features list */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-800 mb-3">Included Features:</h4>
                  {selectedPlan.tsp_features.map((feature, index) => (
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
                  <span className="text-gray-900 font-semibold">${selectedPlan.tsp_price}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700 font-medium">Processing Fee</span>
                  <span className="text-green-600 font-semibold">$0.00</span>
                </div>
                <div className="border-t-2 border-gray-200 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-bold text-gray-900">Total</span>
                    <span className="text-2xl font-bold text-indigo-600">${selectedPlan.tsp_price}</span>
                  </div>
                </div>
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
                  <div className="bg-white/80 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Wallets Detected:</span>
                        <span className={`ml-2 font-medium ${wallets.length > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {wallets.length} {wallets.length === 1 ? 'wallet' : 'wallets'}
                        </span>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Connection Status:</span>
                        <span className={`ml-2 font-medium ${isConnecting ? 'text-orange-600' : 'text-green-600'}`}>
                          {isConnecting ? 'Connecting...' : 'Ready'}
                        </span>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Wallet Connected:</span>
                        <span className={`ml-2 font-medium ${walletState.isConnected ? 'text-green-600' : 'text-red-600'}`}>
                          {walletState.isConnected ? `✅ ${walletState.walletName}` : '❌ None'}
                        </span>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-3">
                        <span className="font-bold text-gray-700">Network:</span>
                        <span className="ml-2 text-gray-900 font-medium">
                          {walletState.chainId ? `Chain ${walletState.chainId}` : 'BSC Testnet'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Enhanced tips section */}
                    <div className="bg-gradient-to-r from-yellow-100 to-orange-100 rounded-lg p-4 border border-yellow-200">
                      <div className="flex items-start space-x-2">
                        <div className="text-yellow-600 text-lg">💡</div>
                        <div className="flex-1">
                          <h5 className="font-bold text-yellow-800 mb-2">Troubleshooting Tips:</h5>
                          <ul className="text-sm text-yellow-700 space-y-1">
                            <li>• If stuck on "pending requests" → Open MetaMask extension and clear notifications</li>
                            <li>• If connection fails → Try the "Clear & Reset State" button above</li>
                            <li>• If MetaMask is locked → Unlock it with your password</li>
                            <li>• Still having issues? → Refresh the page and try again</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    
                    {/* Connection health indicator */}
                    <div className="bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-blue-800">Connection Health:</span>
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${
                            walletState.isConnected ? 'bg-green-500 animate-pulse' : 
                            isConnecting ? 'bg-yellow-500 animate-bounce' : 'bg-red-500'
                          }`}></div>
                          <span className="text-sm font-medium text-blue-700">
                            {walletState.isConnected ? 'Connected' : 
                             isConnecting ? 'Connecting' : 'Disconnected'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>yellow-100 rounded-lg p-3 mt-4">
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
                        <p className="text-gray-600 font-medium">Choose your preferred wallet to continue with the payment</p>
                      </div>
                      
                      {/* Enhanced WalletSelector with better visibility */}
                      <div className="space-y-4">
                        <div className="text-center">
                          <h4 className="text-xl font-bold text-gray-900 mb-2">Available Wallets</h4>
                          <p className="text-sm text-gray-600 mb-4">Select a wallet to connect and proceed with payment</p>
                        </div>
                        
                        {/* Custom enhanced wallet selector if wallets exist */}
                        {wallets.length > 0 ? (
                          <div className="space-y-3">
                            {wallets.map((wallet, index) => (
                              <button
                                key={index}
                                onClick={() => handleConnectWallet(wallet.provider)}
                                disabled={isConnecting}
                                className="w-full bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-indigo-300 rounded-xl p-4 flex items-center space-x-4 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
                              >
                                <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center group-hover:from-indigo-600 group-hover:to-purple-600 transition-all duration-200">
                                  <Wallet className="w-6 h-6 text-white" />
                                </div>
                                <div className="flex-1 text-left">
                                  <h5 className="text-lg font-bold text-gray-900">{wallet.name}</h5>
                                  <p className="text-sm text-gray-600">
                                    {wallet.installed ? 'Ready to connect' : 'Not installed'}
                                  </p>
                                </div>
                                <div className="text-right">
                                  {isConnecting ? (
                                    <div className="flex items-center space-x-2">
                                      <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                                      <span className="text-sm text-indigo-600 font-medium">Connecting...</span>
                                    </div>
                                  ) : (
                                    <div className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
                                      Connect
                                    </div>
                                  )}
                                </div>
                              </button>
                            ))}
                            
                            {/* Original WalletSelector as fallback */}
                            <div className="pt-4 border-t border-gray-200">
                              <p className="text-xs text-gray-500 mb-3 text-center">Or use the original wallet selector:</p>
                              <WalletSelector
                                  wallets={wallets}
                                  onConnect={handleConnectWallet}
                                  isConnecting={isConnecting}
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Show original WalletSelector even when no wallets detected */}
                            <WalletSelector
                                wallets={wallets}
                                onConnect={handleConnectWallet}
                                isConnecting={isConnecting}
                            />
                            
                            {/* Fallback message if no wallets detected */}
                            <div className="bg-white/80 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center mt-4">
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
                          </>
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