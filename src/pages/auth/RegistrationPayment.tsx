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
import { CheckCircle, Wallet, Shield, CreditCard, Loader, XCircle, ExternalLink, Copy, PlusCircle } from 'lucide-react';
import { extractEdgeFunctionErrorMessage, isRetryableEdgeFunctionError } from '../../utils/edgeFunctionError';

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

let cachedRegistrationPlan: RegistrationPlan | null = null;
let inFlightRegistrationPlanRequest: Promise<RegistrationPlan | null> | null = null;

const RegistrationPayment: React.FC = () => {
  const navigate = useNavigate();
  const { user, fetchUserData } = useAuth();
  const { settings, loading: settingsLoading } = useAdmin();
  const notification = useNotification();
  const [plan, setPlan] = useState<RegistrationPlan | null>(cachedRegistrationPlan);
  const [loading, setLoading] = useState(!cachedRegistrationPlan);

  const [walletService] = useState(() => WalletService.getInstance());
  const [availableWallets, setAvailableWallets] = useState<WalletInfoType[]>(() =>
    typeof window === 'undefined' ? [] : WalletService.getInstance().detectWallets()
  );
  const [walletState, setWalletState] = useState<WalletState>(() =>
    WalletService.getInstance().getCurrentWalletState()
  );
  const [refreshingBalances, setRefreshingBalances] = useState(false);
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
  const [reverifyHash, setReverifyHash] = useState('');
  const [reverifyProcessing, setReverifyProcessing] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/customer/login');
      return;
    }

    if (!settingsLoading && (settings.launchPhase || 'prelaunch') === 'launched') {
      navigate('/subscription-plans', { replace: true });
      return;
    }

    if (user.hasActiveSubscription) {
      navigate('/customer/dashboard', { replace: true });
      return;
    }

    const loadRegistrationData = async () => {
      try {
        const planRequest =
          inFlightRegistrationPlanRequest ??
          supabase
            .from('tbl_subscription_plans')
            .select('*')
            .eq('tsp_type', 'registration')
            .eq('tsp_is_active', true)
            .maybeSingle()
            .then(({ data, error }) => {
              if (error) throw error;
              return data as RegistrationPlan | null;
            });

        inFlightRegistrationPlanRequest = planRequest;
        const data = await planRequest;

        if (!data) {
          notification.showError('Error', 'No active registration plan found');
          navigate('/customer/dashboard');
          return;
        }

        cachedRegistrationPlan = data;
        setPlan(data);
      } catch (error: any) {
        notification.showError('Load Failed', error.message);
      } finally {
        inFlightRegistrationPlanRequest = null;
        setLoading(false);
      }
    };

    if (cachedRegistrationPlan) {
      setPlan(cachedRegistrationPlan);
      setLoading(false);
      return;
    }

    loadRegistrationData();
  }, [user, settings.launchPhase, settingsLoading, navigate, notification]);

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

    // If already connected, refresh balances using the currently configured USDT contract.
    if (walletState.isConnected) {
      let cancelled = false;
      void (async () => {
        setRefreshingBalances(true);
        try {
          const updated = await walletService.syncCurrentWalletState();
          if (!cancelled) setWalletState(updated);
        } catch (error) {
          // ignore: UI will still show previous state; user can reconnect
          console.warn('Failed to sync wallet balances after settings change:', error);
        } finally {
          if (!cancelled) setRefreshingBalances(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [settings, walletService]);

  useEffect(() => {
    const refreshDetectedWallets = () => {
      setAvailableWallets(walletService.detectWallets());
    };

    refreshDetectedWallets();

    const timeoutIds = [250, 1000, 2500].map((delay) =>
      window.setTimeout(refreshDetectedWallets, delay)
    );

    window.addEventListener('load', refreshDetectedWallets);
    window.addEventListener('focus', refreshDetectedWallets);
    window.addEventListener('ethereum#initialized', refreshDetectedWallets as EventListener);

    return () => {
      timeoutIds.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('load', refreshDetectedWallets);
      window.removeEventListener('focus', refreshDetectedWallets);
      window.removeEventListener('ethereum#initialized', refreshDetectedWallets as EventListener);
    };
  }, [walletService]);

  // Restore wallet state from service if the component re-mounts
  useEffect(() => {
    if (isConnecting) return;
    const currentWalletState = walletService.getCurrentWalletState();
    if (currentWalletState.isConnected && !walletState.isConnected) {
      setWalletState(currentWalletState);
      console.log('Restored wallet state from WalletService:', currentWalletState.address);
    }
  }, [walletService, walletState.isConnected, isConnecting]);

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

  const adminReceivingWallet = useMemo(() => {
    return String(settings?.adminPaymentWallet || '').trim();
  }, [settings?.adminPaymentWallet]);

  const formatAddress = useCallback((address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  const copyToClipboard = useCallback(async (value: string) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      notification.showSuccess('Copied', 'Copied to clipboard');
    } catch {
      // ignore (clipboard may be blocked); user can still select text
    }
  }, [notification]);

  const handleAddUsdtToken = useCallback(async () => {
    try {
      const added = await walletService.watchUSDTToken();
      if (added) {
        notification.showSuccess('Token Added', 'USDT token was added to your wallet.');
      } else {
        notification.showError('Not Added', 'Token was not added. Please add it manually using the contract address.');
      }
    } catch (error: any) {
      notification.showError('Unable to Add Token', error?.message || 'Please add the token manually using the contract address.');
    }
  }, [walletService, notification]);

  const payNowDisabledReason = useMemo(() => {
    if (settingsLoading) return 'Loading payment settings...';
    if (parentAccountError) return parentAccountError;
    if (!walletState.isConnected || !walletState.address) return 'Please connect your wallet to continue.';
    if (walletState.warning) return walletState.warning;
    if (transaction.isProcessing) return 'A payment is already being processed.';
    if (!adminReceivingWallet) return 'Admin receiving wallet is not configured yet.';
    return null;
  }, [
    settingsLoading,
    parentAccountError,
    walletState.isConnected,
    walletState.address,
    walletState.warning,
    transaction.isProcessing,
    adminReceivingWallet
  ]);

	  const saveWalletConnection = useCallback(async (address: string, walletName: string, walletType: string, chainId: number | null) => {
	    if (!user || !address) return;

	    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

	    const maxAttempts = 3;
	    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
	      try {
	        // If session isn't hydrated yet, Supabase may not send Authorization. Wait briefly and retry.
	        const { data: sessionData } = await supabase.auth.getSession();
	        if (!sessionData.session?.access_token) {
	          if (attempt < maxAttempts) {
	            await sleep(300 * attempt);
	            continue;
	          }
	          console.warn('Skipping wallet connection upsert: no active session yet.');
	          return;
	        }

	        const { data, error } = await supabase.functions.invoke('upsert-wallet-connection', {
	          body: {
	            wallet_address: address,
	            wallet_name: walletName,
	            wallet_type: walletType,
	            chain_id: chainId
	          }
	        });

	        if (error) {
	          if (isRetryableEdgeFunctionError(error) && attempt < maxAttempts) {
	            await sleep(500 * attempt);
	            continue;
	          }
	          const message = await extractEdgeFunctionErrorMessage(error);
	          console.warn('Failed to save wallet connection (non-fatal):', message);
	          return;
	        }

	        if (!data?.success) {
	          console.warn('Failed to save wallet connection (non-fatal):', data?.error || 'Unknown error');
	          return;
	        }

	        return;
	      } catch (error) {
	        if (attempt < maxAttempts) {
	          await sleep(500 * attempt);
	          continue;
	        }
	        console.warn('Error saving wallet connection (non-fatal):', error);
	        return;
	      }
	    }
	  }, [user]);

  const handleWalletConnect = useCallback(async (provider: any) => {
    if (isConnecting) return;

		    setIsConnecting(true);
		    try {
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

	        // Best-effort: don't fail wallet connection if this transiently fails (502 etc).
	        void saveWalletConnection(
	          wallet.address,
	          wallet.walletName || 'Unknown Wallet',
	          walletType,
	          wallet.chainId
	        );
	      }

	      notification.showSuccess('Wallet Connected', `Connected to ${wallet.walletName}`);
	    } catch (error: any) {
	      notification.showError('Connection Failed', error.message || 'Unable to connect wallet');
	      walletService.disconnect();
	      setWalletState({
	        isConnected: false,
	        address: null,
	        chainId: null,
        balance: '0',
        usdtBalance: '0',
        walletName: null,
        warning: null,
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
      warning: null,
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

  const handleReverify = async (hashOverride?: string) => {
    if (!plan) {
      notification.showError('Error', 'Payment configuration not loaded');
      return;
    }

    const targetHash = (hashOverride || reverifyHash || transaction.hash || '').trim();
    if (!targetHash) {
      notification.showError('Missing Transaction', 'Please enter the transaction hash');
      return;
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(targetHash)) {
      notification.showError('Invalid Hash', 'Please enter a valid transaction hash');
      return;
    }

    setReverifyProcessing(true);
    setTransaction({
      isProcessing: true,
      hash: targetHash,
      status: 'pending',
      error: null,
      distributionSteps: transaction.distributionSteps || []
    });
    setStatusMessage('Re-verifying on-chain payment...');

    try {
      const result = await pollVerification(targetHash);

      setTransaction({
        isProcessing: false,
        hash: targetHash,
        status: 'success',
        error: null,
        distributionSteps: transaction.distributionSteps || []
      });
      setStatusMessage('Payment confirmed!');

      await fetchUserData(user!.id);

      notification.showSuccess('Payment Confirmed', 'Your registration payment was verified.');
      navigate('/registration-payment-success', {
        state: {
          txHash: targetHash,
          amount: result.amount || plan.tsp_price,
          network: result.network
        }
      });
    } catch (error: any) {
      setTransaction({
        isProcessing: false,
        hash: targetHash,
        status: 'error',
        error: error.message || 'Verification failed',
        distributionSteps: transaction.distributionSteps || []
      });
      setStatusMessage(null);
      notification.showError('Verification Failed', error.message || 'Verification failed');
    } finally {
      setReverifyProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (!plan || !settings) {
      notification.showError('Error', 'Payment configuration not loaded');
      return;
    }

    if (!adminReceivingWallet) {
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
      const { hash, steps } = await walletService.sendUSDTTransfer(adminReceivingWallet, plan.tsp_price);

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
    const isMainnet =
      settings?.paymentMode === true ||
      settings?.paymentMode === 1 ||
      settings?.paymentMode === '1' ||
      settings?.paymentMode === 'true';
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
                <WalletInfoCard
                  wallet={walletState}
                  onDisconnect={handleWalletDisconnect}
                  onRefresh={async () => {
                    setRefreshingBalances(true);
                    try {
                      const updated = await walletService.syncCurrentWalletState();
                      setWalletState(updated);
                    } finally {
                      setRefreshingBalances(false);
                    }
                  }}
                  refreshing={refreshingBalances}
                />
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

                <div className="mt-4 space-y-2">
                  <p className="text-xs text-gray-500">
                    Re-verify using the same wallet that made the payment.
                  </p>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={reverifyHash}
                      onChange={(event) => setReverifyHash(event.target.value)}
                      placeholder={transaction.hash || '0x...'}
                      className="flex-1 px-3 py-2 text-sm rounded border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      onClick={() => handleReverify()}
                      disabled={reverifyProcessing || transaction.isProcessing || (!reverifyHash && !transaction.hash)}
                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {reverifyProcessing ? 'Checking...' : 'Re-verify'}
                    </button>
                  </div>
                </div>

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
                  <span className="font-medium">
                    {settings?.paymentMode === true ||
                    settings?.paymentMode === 1 ||
                    settings?.paymentMode === '1' ||
                    settings?.paymentMode === 'true'
                      ? 'BSC Mainnet'
                      : 'BSC Testnet'}
                  </span>
                </div>
                {!!adminReceivingWallet && (
                  <div className="flex justify-between items-center gap-3">
                    <span>Receiving Wallet</span>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-gray-50 text-gray-900 rounded border border-gray-200 font-mono text-xs">
                        {formatAddress(adminReceivingWallet)}
                      </code>
                      <button
                        onClick={() => void copyToClipboard(adminReceivingWallet)}
                        className="p-1 bg-gray-100 hover:bg-gray-200 rounded border border-gray-200"
                        title="Copy receiving wallet"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
                {!!String(settings?.usdtAddress || '').trim() && (
                  <div className="flex justify-between items-center gap-3">
                    <span>USDT Contract</span>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-gray-50 text-gray-900 rounded border border-gray-200 font-mono text-xs">
                        {formatAddress(String(settings?.usdtAddress || '').trim())}
                      </code>
                      <button
                        onClick={() => void copyToClipboard(String(settings?.usdtAddress || '').trim())}
                        className="p-1 bg-gray-100 hover:bg-gray-200 rounded border border-gray-200"
                        title="Copy USDT contract"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void handleAddUsdtToken()}
                        disabled={!walletState.isConnected}
                        className="p-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded border border-blue-200 disabled:opacity-50"
                        title={walletState.isConnected ? 'Add USDT token to wallet' : 'Connect wallet to add token'}
                      >
                        <PlusCircle className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
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
                disabled={!!payNowDisabledReason}
                className={`w-full py-3 rounded-lg font-medium flex items-center justify-center space-x-2 ${
                  !payNowDisabledReason
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

              {payNowDisabledReason && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                  {payNowDisabledReason}
                </p>
              )}

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
