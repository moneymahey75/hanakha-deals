import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAdmin } from '../contexts/AdminContext';
import { useNotification } from '../components/ui/NotificationProvider';
import { supabase } from '../lib/supabase';
import { WalletService } from '../services/walletService';
import { WalletInfo, WalletState, TransactionState } from '../types/wallet';
import { WalletSelector } from '../components/payment/WalletSelector';
import { WalletInfo as WalletInfoComponent } from '../components/payment/WalletInfo';
import { CheckCircle, CreditCard, Shield, ArrowLeft, Wallet, AlertTriangle, Loader, XCircle, ExternalLink, Copy } from 'lucide-react';
import { extractEdgeFunctionErrorMessage, isRetryableEdgeFunctionError } from '../utils/edgeFunctionError';
import { sendAccountEmail } from '../utils/accountEmails';
import { getBscExplorerBaseUrl, getPaymentNetworkName, isLivePaymentModeValue } from '../utils/paymentMode';

interface SubscriptionPlan {
  tsp_id: string;
  tsp_name: string;
  tsp_description: string;
  tsp_price: number;
  tsp_duration_days: number;
  tsp_type?: string;
  tsp_product_code?: string | null;
  tsp_features: string[];
}

interface UpgradePaymentRecoveryAttempt {
  userId: string;
  planId: string;
  walletAddress: string;
  toAddress: string;
  chainAmount: number;
  reservedUsed: number;
  reservedForfeited: number;
  chainId: number | null;
  startBlock: number | null;
}

// Key for storing transaction data
const PAYMENT_SUCCESS_KEY = 'payment_success_state';
const PAYMENT_SELECTED_PLAN_KEY = 'payment_selected_plan_state';

const saveSelectedPlanState = (plan: SubscriptionPlan, planId = plan.tsp_id) => {
  try {
    const value = JSON.stringify({ plan, planId, savedAt: Date.now() });
    sessionStorage.setItem(PAYMENT_SELECTED_PLAN_KEY, value);
    localStorage.setItem(PAYMENT_SELECTED_PLAN_KEY, value);
  } catch {
    // Storage can be unavailable in some embedded wallet browsers.
  }
};

const saveSelectedPlanIdState = (planId: string) => {
  try {
    const value = JSON.stringify({ planId, savedAt: Date.now() });
    sessionStorage.setItem(PAYMENT_SELECTED_PLAN_KEY, value);
    localStorage.setItem(PAYMENT_SELECTED_PLAN_KEY, value);
  } catch {
    // Storage can be unavailable in some embedded wallet browsers.
  }
};

const loadSelectedPlanState = (): SubscriptionPlan | null => {
  try {
    const raw = sessionStorage.getItem(PAYMENT_SELECTED_PLAN_KEY) || localStorage.getItem(PAYMENT_SELECTED_PLAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.plan || null;
  } catch {
    return null;
  }
};

const loadSelectedPlanIdState = (): string | null => {
  try {
    const raw = sessionStorage.getItem(PAYMENT_SELECTED_PLAN_KEY) || localStorage.getItem(PAYMENT_SELECTED_PLAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.planId === 'string' ? parsed.planId : parsed?.plan?.tsp_id || null;
  } catch {
    return null;
  }
};

const clearSelectedPlanState = () => {
  try {
    sessionStorage.removeItem(PAYMENT_SELECTED_PLAN_KEY);
    localStorage.removeItem(PAYMENT_SELECTED_PLAN_KEY);
  } catch {
    // ignore
  }
};

// Helper function to determine wallet type from provider
const getWalletType = (provider: any): string => {
  if (provider.isMetaMask) return 'metamask';
  if (provider.isTrust || provider.isTrustWallet) return 'trust';
  if (provider.isSafePal) return 'safepal';
  if (provider.isTokenPocket || provider.isTp || provider.isTP) return 'tokenpocket';
  if (
    provider.isBitKeep ||
    provider.isBitkeep ||
    provider.isBitKeepChrome ||
    provider.isBitget ||
    provider.isBitgetWallet ||
    provider === (window as any).bitkeep?.ethereum ||
    provider === (window as any).bitkeep?.ethereumProvider ||
    provider === (window as any).bitkeep ||
    provider === (window as any).bitget?.ethereum ||
    provider === (window as any).bitget?.ethereumProvider ||
    provider === (window as any).bitget ||
    provider === (window as any).BitKeep?.ethereum ||
    provider === (window as any).BitKeep?.ethereumProvider ||
    provider === (window as any).BitKeep ||
    provider === (window as any).bitgetWallet
  ) return 'bitget';
  if (provider.isBinanceChain || provider.isBinance) return 'binance';
  return 'web3';
};

const isWalletRequestAlreadyOpenMessage = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('wallet confirmation is already open') ||
    normalized.includes('wallet transaction is already pending') ||
    normalized.includes('duplicate call') ||
    normalized.includes('ethsendtransaction')
  );
};

const getPaymentErrorMessage = async (error: any, fallback: string): Promise<string> => {
  const rawMessage = String(
    (await extractEdgeFunctionErrorMessage(error)) ||
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.error?.message ||
    error?.message ||
    fallback
  );
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('duplicate call') || normalized.includes('ethsendtransaction')) {
    return 'A wallet confirmation is already open. Please finish or reject that wallet request before trying again.';
  }

  if (normalized.includes('user rejected') || normalized.includes('user denied') || error?.code === 4001) {
    return 'Payment was rejected in your wallet.';
  }

  if (normalized.includes('insufficient funds') || normalized.includes('insufficient balance')) {
    return rawMessage.replace(/[<>]/g, '');
  }

  if (
    rawMessage.length > 220 ||
    normalized.includes('jsonrpc') ||
    normalized.includes('payload=') ||
    normalized.includes('originalerror') ||
    normalized.includes('chrome-extension://')
  ) {
    return fallback;
  }

  return rawMessage.replace(/[<>]/g, '');
};

