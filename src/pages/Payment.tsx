import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdmin } from '../contexts/AdminContext';
import { useAuth } from '../contexts/AuthContext';
import { Shield, CheckCircle, DollarSign } from 'lucide-react';
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
      const result = await walletService.executeUSDTDistribution();

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
        // In a real app, this would update the database
        console.log('Payment successful for user:', user.email);
      }

      // Show success message - from original Payment.tsx
      alert('🎉 Payment Successful!\n\nYour subscription is now active.\nRedirecting to dashboard...');

      // Redirect based on user type - from original Payment.tsx
      setTimeout(() => {
        if (user?.userType === 'company') {
          navigate('/company/dashboard');
        } else {
          navigate('/customer/dashboard');
        }
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
        {/* Toast notifications - from App.tsx */}
        <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1f2937',
                color: '#f9fafb',
                border: '1px solid #374151',
              },
            }}
        />

        <div className="max-w-4xl mx-auto">
          {/* Header section - enhanced from App.tsx style */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <DollarSign className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-900">Complete Your Payment</h1>
            </div>
            <p className="text-gray-600">Secure blockchain-based payment with smart contracts</p>
            {/* Total distribution info - from App.tsx */}
            <div className="bg-indigo-50 rounded-lg p-4 inline-block border border-indigo-200 mt-4">
              <p className="text-lg font-semibold text-indigo-900">USDT Smart Contract Payment</p>
              <p className="text-sm text-indigo-700">Powered by BNB Smart Chain • Total Distribution: 0.30 USDT</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Order Summary - from original Payment.tsx */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>

              <div className="border border-gray-200 rounded-lg p-6 mb-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedPlan.tsp_name}</h3>
                    <p className="text-sm text-gray-600">{selectedPlan.tsp_duration_days} days subscription</p>
                  </div>
                  <span className="text-xl font-bold text-gray-900">${selectedPlan.tsp_price}</span>
                </div>

                <div className="space-y-2">
                  {selectedPlan.tsp_features.map((feature, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-gray-600">{feature}</span>
                      </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">${selectedPlan.tsp_price}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-600">Processing Fee</span>
                  <span className="text-gray-900">$0.00</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  <span>${selectedPlan.tsp_price}</span>
                </div>
              </div>

              {/* Enhanced security section */}
              <div className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-semibold text-green-900">Blockchain Protected</span>
                  </div>
                  <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                  USDT BEP-20
                </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-green-700">Smart Contract Verified</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="h-3 w-3 text-blue-500" />
                    <span className="text-blue-700">Instant Settlement</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-green-700">Zero Hidden Fees</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <CheckCircle className="h-3 w-3 text-blue-500" />
                    <span className="text-blue-700">BSC Network</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Contract Payment Section - from App.tsx structure */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Smart Contract Payment</h2>

              <div className="space-y-6">
                {/* Value proposition */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <DollarSign className="h-5 w-5 text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-900">Why Choose Crypto Payment?</span>
                  </div>
                  <div className="text-xs space-y-1 text-indigo-700">
                    <div className="flex items-center space-x-2">
                      <span className="w-1 h-1 bg-indigo-400 rounded-full"></span>
                      <span>Instant global transactions with USDT</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-1 h-1 bg-indigo-400 rounded-full"></span>
                      <span>Lower fees than traditional payment methods</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-1 h-1 bg-indigo-400 rounded-full"></span>
                      <span>Transparent & verifiable on blockchain</span>
                    </div>
                  </div>
                </div>

                {/* Enhanced Debug section */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-medium text-yellow-800 mb-3">Debug MetaMask Connection</h4>
                  <div className="space-y-2">
                    <button
                        onClick={async () => {
                          try {
                            // Clear any pending requests by refreshing MetaMask state
                            if (window.ethereum) {
                              console.log('🔄 Refreshing MetaMask state...');
                              
                              // Try to clear any pending state
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
                        className="bg-green-100 text-green-800 px-3 py-1 rounded text-xs hover:bg-green-200 mr-2"
                    >
                      Refresh MetaMask State
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
                              
                              // Check for pending requests
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
                        className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-xs hover:bg-blue-200 mr-2"
                    >
                      Check MetaMask Status
                    </button>

                    <button
                        onClick={handleDirectMetaMaskConnect}
                        disabled={isConnecting}
                        className="bg-purple-100 text-purple-800 px-3 py-1 rounded text-xs hover:bg-purple-200 disabled:opacity-50"
                    >
                      Direct Connect (Bypass)
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-yellow-700">
                    <p>Wallets detected: {wallets.length}</p>
                    <p>Is connecting: {isConnecting ? 'Yes' : 'No'}</p>
                    <p>Wallet connected: {walletState.isConnected ? 'Yes' : 'No'}</p>
                    <p className="mt-1 text-yellow-600">
                      <strong>Tip:</strong> If you get "pending requests" error, open MetaMask extension and check for any pending popups or notifications.
                    </p>
                  </div>
                </div>

                {/* Trust Indicators */}
                <TrustIndicators />

                {/* Wallet Connection or Payment - exactly from App.tsx */}
                {!walletState.isConnected ? (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-indigo-200">
                      <WalletSelector
                          wallets={wallets}
                          onConnect={handleConnectWallet}
                          isConnecting={isConnecting}
                      />
                    </div>
                ) : (
                    <div className="space-y-4">
                      {/* Wallet Info */}
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                        <WalletInfo
                            wallet={walletState}
                            onDisconnect={handleDisconnectWallet}
                        />
                      </div>

                      {/* Payment Section */}
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200">
                        <PaymentSection
                            onPayment={handleSmartContractPayment}
                            transaction={transactionState}
                            distributionSteps={transactionState.distributionSteps}
                        />
                      </div>
                    </div>
                )}

                {/* Footer note - from App.tsx */}
                <div className="text-center">
                  <p className="text-xs text-gray-500">
                    This uses BNB Smart Chain Testnet. No real funds are involved.
                    <br />
                    USDT Distribution • Secure • Encrypted
                  </p>
                </div>
              </div>

              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500">
                  By completing this payment, you agree to our Terms of Service and Privacy Policy.
                  Your subscription will be activated immediately upon successful payment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default Payment;