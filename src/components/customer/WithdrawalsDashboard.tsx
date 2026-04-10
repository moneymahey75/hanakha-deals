import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';
import { processingIndicator } from '../../lib/processingIndicator';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { getCustomerFriendlyWithdrawalMessage } from '../../utils/withdrawalMessages';
import { useScrollToTopOnChange } from '../../hooks/useScrollToTopOnChange';

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

const pendingWithdrawalStatuses = ['pending', 'processing', 'approved'];

const WithdrawalsDashboard: React.FC = () => {
  const { user } = useAuth();
  const notification = useNotification();

  const [walletBalance, setWalletBalance] = useState(0);
  const [reservedBalance, setReservedBalance] = useState(0);
  const [defaultWallet, setDefaultWallet] = useState<DefaultWalletConnection | null>(null);

  const [withdrawalSettings, setWithdrawalSettings] = useState<WithdrawalSettings>({
    minAmount: 10,
    stepAmount: 10,
    commissionPercent: 0.5,
    autoTransfer: false,
    processingDays: 5,
  });

  const [withdrawalInput, setWithdrawalInput] = useState('');
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);
  const [cancelingWithdrawalId, setCancelingWithdrawalId] = useState<string | null>(null);

  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const topRef = useScrollToTopOnChange([currentPage], { smooth: true });

  useEffect(() => {
    if (!user?.id) return;
    loadWithdrawalSettings();
    loadDefaultWallet();
    loadWalletBalance();
    loadReservedBalance();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadWithdrawalHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentPage, pageSize]);

  const withdrawableBalance = useMemo(() => {
    return Math.max(0, Number(walletBalance || 0) - Number(reservedBalance || 0));
  }, [walletBalance, reservedBalance]);

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
  const isWithdrawalAmountValid =
    parsedWithdrawalAmount >= withdrawalSettings.minAmount &&
    isStepValid(parsedWithdrawalAmount, withdrawalSettings.stepAmount);

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

  const loadReservedBalance = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('tbl_withdrawal_requests')
        .select('twr_amount, twr_status')
        .eq('twr_user_id', user.id)
        .in('twr_status', pendingWithdrawalStatuses);

      if (error) throw error;
      const total = (data || []).reduce((sum: number, row: any) => sum + Number(row.twr_amount || 0), 0);
      setReservedBalance(total);
    } catch (error) {
      console.error('Failed to load reserved balance:', error);
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
          'withdrawal_processing_days',
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
        processingDays: Number(settingsMap.withdrawal_processing_days ?? 5),
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

  const loadWithdrawalHistory = async () => {
    if (!user?.id) return;
    setWithdrawalsLoading(true);
    try {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from('tbl_withdrawal_requests')
        .select('*', { count: 'exact' })
        .eq('twr_user_id', user.id)
        .order('twr_requested_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setWithdrawalRequests(data || []);
      setTotalCount(Number(count || 0));
    } catch (error) {
      console.error('Failed to load withdrawals:', error);
      setWithdrawalRequests([]);
      setTotalCount(0);
    } finally {
      setWithdrawalsLoading(false);
    }
  };

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
      notification.showError('Minimum Withdrawal', `Minimum withdrawal amount is ${withdrawalSettings.minAmount} USDT.`);
      return;
    }

    if (!isStepValid(parsedWithdrawalAmount, withdrawalSettings.stepAmount)) {
      notification.showError(
        'Invalid Step',
        `Withdrawal amount must be in multiples of ${withdrawalSettings.stepAmount} USDT.`
      );
      return;
    }

    if (parsedWithdrawalAmount > withdrawableBalance) {
      notification.showError(
        'Insufficient Balance',
        reservedBalance > 0
          ? `Withdrawable balance is ${withdrawableBalance.toFixed(2)} USDT (some funds are reserved in pending withdrawals).`
          : 'Your wallet balance is too low for this withdrawal.'
      );
      return;
    }

    setWithdrawalSubmitting(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Missing user session');
      }

      const result = await processingIndicator.track(async () => {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/request-withdrawal`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: parsedWithdrawalAmount,
          }),
        });

        return response.json();
      }, 'Submitting withdrawal...');

      if (!result.success) {
        throw new Error(result.error || 'Withdrawal request failed');
      }

      notification.showSuccess(
        withdrawalSettings.autoTransfer ? 'Withdrawal Submitted' : 'Withdrawal Requested',
        withdrawalSettings.autoTransfer
          ? 'Your withdrawal is being processed automatically.'
          : `Your approval request will be entertained within ${withdrawalSettings.processingDays} working day(s).`
      );

      setWithdrawalInput('');
      setCurrentPage(1);
      await Promise.all([loadWithdrawalHistory(), loadWalletBalance(), loadReservedBalance()]);
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

      const result = await processingIndicator.track(async () => {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-withdrawal`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ withdrawalId }),
        });

        return response.json();
      }, 'Cancelling withdrawal...');

      if (!result.success) {
        throw new Error(result.error || 'Cancellation failed');
      }

      notification.showSuccess('Withdrawal Cancelled', 'Your withdrawal request has been cancelled.');
      await Promise.all([loadWithdrawalHistory(), loadReservedBalance(), loadWalletBalance()]);
    } catch (error: any) {
      notification.showError('Cancellation Failed', error.message || 'Unable to cancel withdrawal');
    } finally {
      setCancelingWithdrawalId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-6">
      <div ref={topRef} />
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Withdrawals</h3>
        <button
          onClick={() => {
            loadWithdrawalHistory();
            loadWalletBalance();
            loadReservedBalance();
            loadDefaultWallet();
          }}
          className="bg-indigo-100 text-indigo-700 p-2 rounded-lg hover:bg-indigo-200 transition-colors"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
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
            <p className="text-sm font-medium text-gray-900 mt-1 font-mono break-all">
              {defaultWallet?.tuwc_wallet_address || 'No default wallet selected'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                Withdrawable: {withdrawableBalance.toFixed(2)} USDT
              </span>
              <span className="text-xs text-gray-500">Total: {walletBalance.toFixed(2)} USDT</span>
              {reservedBalance > 0 && (
                <span className="text-xs text-gray-500">Reserved: {reservedBalance.toFixed(2)} USDT</span>
              )}
            </div>
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
            Processing: <span className="font-medium text-gray-900">{withdrawalSettings.processingDays} working day(s)</span>
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
              : `Approval required. Expect ${withdrawalSettings.processingDays} working day(s).`}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleWithdrawalSubmit}
            disabled={withdrawalSubmitting || !isWithdrawalAmountValid}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <ArrowUpRight className="h-4 w-4" />
            {withdrawalSubmitting ? 'Submitting...' : 'Submit Withdrawal'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-900">Withdrawal History</h4>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Page size</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
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
                    <p className="text-sm font-medium text-gray-900">{Number(request.twr_amount).toFixed(2)} USDT</p>
                    <p className="text-xs text-gray-500">
                      Net: {Number(request.twr_net_amount).toFixed(2)} USDT •{' '}
                      {new Date(request.twr_requested_at).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 font-mono break-all">
                      Wallet: {request.twr_destination_address}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        request.twr_status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : request.twr_status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : request.twr_status === 'processing'
                              ? 'bg-blue-100 text-blue-800'
                              : request.twr_status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : request.twr_status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {request.twr_status}
                    </span>
                    {request.twr_blockchain_tx && (
                      <span className="text-xs text-gray-500">Tx: {request.twr_blockchain_tx.slice(0, 8)}...</span>
                    )}
                    {String(request.twr_status || '').toLowerCase() === 'pending' && (
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
                  <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                    <p className="text-xs font-medium text-red-700">Update</p>
                    <p className="text-xs text-red-600 mt-1">
                      {getCustomerFriendlyWithdrawalMessage(request.twr_failure_reason)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalCount > 0 && (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t border-gray-200 mt-6">
            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages} • Showing {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Next
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WithdrawalsDashboard;