const Payment: React.FC = () => {
  // FIX: Access user object which contains hasActiveSubscription
  const { user, fetchUserData } = useAuth();
  const { settings, loading: settingsLoading } = useAdmin();
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

  const [workingWalletReservedBalance, setWorkingWalletReservedBalance] = useState(0);
  const [useReservedBalance, setUseReservedBalance] = useState(false);

  const initialTransactionState: TransactionState = {
    isProcessing: false,
    hash: null,
    status: 'idle',
    error: null,
    distributionSteps: [],
  };

  const [transaction, setTransaction] = useState<TransactionState>(initialTransactionState);

  const [isConnecting, setIsConnecting] = useState(false);
  const [lastConnectedWallet, setLastConnectedWallet] = useState<any>(null);
  const [walletRequestLocked, setWalletRequestLocked] = useState(false);
  const paymentInFlightRef = useRef(false);
  const upgradeRecoveryAttemptRef = useRef<UpgradePaymentRecoveryAttempt | null>(null);

  const enabledWallets = useMemo(() => ({
    trust_wallet: true,
    metamask: true,
    safepal: true,
    tokenpocket: true,
    bitget: true,
    ...settings?.paymentWalletsEnabled,
  }), [settings?.paymentWalletsEnabled]);

  const filteredWallets = useMemo(() => {
    return availableWallets.filter((wallet) => {
      if (wallet.name === 'Trust Wallet') return enabledWallets.trust_wallet;
      if (wallet.name === 'MetaMask') return enabledWallets.metamask;
      if (wallet.name === 'SafePal') return enabledWallets.safepal;
      if (wallet.name === 'TokenPocket') return enabledWallets.tokenpocket;
      if (wallet.name === 'Bitget Wallet') return enabledWallets.bitget;
      return true;
    });
  }, [availableWallets, enabledWallets]);

  // The admin-selected payment mode is the single source of truth. Launch phase
  // controls site availability only; it must never silently change the chain.
  const effectivePaymentMode = settings?.paymentMode?.toString() || '0';
  const effectiveUsdtAddress = String(
    isLivePaymentModeValue(effectivePaymentMode)
      ? (settings?.usdtAddressMainnet || settings?.usdtAddress || '')
      : (settings?.usdtAddressTestnet || settings?.usdtAddress || '')
  ).trim();
  const effectiveAdminPaymentWallet = String(
    isLivePaymentModeValue(effectivePaymentMode)
      ? (settings?.adminPaymentWalletMainnet || settings?.adminPaymentWallet || '')
      : (settings?.adminPaymentWalletTestnet || settings?.adminPaymentWallet || '')
  ).trim();

  // FIX: If the user has an active plan (from DB check), force success status.
  // Otherwise, rely on the session storage flag.
  const selectedPlanType = String(selectedPlan?.tsp_type || '').toLowerCase();
  const isAutopool20Plan = selectedPlan?.tsp_product_code === 'autopool_20';
  const isUpgradePaymentPage = selectedPlanType === 'upgrade';
  const isExistingPaidUser = Boolean(user?.registrationPaid || user?.hasActiveSubscription);
  const isUpgradePlanUi = isUpgradePaymentPage && isExistingPaidUser && !isAutopool20Plan;
  const hasActivePlan = Boolean(user?.hasActiveSubscription && !isUpgradePlanUi);
  const hasPaidSuccessfully = hasActivePlan || transaction.status === 'success';
  const canUseReservedForUpgradeUi = isUpgradePlanUi && workingWalletReservedBalance > 0;
  const paymentPageTitle = isAutopool20Plan ? '20 USDT AutoPool Add-on' : isUpgradePaymentPage ? 'Upgrade Account' : 'Registration Payment';
  const paymentPageDescription = isAutopool20Plan
    ? 'Connect your wallet and pay 20 USDT to activate the separate eight-level AutoPool matrix.'
    : isUpgradePaymentPage
    ? 'Connect your wallet and pay with USDT (BEP-20) to upgrade your account.'
    : 'Connect your wallet and pay with USDT (BEP-20) to complete your registration.';

  const reservedUsedForUpgrade = useReservedBalance && isUpgradePlanUi
    ? Math.min(workingWalletReservedBalance, Number(selectedPlan?.tsp_price || 0))
    : 0;
  const chainPayAmountForUpgrade = Math.max(0, Number(selectedPlan?.tsp_price || 0) - reservedUsedForUpgrade);
  const reservedAmountToVanishForUpgrade = useReservedBalance && isUpgradePlanUi
    ? Math.max(0, workingWalletReservedBalance - Number(selectedPlan?.tsp_price || 0))
    : 0;
  const adminReceivingWallet = effectiveAdminPaymentWallet;

  const loadWorkingWalletReservedBalance = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('tbl_wallets')
        .select('tw_reserved_balance')
        .eq('tw_user_id', user.id)
        .eq('tw_currency', 'USDT')
        .eq('tw_wallet_type', 'working')
        .maybeSingle();
      if (error) throw error;
      setWorkingWalletReservedBalance(Number((data as any)?.tw_reserved_balance ?? 0));
    } catch {
      console.warn('Failed to load reserved wallet balance');
      setWorkingWalletReservedBalance(0);
    }
  }, [user?.id]);

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
            .maybeSingle();

        if (data && !error) {
          setLastConnectedWallet(data);
        }
      } catch {
        console.warn('Error loading saved wallet connections');
      }
    };

    loadSavedWalletConnections();
  }, [user]);

  useEffect(() => {
    loadWorkingWalletReservedBalance();
  }, [loadWorkingWalletReservedBalance]);

  // Configure wallet service with admin settings
  useEffect(() => {
    if (settings) {
      // Validate admin settings before using them
      const validateAddress = (addr: string): boolean => /^0x[a-fA-F0-9]{40}$/.test(addr);

      if (!validateAddress(effectiveUsdtAddress) && effectiveUsdtAddress !== '') {
        notification.showError('Configuration Error', 'Invalid USDT contract address');
        return;
      }

      if (!validateAddress(effectiveAdminPaymentWallet) && effectiveAdminPaymentWallet !== '') {
        notification.showError('Configuration Error', 'Invalid admin payment wallet');
        return;
      }

      walletService.setAdminSettings({
        paymentMode: effectivePaymentMode,
        usdtAddress: effectiveUsdtAddress,
        subscriptionContractAddress: '',
        subscriptionWalletAddress: ''
      });

      const expectedChainId = isLivePaymentModeValue(effectivePaymentMode) ? 56 : 97;
      if (walletState.isConnected && walletState.chainId !== expectedChainId) {
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
        notification.showInfo(
          'Payment Network Changed',
          `The admin selected ${getPaymentNetworkName(effectivePaymentMode)}. Please reconnect your wallet.`
        );
      }
    }
  }, [effectiveAdminPaymentWallet, effectivePaymentMode, effectiveUsdtAddress, settings, walletService, walletState.chainId, walletState.isConnected, notification]);

  useEffect(() => {
    let isCancelled = false;
    sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);

    // Validate and get selected plan from navigation state, then fall back to
    // durable storage because mobile wallet confirmation can reload this route.
    const resolveSelectedPlan = async () => {
      const planFromState = location.state?.selectedPlan || loadSelectedPlanState();
      const selectedPlanId = location.state?.selectedPlanId || planFromState?.tsp_id || loadSelectedPlanIdState();

      let resolvedPlan = planFromState as SubscriptionPlan | null;

      if (!resolvedPlan && selectedPlanId) {
        saveSelectedPlanIdState(selectedPlanId);
        const { data, error } = await supabase
          .from('tbl_subscription_plans')
          .select('*')
          .eq('tsp_id', selectedPlanId)
          .eq('tsp_is_active', true)
          .maybeSingle();

        if (error) throw error;
        resolvedPlan = data as SubscriptionPlan | null;
      }

      if (isCancelled) return;

      if (resolvedPlan) {
      // Input validation functions
        const validatePrice = (price: number): boolean => price > 0 && price < 1000000;

      // Validate plan data
        if (!resolvedPlan.tsp_id || !resolvedPlan.tsp_name ||
            !validatePrice(Number(resolvedPlan.tsp_price))) {
          notification.showError('Invalid Plan', 'The selected plan contains invalid data.');
          navigate('/subscription-plans', { replace: true });
          return;
        }

        setSelectedPlan(resolvedPlan);
        saveSelectedPlanState(resolvedPlan, selectedPlanId || resolvedPlan.tsp_id);
        return;
      }

      // No plan selected, redirect to subscription plans
      notification.showError('No Plan Selected', 'Please select a subscription plan first.');
      navigate('/subscription-plans', { replace: true });
    };

    resolveSelectedPlan().catch((error: any) => {
      if (isCancelled) return;
      notification.showError('Plan Load Failed', error?.message || 'Unable to load selected plan.');
      navigate('/subscription-plans', { replace: true });
    });

    // Detect available wallets
    const wallets = walletService.detectWallets();
    setAvailableWallets(wallets);

    return () => {
      isCancelled = true;
    };
  }, [location.state, navigate, notification, walletService]);

  useEffect(() => {
    const refreshDetectedWallets = () => {
      setAvailableWallets(walletService.detectWallets());
    };

    refreshDetectedWallets();

    const timeoutIds = [250, 1000, 2500, 5000].map((delay) =>
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

  useEffect(() => {
    const isUpgrade = String(selectedPlan?.tsp_type || '').toLowerCase() === 'upgrade' && Boolean(user?.registrationPaid || user?.hasActiveSubscription);
    const canUseReserved = isUpgrade && workingWalletReservedBalance > 0;
    if (!canUseReserved) {
      setUseReservedBalance(false);
    } else {
      setUseReservedBalance(true);
    }
  }, [selectedPlan?.tsp_id, selectedPlan?.tsp_type, selectedPlan?.tsp_price, workingWalletReservedBalance, user?.registrationPaid, user?.hasActiveSubscription]);

	  // FIX: Restore wallet state from service on re-render if connection is active
	  useEffect(() => {
	    if (isConnecting) return;
	    // Check the WalletService instance directly for connection status
	    const currentWalletState = walletService.getCurrentWalletState();
	    if (currentWalletState.isConnected && !walletState.isConnected) {
	      setWalletState(currentWalletState);
	    }
	  }, [walletService, walletState.isConnected, isConnecting]);

  // Input validation functions
  const validateAddress = (address: string): boolean => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const validatePrice = (price: number): boolean => {
    return price > 0 && price < 1000000; // Reasonable upper limit
  };

  const networkName = getPaymentNetworkName(effectivePaymentMode);

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notification.showSuccess('Copied', 'Address copied to clipboard');
    } catch {
      notification.showError('Copy Failed', 'Unable to copy address');
    }
  };

  const openTransaction = () => {
    if (!transaction.hash) return;
    const explorerUrl = `${getBscExplorerBaseUrl(settings?.paymentMode)}/tx/${transaction.hash}`;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  };

  const goToPaymentSuccess = (details: {
    txHash?: string | null;
    amount: number;
    reservedUsed?: number;
  }) => {
    sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
    clearSelectedPlanState();
    navigate('/payment-success', {
      replace: true,
      state: {
        txHash: details.txHash || null,
        amount: details.amount,
        reservedUsed: details.reservedUsed || 0,
        network: getPaymentNetworkName(settings?.paymentMode),
        planName: selectedPlan?.tsp_name,
      }
    });
  };

  const handleAddUsdtToken = async () => {
    try {
      await walletService.watchUSDTToken();
      notification.showSuccess('Token Added', 'USDT token was added to your wallet.');
    } catch (error: any) {
      notification.showError('Token Add Failed', error?.message || 'Unable to add USDT token.');
    }
  };

  const pauseWalletRetry = () => {
    setWalletRequestLocked(true);
    window.setTimeout(() => setWalletRequestLocked(false), 12000);
  };

  const recoverSubmittedUpgradePayment = async (
    attempt: UpgradePaymentRecoveryAttempt,
    reason: string
  ): Promise<boolean> => {
    if (!settings || !selectedPlan || !user?.id) return false;
    if (attempt.userId !== user.id || attempt.planId !== selectedPlan.tsp_id) return false;

    setTransaction({
      isProcessing: true,
      hash: null,
      status: 'pending',
      error: null,
      distributionSteps: [
        `Reserved used: ${attempt.reservedUsed} USDT`,
        `Recovering TokenPocket payment after ${reason}`
      ]
    });

    let recoveredHash: string | null = null;
    for (let attemptNumber = 1; attemptNumber <= 6; attemptNumber += 1) {
      recoveredHash = await walletService.findRecentUSDTTransfer(
        attempt.walletAddress,
        attempt.toAddress,
        attempt.chainAmount,
        attempt.startBlock
      );
      if (recoveredHash) break;
      await new Promise(resolve => window.setTimeout(resolve, 3000));
    }

    if (!recoveredHash) return false;

    const steps = [
      `Reserved used: ${attempt.reservedUsed} USDT`,
      `Transaction recovered after ${reason}`,
      `Transaction found on-chain: ${recoveredHash}`
    ];

    setTransaction({
      isProcessing: true,
      hash: recoveredHash,
      status: 'pending',
      error: null,
      distributionSteps: steps
    });

    const { error } = await supabase.rpc('create_upgrade_payment_with_reserved_and_chain', {
      p_user_id: user.id,
      p_plan_id: selectedPlan.tsp_id,
      p_chain_amount: attempt.chainAmount,
      p_reserved_used: attempt.reservedUsed,
      p_currency: 'USDT',
      p_transaction_id: recoveredHash,
      p_gateway_response: {
        blockchain: getPaymentNetworkName(effectivePaymentMode),
        usdt_contract: effectiveUsdtAddress,
        admin_wallet: attempt.toAddress,
        transaction_hash: recoveredHash,
        wallet_address: attempt.walletAddress,
        wallet_name: walletState.walletName,
        chain_id: attempt.chainId,
        reserved_forfeited: attempt.reservedForfeited,
        recovered_after: reason,
        processed_at: new Date().toISOString(),
        status: 'success',
        steps
      }
    });

    if (error) throw error;

    setTransaction({
      isProcessing: false,
      hash: recoveredHash,
      status: 'success',
      error: null,
      distributionSteps: steps
    });

    sessionStorage.setItem(PAYMENT_SUCCESS_KEY, JSON.stringify({
      success: true,
      tx: {
        isProcessing: false,
        hash: recoveredHash,
        status: 'success',
        error: null,
        distributionSteps: steps
      }
    }));

    await Promise.all([fetchUserData(user.id), loadWorkingWalletReservedBalance()]);
    void sendAccountEmail({
      type: 'upgrade_payment',
      planName: selectedPlan.tsp_name,
      amount: selectedPlan.tsp_price,
      transactionHash: recoveredHash,
      reservedUsed: attempt.reservedUsed,
      network: getPaymentNetworkName(effectivePaymentMode),
    });
    notification.showSuccess('Payment Recovered', 'TokenPocket payment was found and your upgrade has been activated.');
    goToPaymentSuccess({
      txHash: recoveredHash,
      amount: selectedPlan.tsp_price,
      reservedUsed: attempt.reservedUsed,
    });
    return true;
  };

  const payNowDisabledReason = useMemo(() => {
    if (walletRequestLocked) return 'A wallet confirmation is already open. Please finish or reject that wallet request before trying again.';
    if (transaction.isProcessing) return 'A payment is already being processed.';
    if (useReservedBalance && canUseReservedForUpgradeUi && chainPayAmountForUpgrade === 0) {
      if (!walletState.isConnected || !walletState.address) return 'Please connect your wallet to continue.';
      if (!validateAddress(walletState.address)) return 'Connected wallet address is invalid.';
      if (walletState.warning) return walletState.warning;
      return null;
    }
    if (!adminReceivingWallet) return 'Admin receiving wallet is not configured yet.';
    if (!validateAddress(adminReceivingWallet)) return 'Admin receiving wallet is not configured correctly.';
    if (!walletState.isConnected || !walletState.address) return 'Please connect your wallet to continue.';
    if (walletState.warning) return walletState.warning;
    const amountToPay = useReservedBalance && canUseReservedForUpgradeUi
      ? chainPayAmountForUpgrade
      : Number(selectedPlan?.tsp_price || 0);
    if (parseFloat(walletState.usdtBalance || '0') < amountToPay) {
      return `You need at least ${amountToPay.toFixed(2)} USDT. Current balance: ${parseFloat(walletState.usdtBalance || '0').toFixed(2)} USDT.`;
    }
    return null;
  }, [
    adminReceivingWallet,
    canUseReservedForUpgradeUi,
    chainPayAmountForUpgrade,
    selectedPlan?.tsp_price,
    transaction.isProcessing,
    useReservedBalance,
    walletRequestLocked,
    walletState.address,
    walletState.isConnected,
    walletState.usdtBalance,
    walletState.warning
  ]);

		  // Save wallet connection to database (best-effort)
		  const saveWalletConnection = async (address: string, walletName: string, walletType: string, chainId: number | null) => {
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
		          await extractEdgeFunctionErrorMessage(error);
		          console.warn('Failed to save wallet connection');
		          return;
		        }

		        if (!data?.success) {
		          console.warn('Failed to save wallet connection');
		          return;
		        }

		        return;
		      } catch (error) {
		        if (attempt < maxAttempts) {
		          await sleep(500 * attempt);
		          continue;
		        }
		        console.warn('Error saving wallet connection');
		        return;
		      }
		    }
		  };

  const handleWalletConnect = async (provider: any) => {
    if (isConnecting) return; // Prevent double click
    if (settingsLoading) {
      notification.showError('Please Wait', 'Payment settings are still loading. Please try again in a moment.');
      return;
    }

    setIsConnecting(true);
    try {
      const wallet = await walletService.connectWallet(provider);

      setWalletState(wallet);

		      if (wallet.address) {
		        const walletType = getWalletType(provider);
		        setLastConnectedWallet({
		          tuwc_wallet_address: wallet.address,
		          tuwc_wallet_name: wallet.walletName || 'Unknown Wallet',
		          tuwc_wallet_type: walletType,
		          tuwc_chain_id: wallet.chainId,
		          tuwc_last_connected_at: new Date().toISOString()
		        });

		        // Best-effort: don't fail wallet connection if this transiently fails (502 etc).
		        void saveWalletConnection(
		          wallet.address,
		          wallet.walletName || 'Unknown Wallet',
		          walletType,
		          wallet.chainId
		        );
		      }
		
		      notification.showSuccess('Wallet Connected', `Successfully connected to ${wallet.walletName}`);
		    } catch (error: any) {
	      console.warn('Wallet connection failed');
	      const errorMessage = error.message || 'Failed to connect wallet';

      // Sanitize error message before showing to user
      const sanitizedError = errorMessage.replace(/[<>]/g, '');
      notification.showError('Connection Failed', sanitizedError);

	      // Disconnect and clear wallet state on failure
	      walletService.disconnect();
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
    } catch {
      console.warn('Error updating wallet connection status');
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
    // FIX: Reset transaction state and clear persistent storage on disconnect
    setTransaction(initialTransactionState);
    sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
    notification.showInfo('Wallet Disconnected', 'Wallet has been disconnected');
  };

  const handlePayment = async () => {
    if (paymentInFlightRef.current || transaction.isProcessing) {
      notification.showError('Please Wait', 'A payment is already being processed. Please finish or reject the open wallet request before trying again.');
      return;
    }

    paymentInFlightRef.current = true;

    try {
      // Input validation
      if (!selectedPlan || !user) {
        notification.showError('Error', 'Missing plan or user information');
        return;
      }

      const { data: purchaseCheck, error: purchaseCheckError } = await supabase.rpc('can_purchase_subscription_plan', {
        p_user_id: user.id,
        p_plan_id: selectedPlan.tsp_id,
      });

      if (purchaseCheckError) throw purchaseCheckError;

      const purchaseResult = (purchaseCheck || {}) as { allowed?: boolean; message?: string };
      if (purchaseResult.allowed === false) {
        notification.showError('Package Not Allowed', purchaseResult.message || 'This package cannot be purchased right now.');
        navigate('/subscription-plans', { replace: true });
        return;
      }

      const planType = String(selectedPlan.tsp_type || '').toLowerCase();
      const isUpgradePlan = planType === 'upgrade' && Boolean(user.registrationPaid || user.hasActiveSubscription) && !isAutopool20Plan;

      // FIX: Re-check active subscription before payment
      if (user.hasActiveSubscription && !isUpgradePlan && !isAutopool20Plan) {
        notification.showInfo('Already Subscribed', 'You already have an active subscription.');
        // Set local state to success to enforce the success UI path immediately
        setTransaction(prev => ({ ...prev, status: 'success' }));
        return;
      }

    if (useReservedBalance && isUpgradePlan) {
      const reservedUsed = Math.min(workingWalletReservedBalance, selectedPlan.tsp_price);
      const chainAmount = Number(Math.max(0, selectedPlan.tsp_price - reservedUsed).toFixed(6));
      const reservedUsedRounded = Number(reservedUsed.toFixed(6));
      const reservedAmountToVanish = Number(Math.max(0, workingWalletReservedBalance - selectedPlan.tsp_price).toFixed(6));

      if (reservedUsedRounded <= 0) {
        notification.showError('Reserved Balance', 'No reserved balance available to use.');
        return;
      }

      if (reservedAmountToVanish > 0) {
        const confirmed = window.confirm(
          `Your reserved balance is ${workingWalletReservedBalance.toFixed(2)} USDT, but this upgrade plan costs ${selectedPlan.tsp_price.toFixed(2)} USDT.\n\n` +
          `After this upgrade, the remaining ${reservedAmountToVanish.toFixed(2)} USDT reserved balance will be removed. Choose a bigger package if you want to use the full reserved amount.\n\n` +
          'Do you still want to continue with this plan?'
        );

        if (!confirmed) return;
      }

      // Reserved-only path.
      if (chainAmount === 0) {
        if (!walletState.isConnected || !walletState.address) {
          notification.showError('Wallet Required', 'Please connect your wallet to continue.');
          return;
        }

        if (!validateAddress(walletState.address)) {
          notification.showError('Invalid Wallet', 'Connected wallet address is invalid');
          return;
        }

        setTransaction({
          isProcessing: true,
          hash: null,
          status: 'pending',
          error: null,
          distributionSteps: ['Paid from reserved balance'],
        });
        sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);

        try {
          const { error } = await supabase.rpc('create_subscription_payment_from_reserved', {
            p_user_id: user.id,
            p_plan_id: selectedPlan.tsp_id,
            p_currency: 'USDT',
            p_gateway_response: {
              source: 'reserved_wallet',
              reserved_used: reservedUsedRounded,
              reserved_forfeited: reservedAmountToVanish,
              wallet_address: walletState.address,
              wallet_name: walletState.walletName,
              chain_id: walletState.chainId,
              processed_at: new Date().toISOString(),
            },
          });

          if (error) throw error;

          setTransaction({
            isProcessing: false,
            hash: null,
            status: 'success',
            error: null,
            distributionSteps: ['Paid from reserved balance'],
          });

          sessionStorage.setItem(PAYMENT_SUCCESS_KEY, JSON.stringify({
            success: true,
            tx: {
              isProcessing: false,
              hash: null,
              status: 'success',
              error: null,
              distributionSteps: ['Paid from reserved balance'],
            }
          }));

          await Promise.all([fetchUserData(user.id), loadWorkingWalletReservedBalance()]);
          void sendAccountEmail({
            type: 'upgrade_payment',
            planName: selectedPlan.tsp_name,
            amount: selectedPlan.tsp_price,
            reservedUsed: reservedUsedRounded,
          });
          notification.showSuccess('Payment Successful!', 'Upgrade has been activated using reserved balance.');
          goToPaymentSuccess({
            txHash: null,
            amount: selectedPlan.tsp_price,
            reservedUsed: reservedUsedRounded,
          });
          return;
        } catch (error: any) {
          const message = await getPaymentErrorMessage(error, 'Upgrade payment failed. Please try again.');
          if (isWalletRequestAlreadyOpenMessage(message)) {
            pauseWalletRetry();
            setTransaction({
              isProcessing: false,
              hash: null,
              status: 'pending',
              error: message,
              distributionSteps: ['Waiting for wallet confirmation'],
            });
            notification.showInfo('Wallet Confirmation Open', message);
            return;
          }

          setTransaction({
            isProcessing: false,
            hash: null,
            status: 'error',
            error: message,
            distributionSteps: ['Paid from reserved balance'],
          });
          sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
          notification.showError('Payment Failed', message);
          return;
        }
      }

      // Mixed payment: reserved + blockchain remainder.
      if (!walletState.isConnected || !walletState.address) {
        notification.showError('Wallet Required', 'Please connect your wallet to pay the remaining amount.');
        return;
      }

      if (!validateAddress(walletState.address)) {
        notification.showError('Invalid Wallet', 'Connected wallet address is invalid');
        return;
      }

      if (!settings) {
        notification.showError('Configuration Error', 'Admin settings not loaded. Please refresh the page.');
        return;
      }

      if (!adminReceivingWallet || !validateAddress(adminReceivingWallet)) {
        notification.showError('Configuration Error', 'Admin payment wallet is not configured correctly.');
        return;
      }

      walletService.setAdminSettings({
        paymentMode: effectivePaymentMode,
        usdtAddress: effectiveUsdtAddress,
        subscriptionContractAddress: '',
        subscriptionWalletAddress: ''
      });

      const usdtBalance = parseFloat(walletState.usdtBalance);
      if (usdtBalance < chainAmount) {
        notification.showError(
          'Insufficient Balance',
          `You need at least ${chainAmount} USDT to pay the remaining amount. Current balance: ${usdtBalance} USDT`
        );
        return;
      }

      setTransaction({
        isProcessing: true,
        hash: null,
        status: 'pending',
        error: null,
        distributionSteps: [`Reserved used: ${reservedUsedRounded} USDT`, `Remaining to pay: ${chainAmount} USDT`]
      });
      saveSelectedPlanState(selectedPlan);
      sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);

      try {
        let startBlock: number | null = null;
        try {
          startBlock = await walletService.getCurrentBlockNumber();
        } catch {
          console.warn('Unable to capture upgrade payment start block');
        }

        upgradeRecoveryAttemptRef.current = {
          userId: user.id,
          planId: selectedPlan.tsp_id,
          walletAddress: walletState.address,
          toAddress: adminReceivingWallet,
          chainAmount,
          reservedUsed: reservedUsedRounded,
          reservedForfeited: reservedAmountToVanish,
          chainId: walletState.chainId,
          startBlock
        };

        const { hash, steps } = await walletService.sendUSDTTransfer(adminReceivingWallet, chainAmount);

        const { error } = await supabase.rpc('create_upgrade_payment_with_reserved_and_chain', {
          p_user_id: user.id,
          p_plan_id: selectedPlan.tsp_id,
          p_chain_amount: chainAmount,
          p_reserved_used: reservedUsedRounded,
          p_currency: 'USDT',
          p_transaction_id: hash,
          p_gateway_response: {
            blockchain: getPaymentNetworkName(effectivePaymentMode),
            usdt_contract: effectiveUsdtAddress,
            admin_wallet: adminReceivingWallet,
            transaction_hash: hash,
            wallet_address: walletState.address,
            wallet_name: walletState.walletName,
            chain_id: walletState.chainId,
            reserved_forfeited: reservedAmountToVanish,
            processed_at: new Date().toISOString(),
            status: 'success',
            steps
          }
        });

        if (error) throw error;

        setTransaction({
          isProcessing: false,
          hash,
          distributionSteps: [`Reserved used: ${reservedUsedRounded} USDT`, ...steps],
          status: 'success',
          error: null
        });

        sessionStorage.setItem(PAYMENT_SUCCESS_KEY, JSON.stringify({
          success: true,
          tx: {
            isProcessing: false,
            hash,
            status: 'success',
            error: null,
            distributionSteps: [`Reserved used: ${reservedUsedRounded} USDT`, ...steps]
          }
        }));

        await Promise.all([fetchUserData(user.id), loadWorkingWalletReservedBalance()]);
        void sendAccountEmail({
          type: 'upgrade_payment',
          planName: selectedPlan.tsp_name,
          amount: selectedPlan.tsp_price,
          transactionHash: hash,
          reservedUsed: reservedUsedRounded,
          network: getPaymentNetworkName(effectivePaymentMode),
        });
        notification.showSuccess('Payment Successful!', 'Upgrade has been activated using reserved balance and USDT payment.');
        goToPaymentSuccess({
          txHash: hash,
          amount: selectedPlan.tsp_price,
          reservedUsed: reservedUsedRounded,
        });
        return;
      } catch (error: any) {
        const errorMessage = await getPaymentErrorMessage(error, 'Payment processing failed. Please try again.');
        if (isWalletRequestAlreadyOpenMessage(errorMessage)) {
          const recoveryAttempt = upgradeRecoveryAttemptRef.current;
          if (recoveryAttempt) {
            try {
              const recovered = await recoverSubmittedUpgradePayment(recoveryAttempt, 'TokenPocket response issue');
              if (recovered) return;
            } catch (recoveryError: any) {
              const recoveryMessage = await getPaymentErrorMessage(recoveryError, 'Payment was sent, but automatic activation failed. Please contact admin with your transaction hash.');
              setTransaction({
                isProcessing: false,
                hash: transaction.hash,
                status: 'error',
                error: recoveryMessage,
                distributionSteps: [`Reserved used: ${reservedUsedRounded} USDT`, `TokenPocket payment recovery failed`]
              });
              sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
              notification.showError('Payment Stuck', recoveryMessage);
              return;
            }
          }

          pauseWalletRetry();
          setTransaction({
            isProcessing: false,
            hash: transaction.hash,
            status: 'pending',
            error: 'TokenPocket may have submitted the payment. If USDT was deducted, wait a few seconds and do not click Pay again. Share the transaction hash with admin if activation does not complete.',
            distributionSteps: [`Reserved used: ${reservedUsedRounded} USDT`, `Waiting for TokenPocket transaction`]
          });
          sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
          notification.showInfo('Checking TokenPocket Payment', 'If USDT was deducted, we are checking the blockchain for your transaction.');
          return;
        }

        setTransaction({
          isProcessing: false,
          hash: transaction.hash,
          status: 'error',
          error: errorMessage,
          distributionSteps: transaction.distributionSteps
        });
        sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
        notification.showError('Payment Failed', errorMessage);
        return;
      }
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
    if (!validateAddress(effectiveUsdtAddress) && effectiveUsdtAddress !== '') {
      notification.showError('Configuration Error', 'Invalid USDT contract address in settings');
      return;
    }

    if (!adminReceivingWallet || !validateAddress(adminReceivingWallet)) {
      notification.showError('Configuration Error', 'Admin payment wallet is not configured correctly.');
      return;
    }

    // Set admin settings again before payment to ensure they're current
    walletService.setAdminSettings({
      paymentMode: effectivePaymentMode,
      usdtAddress: effectiveUsdtAddress,
      subscriptionContractAddress: '',
      subscriptionWalletAddress: ''
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
    const pendingTransactionState = {
      isProcessing: true,
      hash: null,
      status: 'pending',
      error: null,
      distributionSteps: []
    } as TransactionState;
    setTransaction(pendingTransactionState);
    saveSelectedPlanState(selectedPlan);
    sessionStorage.removeItem(PAYMENT_SUCCESS_KEY); // Clear session storage flag

    let subscriptionData = null;
    let paymentData = null;

    try {
      // Send USDT directly to the admin receiving wallet.
      const { hash, steps } = await walletService.sendUSDTTransfer(adminReceivingWallet, selectedPlan.tsp_price);

      const finalTransactionState = {
        isProcessing: false,
        hash,
        distributionSteps: steps,
        status: 'success' as 'success',
        error: null
      };

      setTransaction(finalTransactionState);

      const gatewayResponse = {
        blockchain: getPaymentNetworkName(effectivePaymentMode),
        usdt_contract: effectiveUsdtAddress,
        admin_wallet: adminReceivingWallet,
        transaction_hash: hash,
        wallet_address: walletState.address,
        wallet_name: walletState.walletName,
        chain_id: walletState.chainId,
        processed_at: new Date().toISOString(),
        status: 'success',
        steps: steps
      };

      const { data: paymentData, error: paymentError } = isAutopool20Plan
        ? await supabase.rpc('create_autopool_20_payment', {
          p_user_id: user.id,
          p_plan_id: selectedPlan.tsp_id,
          p_amount: selectedPlan.tsp_price,
          p_currency: 'USDT',
          p_payment_method: 'blockchain',
          p_payment_status: 'completed',
          p_transaction_id: hash,
          p_gateway_response: gatewayResponse,
        })
        : isUpgradePlan
        ? await supabase.rpc('create_upgrade_payment_with_reserved_and_chain', {
          p_user_id: user.id,
          p_plan_id: selectedPlan.tsp_id,
          p_chain_amount: selectedPlan.tsp_price,
          p_reserved_used: 0,
          p_currency: 'USDT',
          p_transaction_id: hash,
          p_gateway_response: gatewayResponse
        })
        : await supabase.rpc('create_registration_payment', {
          p_user_id: user.id,
          p_plan_id: selectedPlan.tsp_id,
          p_amount: selectedPlan.tsp_price,
          p_currency: 'USDT',
          p_payment_method: 'blockchain',
          p_payment_status: 'completed',
          p_transaction_id: hash,
          p_gateway_response: gatewayResponse
        });

      if (paymentError) {
        throw new Error(paymentError.message || 'Failed to create payment record');
      }

      subscriptionData = paymentData?.subscription_id || null;

      // FIX: Store success flag and transaction state in session storage BEFORE fetching user data
      sessionStorage.setItem(PAYMENT_SUCCESS_KEY, JSON.stringify({
        success: true,
        tx: finalTransactionState
      }));

      // Refresh user data (This causes the re-render/re-mount)
      await fetchUserData(user.id);

      if (isUpgradePlan) {
        void sendAccountEmail({
          type: 'upgrade_payment',
          planName: selectedPlan.tsp_name,
          amount: selectedPlan.tsp_price,
          transactionHash: hash,
          network: getPaymentNetworkName(effectivePaymentMode),
        });
      }

      notification.showSuccess('Payment Successful!', 'Your subscription has been activated.');
      goToPaymentSuccess({
        txHash: hash,
        amount: selectedPlan.tsp_price,
        reservedUsed: 0,
      });

    } catch (error: any) {

      const errorMessage = await getPaymentErrorMessage(error, 'Payment processing failed. Please try again.');
      if (isWalletRequestAlreadyOpenMessage(errorMessage)) {
        pauseWalletRetry();
        setTransaction({
          isProcessing: false,
          hash: transaction.hash,
          status: 'pending',
          error: errorMessage,
          distributionSteps: ['Waiting for wallet confirmation']
        });
        sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
        notification.showInfo('Wallet Confirmation Open', errorMessage);
        return;
      }

      const finalErrorState = {
        isProcessing: false,
        hash: transaction.hash,
        status: 'error' as 'error',
        error: errorMessage,
        distributionSteps: transaction.distributionSteps
      };

      // Set error state and stop processing
      setTransaction(finalErrorState);
      sessionStorage.removeItem(PAYMENT_SUCCESS_KEY); // Clear success flag on failure

      try {
        const { error: dbError } = await supabase
            .from('tbl_payments')
            .insert({
              tp_user_id: user.id,
            tp_subscription_id: subscriptionData || null,
              tp_amount: selectedPlan.tsp_price,
              tp_currency: 'USDT',
              tp_payment_method: 'blockchain',
              tp_payment_status: 'failed',
              tp_transaction_id: transaction.hash,
              tp_error_message: errorMessage,
              tp_gateway_response: {
                blockchain: getPaymentNetworkName(effectivePaymentMode),
                usdt_contract: effectiveUsdtAddress,
                admin_wallet: adminReceivingWallet,
                transaction_hash: transaction.hash,
                wallet_address: walletState.address,
                wallet_name: walletState.walletName,
                chain_id: walletState.chainId,
                processed_at: new Date().toISOString(),
                status: 'failed',
                error: errorMessage,
                steps: transaction.distributionSteps,
                error_details: errorMessage
              }
            })
            .select()
            .single();

        if (dbError) {
          console.warn('Failed to save failed payment record');
        }
      } catch {
        console.warn('Error saving failed payment to database');
      }

      notification.showError('Payment Failed', errorMessage);
    }
    } finally {
      paymentInFlightRef.current = false;
    }
  };

  const handleGoToDashboard = () => {
    // FIX: Clear the persistent state upon navigating away
    sessionStorage.removeItem(PAYMENT_SUCCESS_KEY);
    clearSelectedPlanState();

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

      const walletTypeToName: Record<string, string> = {
        metamask: 'MetaMask',
        trust: 'Trust Wallet',
        safepal: 'SafePal',
        tokenpocket: 'TokenPocket',
        bitget: 'Bitget Wallet',
        binance: 'Binance Chain Wallet',
      };
      const walletType = lastConnectedWallet.tuwc_wallet_type;
      const savedWalletName = walletTypeToName[walletType] || lastConnectedWallet.tuwc_wallet_name;
      let provider = filteredWallets.find((wallet) => (
        wallet.name === savedWalletName || getWalletType(wallet.provider) === walletType
      ))?.provider || null;

      if (!provider) {
        if (walletType === 'metamask' && (window as any).ethereum?.isMetaMask) {
          provider = (window as any).ethereum;
        } else if (walletType === 'trust' && ((window as any).ethereum?.isTrust || (window as any).ethereum?.isTrustWallet)) {
          provider = (window as any).ethereum;
        } else if (walletType === 'safepal' && (window as any).ethereum?.isSafePal) {
          provider = (window as any).ethereum;
        } else if (walletType === 'tokenpocket' && ((window as any).ethereum?.isTokenPocket || (window as any).tokenpocket?.ethereum)) {
          provider = (window as any).tokenpocket?.ethereum || (window as any).ethereum;
        } else if (walletType === 'bitget' && ((window as any).ethereum?.isBitKeep || (window as any).ethereum?.isBitkeep || (window as any).ethereum?.isBitKeepChrome || (window as any).ethereum?.isBitget || (window as any).ethereum?.isBitgetWallet || (window as any).bitkeep?.ethereum || (window as any).bitkeep?.ethereumProvider || (window as any).bitkeep?.request || (window as any).bitget?.ethereum || (window as any).bitget?.ethereumProvider || (window as any).bitget?.request || (window as any).BitKeep?.ethereum || (window as any).BitKeep?.ethereumProvider || (window as any).BitKeep?.request || (window as any).bitgetWallet)) {
          provider = (window as any).bitkeep?.ethereum || (window as any).bitkeep?.ethereumProvider || (window as any).bitkeep || (window as any).bitget?.ethereum || (window as any).bitget?.ethereumProvider || (window as any).bitget || (window as any).BitKeep?.ethereum || (window as any).BitKeep?.ethereumProvider || (window as any).BitKeep || (window as any).bitgetWallet || (window as any).ethereum;
        } else if (walletType === 'binance' && (window as any).BinanceChain) {
          provider = (window as any).BinanceChain;
        } else if ((window as any).ethereum) {
          provider = (window as any).ethereum;
        }
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
      console.warn('Wallet reconnection failed');
      const errorMessage = error.message || 'Failed to reconnect wallet';
      notification.showError('Reconnection Failed', errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  // FIX: Early return if user is not loaded or plan is not selected
  if (!user || !selectedPlan) {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading user and payment information...</p>
          </div>
        </div>
    );
  }

  // FIX: If user has active subscription but we don't have transaction details,
  // ensure transaction status is set to success for PaymentSection to render correctly.
  if (hasActivePlan && transaction.status === 'idle') {
    setTransaction(prev => ({ ...prev, status: 'success' }));
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <Link
            to="/subscription-plans"
            className="inline-flex items-center text-blue-700 hover:text-blue-800 mb-4 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Plans
          </Link>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {paymentPageTitle}
            </h1>
            <p className="text-gray-600">{paymentPageDescription}</p>
          </div>
        </div>

        {transaction.status !== 'idle' && (
          <div className={`rounded-2xl border p-4 sm:p-5 shadow-sm ${
            transaction.status === 'success'
              ? 'bg-green-50 border-green-200'
              : transaction.status === 'error'
                ? 'bg-red-50 border-red-200'
                : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                transaction.status === 'success'
                  ? 'bg-green-100 text-green-700'
                  : transaction.status === 'error'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
              }`}>
                {transaction.status === 'pending' && <Loader className="h-5 w-5 animate-spin" />}
                {transaction.status === 'success' && <CheckCircle className="h-5 w-5" />}
                {transaction.status === 'error' && <XCircle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                  {transaction.status === 'pending' && 'Processing Payment...'}
                  {transaction.status === 'success' && 'Payment Confirmed'}
                  {transaction.status === 'error' && 'Payment Failed'}
                </h2>
                {transaction.error && (
                  <p className="mt-1 text-sm text-gray-700">{transaction.error}</p>
                )}
                {transaction.hash && (
                  <div className="transaction-hash-container mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code className="transaction-hash-code min-w-0 flex-1 overflow-x-auto scrollbar-hide whitespace-nowrap rounded-lg border border-gray-200 bg-white/80 px-3 py-2 font-mono text-xs text-gray-900">
                      {transaction.hash}
                    </code>
                    <button
                      onClick={openTransaction}
                      className="transaction-hash-button inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>View Tx</span>
                    </button>
                  </div>
                )}
                {transaction.status === 'success' && (
                  <button
                    onClick={handleGoToDashboard}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 sm:w-auto"
                  >
                    Go to Dashboard
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Selected Plan</h2>
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{selectedPlan.tsp_name}</h3>
                  <p className="text-gray-600 text-sm mt-1">{selectedPlan.tsp_description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-3xl font-bold text-blue-600">${selectedPlan.tsp_price}</div>
                  <div className="text-sm text-gray-500">USDT (BEP-20)</div>
                </div>
              </div>

              {Array.isArray(selectedPlan.tsp_features) && selectedPlan.tsp_features.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Features Included:</h4>
                  <ul className="space-y-2">
                    {selectedPlan.tsp_features.map((feature, index) => (
                      <li key={index} className="flex items-center text-gray-600">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Connect Wallet</h2>

              {!walletState.isConnected ? (
                <div className="space-y-4">
                  {filteredWallets.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                      <div className="flex items-center gap-2 font-medium mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        No compatible wallet detected
                      </div>
                      Please install MetaMask, Trust Wallet, SafePal, TokenPocket, or Bitget Wallet.
                    </div>
                  ) : (
                    <WalletSelector
                      wallets={filteredWallets}
                      onConnect={handleWalletConnect}
                      isConnecting={settingsLoading || isConnecting}
                    />
                  )}

                  {lastConnectedWallet && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Shield className="h-5 w-5 text-blue-600" />
                        <span className="font-medium text-blue-900">Previously Connected Wallet</span>
                      </div>
                      <div className="text-sm text-blue-800">
                        <p className="break-all">{lastConnectedWallet.tuwc_wallet_address}</p>
                        <p className="mt-1 text-blue-700">
                          {lastConnectedWallet.tuwc_wallet_name} - Last connected: {new Date(lastConnectedWallet.tuwc_last_connected_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={handleReconnectPreviousWallet}
                        disabled={settingsLoading || isConnecting}
                        className="mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                      >
                        {isConnecting ? 'Reconnecting...' : 'Reconnect Previous Wallet'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <WalletInfoComponent
                  wallet={walletState}
                  onDisconnect={handleWalletDisconnect}
                  paymentMode={effectivePaymentMode}
                  usdtAddress={effectiveUsdtAddress}
                  onRefresh={async () => {
                    const updated = await walletService.syncCurrentWalletState();
                    setWalletState(updated);
                  }}
                />
              )}
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h3>

              {canUseReservedForUpgradeUi && (
                <div className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <label className="flex items-start gap-3 text-sm text-blue-900">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={useReservedBalance}
                      readOnly
                    />
                    <span>
                      Use reserved balance
                      <span className="block text-xs text-blue-700 mt-1">
                        Available: {workingWalletReservedBalance.toFixed(2)} USDT
                      </span>
                      <span className="block text-xs text-blue-700 mt-1">
                        Reserved balance is automatically applied to upgrade payments.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              <div className="space-y-3 mb-6 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Plan Price</span>
                  <span className="font-medium">${selectedPlan.tsp_price}</span>
                </div>
                {useReservedBalance && canUseReservedForUpgradeUi && (
                  <>
                    <div className="flex justify-between">
                      <span>Reserved Used</span>
                      <span className="font-medium">{reservedUsedForUpgrade.toFixed(2)} USDT</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wallet Payment</span>
                      <span className="font-medium">{chainPayAmountForUpgrade.toFixed(2)} USDT</span>
                    </div>
                    {reservedAmountToVanishForUpgrade > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                        You will lose the remaining {reservedAmountToVanishForUpgrade.toFixed(2)} USDT reserved balance after this upgrade. Choose a bigger package if you want to use the full reserved amount.
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <span>Network</span>
                  <span className="font-medium">{networkName}</span>
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
                {!!effectiveUsdtAddress && (
                  <div className="flex justify-between items-center gap-3">
                    <span>USDT Contract</span>
                    <div className="flex items-center gap-2">
                      <code className="px-2 py-1 bg-gray-50 text-gray-900 rounded border border-gray-200 font-mono text-xs">
                        {formatAddress(effectiveUsdtAddress)}
                      </code>
                      <button
                        onClick={() => void copyToClipboard(effectiveUsdtAddress)}
                        className="p-1 bg-gray-100 hover:bg-gray-200 rounded border border-gray-200"
                        title="Copy USDT contract"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t pt-3">
                  <span>Total</span>
                  <span className="text-blue-600">
                    {useReservedBalance && canUseReservedForUpgradeUi
                      ? `${chainPayAmountForUpgrade.toFixed(2)} USDT`
                      : `${selectedPlan.tsp_price} USDT`}
                  </span>
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
                    <span>{useReservedBalance && chainPayAmountForUpgrade === 0 ? 'Pay From Reserved' : 'Pay Now'}</span>
                  </>
                )}
              </button>

              {walletState.isConnected && (
                <button
                  type="button"
                  onClick={() => void handleAddUsdtToken()}
                  className="mt-3 w-full rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  Add USDT Token
                </button>
              )}

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

export default Payment;
