import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';
import { ArrowDownLeft, ArrowUpRight, Clock, RefreshCw } from 'lucide-react';

interface Transaction {
  twt_id: string;
  twt_transaction_type: 'credit' | 'debit' | 'transfer';
  twt_amount: number;
  twt_currency: string;
  twt_status: 'pending' | 'completed' | 'failed' | 'cancelled';
  twt_created_at: string;
}

interface WithdrawalRequest {
  twr_id: string;
  twr_amount: number;
  twr_commission_percent: number;
  twr_commission_amount: number;
  twr_net_amount: number;
  twr_status: string;
  twr_destination_address: string;
  twr_requested_at: string;
  twr_blockchain_tx?: string | null;
  twr_failure_reason?: string | null;
}

interface WithdrawalSettings {
  minAmount: number;
  stepAmount: number;
  commissionPercent: number;
  autoTransfer: boolean;
  processingDays: number;
}

interface DefaultWalletConnection {
  tuwc_id: string;
  tuwc_wallet_address: string;
  tuwc_wallet_type: string;
  tuwc_chain_id: number;
}

const EarningsDashboard: React.FC = () => {
  const { user } = useAuth();
  const notification = useNotification();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [withdrawalSettings, setWithdrawalSettings] = useState<WithdrawalSettings>({
    minAmount: 10,
    stepAmount: 10,
    commissionPercent: 0.5,
    autoTransfer: false,
    processingDays: 5
  });
  const [withdrawalInput, setWithdrawalInput] = useState('');
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [defaultWallet, setDefaultWallet] = useState<DefaultWalletConnection | null>(null);
  const [cancelingWithdrawalId, setCancelingWithdrawalId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (user?.id) {
      loadTransactions();
      loadWalletBalance();
      loadWithdrawalSettings();
      loadWithdrawalRequests();
      loadDefaultWallet();
    }
  }, [user?.id]);

  useEffect(() => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateTo(dateFrom);
    }
  }, [dateFrom, dateTo]);

  const loadTransactions = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('tbl_wallet_transactions')
        .select('twt_id, twt_transaction_type, twt_amount, twt_currency, twt_status, twt_created_at')
        .eq('twt_user_id', user.id)
        .order('twt_created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Failed to load earnings transactions:', error);
      notification.showError('Error', 'Failed to load earnings data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadWalletBalance = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('tbl_wallets')
        .select('tw_balance')
        .eq('tw_user_id', user.id)
        .eq('tw_currency', 'USDT')
        .maybeSingle();

      if (error) throw error;
      setWalletBalance(Number(data?.tw_balance ?? 0));
    } catch (error) {
      console.error('Failed to load wallet balance:', error);
    }
  };

  const loadWithdrawalSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('tbl_system_settings')
        .select('tss_setting_key, tss_setting_value')
        .in('tss_setting_key', [
          'withdrawal_min_amount',
          'withdrawal_step_amount',
          'withdrawal_commission_percent',
          'withdrawal_auto_transfer',
          'withdrawal_processing_days'
        ]);

      if (error) throw error;

      const settingsMap = (data || []).reduce((acc: any, setting: any) => {
        try {
          acc[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value);
        } catch {
          acc[setting.tss_setting_key] = setting.tss_setting_value;
        }
        return acc;
      }, {});

      setWithdrawalSettings({
        minAmount: Number(settingsMap.withdrawal_min_amount ?? 10),
        stepAmount: Number(settingsMap.withdrawal_step_amount ?? 10),
        commissionPercent: Number(settingsMap.withdrawal_commission_percent ?? 0.5),
        autoTransfer: Boolean(settingsMap.withdrawal_auto_transfer ?? false),
        processingDays: Number(settingsMap.withdrawal_processing_days ?? 5)
      });
    } catch (error) {
      console.error('Failed to load withdrawal settings:', error);
    }
  };

  const loadDefaultWallet = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('tbl_user_wallet_connections')
        .select('tuwc_id, tuwc_wallet_address, tuwc_wallet_type, tuwc_chain_id')
        .eq('tuwc_user_id', user.id)
        .eq('tuwc_is_default', true)
        .eq('tuwc_is_active', true)
        .maybeSingle();

      if (error) throw error;
      setDefaultWallet(data || null);
    } catch (error) {
      console.error('Failed to load default wallet:', error);
    }
  };

  const loadWithdrawalRequests = async () => {
    if (!user?.id) return;
    setWithdrawalsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tbl_withdrawal_requests')
        .select('*')
        .eq('twr_user_id', user.id)
        .order('twr_requested_at', { ascending: false });

      if (error) throw error;
      setWithdrawalRequests(data || []);
    } catch (error) {
      console.error('Failed to load withdrawals:', error);
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  const isStepValid = (amount: number, step: number) => {
    if (step <= 0) return true;
    const factor = 100;
    const scaledAmount = Math.round(amount * factor);
    const scaledStep = Math.round(step * factor);
    return scaledAmount % scaledStep === 0;
  };

  const normalizeWithdrawalAmount = (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    let normalized = amount;
    if (normalized < withdrawalSettings.minAmount) {
      normalized = withdrawalSettings.minAmount;
    }
    if (withdrawalSettings.stepAmount > 0) {
      const stepsFromZero = Math.round(normalized / withdrawalSettings.stepAmount);
      normalized = stepsFromZero * withdrawalSettings.stepAmount;
    }
    if (normalized < withdrawalSettings.minAmount) {
      if (withdrawalSettings.stepAmount > 0) {
        const minSteps = Math.ceil(withdrawalSettings.minAmount / withdrawalSettings.stepAmount);
        normalized = minSteps * withdrawalSettings.stepAmount;
      } else {
        normalized = withdrawalSettings.minAmount;
      }
    }
    return Number(normalized.toFixed(2));
  };

  const parseWithdrawalInput = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const parsedWithdrawalAmount = parseWithdrawalInput(withdrawalInput);
  const isWithdrawalAmountValid = parsedWithdrawalAmount >= withdrawalSettings.minAmount &&
    isStepValid(parsedWithdrawalAmount, withdrawalSettings.stepAmount);

  const handleWithdrawalSubmit = async () => {
    if (!user?.id) return;

    if (!defaultWallet?.tuwc_wallet_address) {
      notification.showError('Missing Wallet', 'Please set a default wallet before withdrawing.');
      return;
    }

    if (parsedWithdrawalAmount <= 0) {
      notification.showError('Invalid Amount', 'Enter a valid withdrawal amount.');
      return;
    }

    if (parsedWithdrawalAmount < withdrawalSettings.minAmount) {
      notification.showError(
        'Minimum Withdrawal',
        `Minimum withdrawal amount is ${withdrawalSettings.minAmount} USDT.`
      );
      return;
    }

    if (!isStepValid(parsedWithdrawalAmount, withdrawalSettings.stepAmount)) {
      notification.showError(
        'Invalid Step',
        `Withdrawal amount must be in multiples of ${withdrawalSettings.stepAmount} USDT.`
      );
      return;
    }

    if (parsedWithdrawalAmount > walletBalance) {
      notification.showError('Insufficient Balance', 'Your wallet balance is too low for this withdrawal.');
      return;
    }

    setWithdrawalSubmitting(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Missing user session');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-withdrawal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: parsedWithdrawalAmount
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Withdrawal request failed');
      }

      notification.showSuccess(
        withdrawalSettings.autoTransfer ? 'Withdrawal Submitted' : 'Withdrawal Requested',
        withdrawalSettings.autoTransfer
          ? 'Your withdrawal is being processed automatically.'
          : `Your approval request will be entertained within ${withdrawalSettings.processingDays} working days.`
      );

      setWithdrawalInput('');
      loadWithdrawalRequests();
      loadWalletBalance();
    } catch (error: any) {
      notification.showError('Withdrawal Failed', error.message || 'Unable to submit withdrawal');
    } finally {
      setWithdrawalSubmitting(false);
    }
  };


  const handleCancelWithdrawal = async (withdrawalId: string) => {
    if (!user?.id) return;
    setCancelingWithdrawalId(withdrawalId);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Missing user session');
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-withdrawal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ withdrawalId })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Cancellation failed');
      }

      notification.showSuccess('Withdrawal Cancelled', 'Your withdrawal request has been cancelled.');
      loadWithdrawalRequests();
    } catch (error: any) {
      notification.showError('Cancellation Failed', error.message || 'Unable to cancel withdrawal');
    } finally {
      setCancelingWithdrawalId(null);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTransactions();
  };

  const filteredTransactions = useMemo(() => {
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const end = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    return transactions.filter(tx => {
      const txDate = new Date(tx.twt_created_at);
      if (start && txDate < start) return false;
      if (end && txDate > end) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo]);

  const allTimeCredits = useMemo(() => {
    return transactions
      .filter(t => t.twt_transaction_type === 'credit')
      .reduce((sum, t) => sum + t.twt_amount, 0);
  }, [transactions]);

  const allTimeDebits = useMemo(() => {
    return transactions
      .filter(t => t.twt_transaction_type === 'debit')
      .reduce((sum, t) => sum + t.twt_amount, 0);
  }, [transactions]);

  const todayCredits = useMemo(() => {
    const today = new Date().toDateString();
    return transactions
      .filter(t => t.twt_transaction_type === 'credit' && new Date(t.twt_created_at).toDateString() === today)
      .reduce((sum, t) => sum + t.twt_amount, 0);
  }, [transactions]);

  const monthCredits = useMemo(() => {
    const now = new Date();
    return transactions
      .filter(t => t.twt_transaction_type === 'credit')
      .filter(t => {
        const d = new Date(t.twt_created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, t) => sum + t.twt_amount, 0);
  }, [transactions]);

  const rangeCredits = useMemo(() => {
    return filteredTransactions
      .filter(t => t.twt_transaction_type === 'credit')
      .reduce((sum, t) => sum + t.twt_amount, 0);
  }, [filteredTransactions]);

  const rangeDebits = useMemo(() => {
    return filteredTransactions
      .filter(t => t.twt_transaction_type === 'debit')
      .reduce((sum, t) => sum + t.twt_amount, 0);
  }, [filteredTransactions]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Earnings</h3>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="bg-indigo-100 text-indigo-700 p-2 rounded-lg hover:bg-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <ArrowUpRight className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">Total Earnings</span>
          </div>
          <p className="text-2xl font-bold text-green-600 mt-2">{allTimeCredits.toFixed(2)} USDT</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">This Month Earnings</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2">{monthCredits.toFixed(2)} USDT</p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-800">Today&apos;s Earnings</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 mt-2">{todayCredits.toFixed(2)} USDT</p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <ArrowDownLeft className="h-5 w-5 text-red-600" />
            <span className="text-sm font-medium text-red-800">Total Debits</span>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-2">{allTimeDebits.toFixed(2)} USDT</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Date Range</h4>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 6);
                setDateFrom(d.toISOString().slice(0, 10));
                setDateTo(new Date().toISOString().slice(0, 10));
              }}
              className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => {
                const now = new Date();
                const first = new Date(now.getFullYear(), now.getMonth(), 1);
                setDateFrom(first.toISOString().slice(0, 10));
                setDateTo(new Date().toISOString().slice(0, 10));
              }}
              className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              This Month
            </button>
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              All Time
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Date Range Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center space-x-2">
              <ArrowUpRight className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">Range Credits</span>
            </div>
            <p className="text-2xl font-bold text-green-600 mt-2">{rangeCredits.toFixed(2)} USDT</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="flex items-center space-x-2">
              <ArrowDownLeft className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-red-800">Range Debits</span>
            </div>
            <p className="text-2xl font-bold text-red-600 mt-2">{rangeDebits.toFixed(2)} USDT</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">Range Count</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 mt-2">{filteredTransactions.length}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
        <div>
          <h4 className="text-lg font-semibold text-gray-900">Withdraw Earnings</h4>
          <p className="text-sm text-gray-600 mt-1">Submit a withdrawal request using your default wallet.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount (USDT)</label>
            <input
              type="number"
              min={withdrawalSettings.minAmount}
              step={withdrawalSettings.stepAmount || 1}
              value={withdrawalInput}
              onChange={(event) => {
                const rawValue = event.target.value;
                if (rawValue === '' || /^\d*\.?\d*$/.test(rawValue)) {
                  setWithdrawalInput(rawValue);
                }
              }}
              onBlur={() => {
                if (!withdrawalInput) return;
                const normalized = normalizeWithdrawalAmount(parsedWithdrawalAmount);
                if (normalized !== parsedWithdrawalAmount) {
                  setWithdrawalInput(String(normalized));
                }
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder={`Minimum ${withdrawalSettings.minAmount} USDT`}
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">Default Wallet</p>
            <p className="text-sm font-medium text-gray-900 mt-1">
              {defaultWallet?.tuwc_wallet_address || 'No default wallet selected'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Available balance: {walletBalance.toFixed(2)} USDT
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
          <div>
            Minimum: <span className="font-medium text-gray-900">{withdrawalSettings.minAmount} USDT</span>
          </div>
          <div>
            Step: <span className="font-medium text-gray-900">{withdrawalSettings.stepAmount} USDT</span>
          </div>
          <div>
            Commission: <span className="font-medium text-gray-900">{withdrawalSettings.commissionPercent}%</span>
          </div>
          <div>
            Processing: <span className="font-medium text-gray-900">{withdrawalSettings.processingDays} working days</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm">
          <div>
            Estimated commission:{' '}
            <span className="font-medium text-gray-900">
              {(parsedWithdrawalAmount * (withdrawalSettings.commissionPercent / 100)).toFixed(2)} USDT
            </span>
          </div>
          <div>
            Estimated net:{' '}
            <span className="font-semibold text-gray-900">
              {(parsedWithdrawalAmount - parsedWithdrawalAmount * (withdrawalSettings.commissionPercent / 100)).toFixed(2)} USDT
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {withdrawalSettings.autoTransfer
              ? 'Auto-transfer is enabled.'
              : `Approval required. Expect ${withdrawalSettings.processingDays} working days.`}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleWithdrawalSubmit}
            disabled={withdrawalSubmitting || !isWithdrawalAmountValid}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {withdrawalSubmitting ? 'Submitting...' : 'Submit Withdrawal'}
          </button>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900">Withdrawal History</h4>
            <button
              onClick={loadWithdrawalRequests}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              Refresh
            </button>
          </div>

          {withdrawalsLoading ? (
            <div className="text-center py-6 text-sm text-gray-500">Loading withdrawals...</div>
          ) : withdrawalRequests.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">No withdrawals yet.</div>
          ) : (
            <div className="space-y-3">
              {withdrawalRequests.map((request) => (
                <div key={request.twr_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {Number(request.twr_amount).toFixed(2)} USDT
                      </p>
                      <p className="text-xs text-gray-500">
                        Net: {Number(request.twr_net_amount).toFixed(2)} USDT • {new Date(request.twr_requested_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500">
                        Wallet: {request.twr_destination_address}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.twr_status === 'completed' ? 'bg-green-100 text-green-800' :
                          request.twr_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            request.twr_status === 'processing' ? 'bg-blue-100 text-blue-800' :
                              request.twr_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                      }`}>
                        {request.twr_status}
                      </span>
                      {request.twr_blockchain_tx && (
                        <span className="text-xs text-gray-500">Tx: {request.twr_blockchain_tx.slice(0, 8)}...</span>
                      )}
                      {request.twr_status === 'pending' && (
                        <button
                          onClick={() => handleCancelWithdrawal(request.twr_id)}
                          disabled={cancelingWithdrawalId === request.twr_id}
                          className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                        >
                          {cancelingWithdrawalId === request.twr_id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </div>
                  {request.twr_failure_reason && (
                    <p className="text-xs text-red-600 mt-2">
                      {request.twr_failure_reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EarningsDashboard;
