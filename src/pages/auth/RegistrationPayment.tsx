import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../../contexts/AdminContext';
import { useNotification } from '../../components/ui/NotificationProvider';
import { WalletService } from '../../services/walletService';
import { getSponsorStatusBySponsorshipNumber } from '../../lib/supabase';
import { WalletInfo as WalletInfoType, WalletState, TransactionState } from '../../types/wallet';
import { WalletInfo as WalletInfoCard } from '../../components/payment/WalletInfo';
import { CheckCircle, Wallet, Shield, CreditCard, Loader, XCircle, ExternalLink } from 'lucide-react';

interface RegistrationPlan {
  tsp_id: string;
  tsp_name: string;
  tsp_description: string;
  tsp_price: number;
  tsp_duration_days?: number;
  tsp_features: any;
  tsp_parent_income?: number;
}

const PAYMENT_POLL_INTERVAL = 5000;
const PAYMENT_POLL_ATTEMPTS = 12;

const RegistrationPayment: React.FC = () => {
  const navigate = useNavigate();
  const { user, fetchUserData } = useAuth();
  const { settings } = useAdmin();
  const notification = useNotification();
  const [plan, setPlan] = useState<RegistrationPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const [walletService] = useState(() => WalletService.getInstance());
  const [availableWallets, setAvailableWallets] = useState<WalletInfoType[]>([]);
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    address: null,
    chainId: null,
    balance: '0',
    usdtBalance: '0',
    walletName: null,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const [transaction, setTransaction] = useState<TransactionState>({
    isProcessing: false,
    hash: null,
    status: 'idle',
    error: null,
    distributionSteps: [],
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [parentAccountError, setParentAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/customer/login');
      return;
    }

    if (user.hasActiveSubscription) {
      navigate('/customer/dashboard', { replace: true });
      return;
    }

    const loadRegistrationData = async () => {
      try {
        const { data, error } = await supabase
          .from('tbl_subscription_plans')
          .select('*')
          .eq('tsp_type', 'registration')
          .eq('tsp_is_active', true)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          notification.showError('Error', 'No active registration plan found');
          navigate('/customer/dashboard');
          return;
        }

        setPlan(data);
      } catch (error: any) {
        notification.showError('Load Failed', error.message);
      } finally {
        setLoading(false);
      }
    };

    loadRegistrationData();
  }, [user, navigate, notification]);

  useEffect(() => {
    const validateParentAccount = async () => {
      if (!user?.id) return;

      try {
        console.log('🔎 Validating Parent A/C for user:', user.id);
        const { data: profile } = await supabase
          .from('tbl_user_profiles')
          .select('tup_parent_account')
          .eq('tup_user_id', user.id)
          .maybeSingle();

        const parentAccount = profile?.tup_parent_account?.trim();
        console.log('🔎 Parent A/C (tup_parent_account):', parentAccount || '(empty)');
        if (!parentAccount) {
          setParentAccountError(null);
          return;
        }

        const sponsorStatus = await getSponsorStatusBySponsorshipNumber(parentAccount);
        console.log('🔎 Sponsor status lookup result:', sponsorStatus || null);
        if (!sponsorStatus?.user_id) {
          setParentAccountError('Parent A/C not found. Please contact support.');
          return;
        }

        if (!sponsorStatus.is_active) {
          setParentAccountError('Parent A/C must be active and registration-paid to continue. Please contact support or choose a verified parent.');
          return;
        }

        if (!sponsorStatus.is_registration_paid) {
          setParentAccountError('Parent A/C must be active and registration-paid to continue. Please contact support or choose a verified parent.');
          return;
        }

        console.log('✅ Parent A/C validation passed');
        setParentAccountError(null);
      } catch (error) {
        console.error('Error validating parent account:', error);
        setParentAccountError('Unable to verify Parent A/C. Please try again later.');
      }
    };

    validateParentAccount();
  }, [user?.id]);

  useEffect(() => {
    if (!settings) return;

    walletService.setAdminSettings({
      paymentMode: settings.paymentMode?.toString() || '0',
      usdtAddress: settings.usdtAddress || '',
      subscriptionContractAddress: settings.subscriptionContractAddress || '',
      subscriptionWalletAddress: settings.subscriptionWalletAddress || ''
    });
  }, [settings, walletService]);

  useEffect(() => {
    const wallets = walletService.detectWallets();
    setAvailableWallets(wallets);
  }, [walletService]);

  // Restore wallet state from service if the component re-mounts
  useEffect(() => {
    const currentWalletState = walletService.getCurrentWalletState();
    if (currentWalletState.isConnected && !walletState.isConnected) {
      setWalletState(currentWalletState);
      console.log('Restored wallet state from WalletService:', currentWalletState.address);
    }
  }, [walletService, walletState.isConnected]);

  const enabledWallets = useMemo(() => {
    return settings?.paymentWalletsEnabled || {
      trust_wallet: true,
      metamask: true,
      safepal: true
    };
  }, [settings]);

  const filteredWallets = useMemo(() => {
    return availableWallets.filter((wallet) => {
      if (wallet.name === 'Trust Wallet') return enabledWallets.trust_wallet;
      if (wallet.name === 'MetaMask') return enabledWallets.metamask;
      if (wallet.name === 'SafePal') return enabledWallets.safepal;
      return false;
    });
  }, [availableWallets, enabledWallets]);

  const saveWalletConnection = useCallback(async (address: string, walletName: string, walletType: string, chainId: number | null) => {
    if (!user || !address) return;

    try {
      await supabase
        .from('tbl_user_wallet_connections')
        .update({
          tuwc_is_active: false,
          tuwc_updated_at: new Date().toISOString()
        })
        .eq('tuwc_user_id', user.id)
        .eq('tuwc_is_active', true);

      const { data: existingWallet, error: existingWalletError } = await supabase
        .from('tbl_user_wallet_connections')
        .select('tuwc_id')
        .eq('tuwc_user_id', user.id)
        .eq('tuwc_wallet_address', address)
        .maybeSingle();

      if (existingWalletError) {
        throw existingWalletError;
      }

      if (existingWallet) {
        await supabase
          .from('tbl_user_wallet_connections')
          .update({
            tuwc_is_active: true,
            tuwc_last_connected_at: new Date().toISOString(),
            tuwc_updated_at: new Date().toISOString()
          })
          .eq('tuwc_id', existingWallet.tuwc_id);
      } else {
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
    } catch (error) {
      console.error('Error saving wallet connection:', error);
    }
  }, [user]);

  const handleWalletConnect = useCallback(async (provider: any) => {
    if (isConnecting) return;

    setIsConnecting(true);
    try {
      if (!settings) {
        throw new Error('Payment settings not configured');
      }

      const wallet = await walletService.connectWallet(provider);
      setWalletState(wallet);

      if (wallet.address) {
        const walletType = provider.isMetaMask
          ? 'metamask'
          : provider.isTrust
            ? 'trust'
            : provider.isSafePal
              ? 'safepal'
              : 'web3';

        await saveWalletConnection(
          wallet.address,
          wallet.walletName || 'Unknown Wallet',
          walletType,
          wallet.chainId
        );
      }

      notification.showSuccess('Wallet Connected', `Connected to ${wallet.walletName}`);
    } catch (error: any) {
      notification.showError('Connection Failed', error.message || 'Unable to connect wallet');
      setWalletState({
        isConnected: false,
        address: null,
        chainId: null,
        balance: '0',
        usdtBalance: '0',
        walletName: null,
      });
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, settings, walletService, notification, saveWalletConnection]);

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
    setTransaction({
      isProcessing: false,
      hash: null,
      status: 'idle',
      error: null,
      distributionSteps: [],
    });
    setStatusMessage(null);
  };

  const verifyPayment = async (txHash: string) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) {
      throw new Error('Missing user session');
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-registration-payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ txHash })
    });

    return response.json();
  };

  const pollVerification = async (txHash: string) => {
    for (let attempt = 0; attempt < PAYMENT_POLL_ATTEMPTS; attempt += 1) {
      const result = await verifyPayment(txHash);

      if (result.status === 'success') {
        return result;
      }

      if (result.status === 'failed') {
        throw new Error(result.error || 'Payment failed');
      }

      setStatusMessage(result.message || 'Waiting for confirmations...');
      await new Promise(resolve => setTimeout(resolve, PAYMENT_POLL_INTERVAL));
    }

    throw new Error('Payment confirmation timed out. Please check again later.');
  };

  const handlePayment = async () => {
    if (!plan || !settings) {
      notification.showError('Error', 'Payment configuration not loaded');
      return;
    }

    if (!settings.adminPaymentWallet) {
      notification.showError('Error', 'Admin wallet not configured');
      return;
    }

    if (parentAccountError) {
      notification.showError('Parent A/C Issue', parentAccountError);
      return;
    }

    if (!walletState.isConnected || !walletState.address) {
      notification.showError('Wallet Required', 'Please connect your wallet');
      return;
    }

    const usdtBalance = parseFloat(walletState.usdtBalance || '0');
    if (usdtBalance < plan.tsp_price) {
      notification.showError('Insufficient Balance', `You need ${plan.tsp_price} USDT to continue`);
      return;
    }

    setTransaction({
      isProcessing: true,
      hash: null,
      status: 'pending',
      error: null,
      distributionSteps: []
    });
    setStatusMessage('Awaiting wallet confirmation...');

    try {
      const { hash, steps } = await walletService.sendUSDTTransfer(settings.adminPaymentWallet, plan.tsp_price);

      setTransaction({
        isProcessing: true,
        hash,
        status: 'pending',
        error: null,
        distributionSteps: steps
      });
      setStatusMessage('Transaction submitted. Waiting for confirmations...');

      const result = await pollVerification(hash);

      setTransaction({
        isProcessing: false,
        hash,
        status: 'success',
        error: null,
        distributionSteps: steps
      });
      setStatusMessage('Payment confirmed!');

      await fetchUserData(user!.id);

      notification.showSuccess('Payment Successful', 'Your registration payment was confirmed.');
      navigate('/registration-payment-success', {
        state: {
          txHash: hash,
          amount: result.amount || plan.tsp_price,
          network: result.network
        }
      });
    } catch (error: any) {
      setTransaction({
        isProcessing: false,
        hash: transaction.hash,
        status: 'error',
        error: error.message || 'Payment failed',
        distributionSteps: transaction.distributionSteps
      });
      setStatusMessage(null);
      notification.showError('Payment Failed', error.message || 'Payment failed');
    }
  };

  const openTransaction = () => {
    if (!transaction.hash) return;
    const isMainnet = settings?.paymentMode === true || settings?.paymentMode === '1';
    const explorerUrl = isMainnet
      ? `https://bscscan.com/tx/${transaction.hash}`
      : `https://testnet.bscscan.com/tx/${transaction.hash}`;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  };

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
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Registration Payment</h1>
          <p className="text-gray-600">Connect your wallet and pay the registration fee to activate your account.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Registration Plan</h2>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{plan.tsp_name}</h3>
                  <p className="text-gray-600 text-sm mt-1">{plan.tsp_description}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-blue-600">${plan.tsp_price}</div>
                  <div className="text-sm text-gray-500">USDT (BEP-20)</div>
                </div>
              </div>

              {typeof plan.tsp_features === 'object' && Object.keys(plan.tsp_features).length > 0 && (
                <div className="mt-6">
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

            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Connect Wallet</h2>

              {parentAccountError && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  {parentAccountError}
                </div>
              )}

              {!walletState.isConnected ? (
                <div className="space-y-4">
                  {filteredWallets.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                      No compatible wallet detected. Please install MetaMask, Trust Wallet, or SafePal.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {filteredWallets.map((wallet) => (
                        <button
                          key={wallet.name}
                          onClick={() => handleWalletConnect(wallet.provider)}
                          disabled={isConnecting || !!parentAccountError}
                          className="p-4 border-2 rounded-lg transition-all border-gray-200 hover:border-blue-400 bg-white"
                        >
                          <div className="text-2xl mb-2">{wallet.icon}</div>
                          <p className="text-sm font-medium text-gray-900">{wallet.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{isConnecting ? 'Connecting...' : 'Connect'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <WalletInfoCard wallet={walletState} onDisconnect={handleWalletDisconnect} />
              )}
            </div>

            {transaction.status !== 'idle' && (
              <div className="bg-white rounded-xl shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Status</h2>

                <div className="flex items-center space-x-3 mb-4">
                  {transaction.status === 'pending' && <Loader className="h-5 w-5 text-yellow-500 animate-spin" />}
                  {transaction.status === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
                  {transaction.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
                  <span className="text-sm font-medium text-gray-700">
                    {transaction.status === 'pending' && 'Payment Pending'}
                    {transaction.status === 'success' && 'Payment Confirmed'}
                    {transaction.status === 'error' && 'Payment Failed'}
                  </span>
                </div>

                {statusMessage && (
                  <p className="text-sm text-gray-600 mb-4">{statusMessage}</p>
                )}

                {transaction.hash && (
                  <div className="flex items-center space-x-2 text-sm">
                    <code className="flex-1 px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 font-mono">
                      {transaction.hash}
                    </code>
                    <button
                      onClick={openTransaction}
                      className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors border border-blue-200"
                      title="View on explorer"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {transaction.error && (
                  <p className="text-sm text-red-600 mt-4">{transaction.error}</p>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h3>

              <div className="space-y-3 mb-6 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Registration Fee</span>
                  <span className="font-medium">${plan.tsp_price}</span>
                </div>
                <div className="flex justify-between">
                  <span>Network</span>
                  <span className="font-medium">{settings?.paymentMode === true || settings?.paymentMode === '1' ? 'BSC Mainnet' : 'BSC Testnet'}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 border-t pt-3">
                  <span>Total</span>
                  <span className="text-blue-600">{plan.tsp_price} USDT</span>
                </div>
              </div>

              <div className="space-y-3 text-sm text-gray-600 mb-6">
                <div className="flex items-start">
                  <Shield className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>Payment sent directly to the admin wallet</span>
                </div>
                <div className="flex items-start">
                  <CreditCard className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
                  <span>USDT (BEP-20) only</span>
                </div>
              </div>

              <button
                onClick={handlePayment}
                disabled={!walletState.isConnected || transaction.isProcessing || !settings?.adminPaymentWallet || !!parentAccountError}
                className={`w-full py-3 rounded-lg font-medium flex items-center justify-center space-x-2 ${
                  walletState.isConnected && !transaction.isProcessing && settings?.adminPaymentWallet && !parentAccountError
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {transaction.isProcessing ? (
                  <>
                    <Loader className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Wallet className="h-5 w-5" />
                    <span>Pay Now</span>
                  </>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                By proceeding, you agree to our terms and conditions
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationPayment;
