import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';
import { ArrowDownLeft, ArrowUpRight, Clock, Package, RefreshCw, Target, TrendingUp } from 'lucide-react';

interface Transaction {
  twt_id: string;
  twt_transaction_type: 'credit' | 'debit' | 'transfer';
  twt_amount: number | string;
  twt_currency: string;
  twt_reference_type?: string | null;
  twt_status: 'pending' | 'completed' | 'failed' | 'cancelled';
  twt_created_at: string;
}

interface PlanEarningsRow {
  subscription_id: string;
  plan_id: string;
  plan_name: string;
  package_kind?: string | null;
  status: string;
  start_date?: string | null;
  exhausted_at?: string | null;
  exhaustion_reason?: string | null;
  plan_amount: number | string;
  target_income: number | string;
  working_paid: number | string;
  non_working_paid: number | string;
  total_paid: number | string;
  remaining_income: number | string;
  days_used: number | string;
  days_remaining: number | string;
  income_progress_percent: number | string;
  time_progress_percent: number | string;
  is_exhausted: boolean;
  overall_target_income: number | string;
  overall_total_paid: number | string;
  overall_remaining_income: number | string;
  overall_income_progress_percent: number | string;
}

const EARNING_EXCLUDED_REFERENCE_TYPES = new Set(['spin_wheel_prize']);

const EarningsDashboard: React.FC = () => {
  const { user } = useAuth();
  const notification = useNotification();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletReservedBalance, setWalletReservedBalance] = useState(0);
  const [reservedWithdrawals, setReservedWithdrawals] = useState(0);
  const [planEarnings, setPlanEarnings] = useState<PlanEarningsRow[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const toAmount = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  useEffect(() => {
    if (user?.id) {
      setTransactions([]);
      setWalletBalance(0);
      setWalletReservedBalance(0);
      setReservedWithdrawals(0);
      setPlanEarnings([]);
      setLoading(true);
      loadTransactions();
      loadWalletBalance();
      loadReservedWithdrawals();
      loadPlanEarnings();
    } else {
      setTransactions([]);
      setWalletBalance(0);
      setWalletReservedBalance(0);
      setReservedWithdrawals(0);
      setPlanEarnings([]);
      setLoading(false);
      setRefreshing(false);
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
        .select('twt_id, twt_transaction_type, twt_amount, twt_currency, twt_reference_type, twt_status, twt_created_at')
        .eq('twt_user_id', user.id)
        .eq('twt_status', 'completed')
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
        .select('tw_balance, tw_reserved_balance')
        .eq('tw_user_id', user.id)
        .eq('tw_currency', 'USDT')
        .eq('tw_wallet_type', 'working')
        .maybeSingle();

      if (error) throw error;
      setWalletBalance(toAmount((data as any)?.tw_balance));
      setWalletReservedBalance(toAmount((data as any)?.tw_reserved_balance));
    } catch (error) {
      console.error('Failed to load wallet balance:', error);
    }
  };

  const loadReservedWithdrawals = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('tbl_withdrawal_requests')
        .select('twr_amount, twr_status')
        .eq('twr_user_id', user.id)
        .eq('twr_wallet_type', 'working')
        .in('twr_status', ['pending', 'processing', 'approved']);

      if (error) throw error;
      const total = (data || []).reduce((sum: number, row: any) => sum + toAmount(row.twr_amount), 0);
      setReservedWithdrawals(total);
    } catch (error) {
      console.error('Failed to load reserved withdrawals:', error);
    }
  };

  const loadPlanEarnings = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.rpc('get_user_plan_earnings_dashboard');
      if (error) throw error;
      setPlanEarnings((data || []) as PlanEarningsRow[]);
    } catch (error) {
      console.error('Failed to load plan earnings dashboard:', error);
      setPlanEarnings([]);
    }
  };

  const withdrawableBalance = useMemo(() => {
    return Math.max(0, walletBalance - walletReservedBalance - reservedWithdrawals);
  }, [walletBalance, walletReservedBalance, reservedWithdrawals]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadTransactions(), loadWalletBalance(), loadReservedWithdrawals(), loadPlanEarnings()]);
  };

  const formatAmount = (value: unknown) => `${toAmount(value).toFixed(2)} USDT`;
  const formatDate = (value?: string | null) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'N/A';
    return date.toLocaleDateString();
  };
  const clampPercent = (value: unknown) => Math.min(100, Math.max(0, toAmount(value)));

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
      .filter(t =>
        t.twt_transaction_type === 'credit' &&
        !EARNING_EXCLUDED_REFERENCE_TYPES.has(String(t.twt_reference_type || '').toLowerCase())
      )
      .reduce((sum, t) => sum + toAmount(t.twt_amount), 0);
  }, [transactions]);

  const allTimeDebits = useMemo(() => {
    return transactions
      .filter(t => t.twt_transaction_type === 'debit')
      .reduce((sum, t) => sum + toAmount(t.twt_amount), 0);
  }, [transactions]);

  const todayCredits = useMemo(() => {
    const today = new Date().toDateString();
    return transactions
      .filter(t =>
        t.twt_transaction_type === 'credit' &&
        new Date(t.twt_created_at).toDateString() === today &&
        !EARNING_EXCLUDED_REFERENCE_TYPES.has(String(t.twt_reference_type || '').toLowerCase())
      )
      .reduce((sum, t) => sum + toAmount(t.twt_amount), 0);
  }, [transactions]);

  const monthCredits = useMemo(() => {
    const now = new Date();
    return transactions
      .filter(t =>
        t.twt_transaction_type === 'credit' &&
        !EARNING_EXCLUDED_REFERENCE_TYPES.has(String(t.twt_reference_type || '').toLowerCase())
      )
      .filter(t => {
        const d = new Date(t.twt_created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, t) => sum + toAmount(t.twt_amount), 0);
  }, [transactions]);

  const rangeCredits = useMemo(() => {
    return filteredTransactions
      .filter(t =>
        t.twt_transaction_type === 'credit' &&
        !EARNING_EXCLUDED_REFERENCE_TYPES.has(String(t.twt_reference_type || '').toLowerCase())
      )
      .reduce((sum, t) => sum + toAmount(t.twt_amount), 0);
  }, [filteredTransactions]);

  const rangeDebits = useMemo(() => {
    return filteredTransactions
      .filter(t => t.twt_transaction_type === 'debit')
      .reduce((sum, t) => sum + toAmount(t.twt_amount), 0);
  }, [filteredTransactions]);

  const overallPlanProgress = useMemo(() => {
    const first = planEarnings[0];
    return {
      target: toAmount(first?.overall_target_income),
      earned: toAmount(first?.overall_total_paid),
      remaining: toAmount(first?.overall_remaining_income),
      percent: clampPercent(first?.overall_income_progress_percent),
      activeCount: planEarnings.filter((plan) => !plan.is_exhausted).length
    };
  }, [planEarnings]);

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <ArrowUpRight className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-800">Total Earnings</span>
          </div>
          <p className="text-2xl font-bold text-green-600 mt-2">{allTimeCredits.toFixed(2)} USDT</p>
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
            <span className="text-sm font-medium text-red-800">Total Debited</span>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-2">{allTimeDebits.toFixed(2)} USDT</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">Reserved (For Upgrade)</span>
          </div>
          <p className="text-2xl font-bold text-yellow-700 mt-2">{walletReservedBalance.toFixed(2)} USDT</p>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">Pending Withdrawals</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2">{reservedWithdrawals.toFixed(2)} USDT</p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-lg">
          <div className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-800">Withdrawable</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 mt-2">{withdrawableBalance.toFixed(2)} USDT</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="text-lg font-semibold text-gray-900">Plan Earnings Progress</h4>
            <p className="text-sm text-gray-500 mt-1">Working and non-working income tracked against each package&apos;s 5x target.</p>
          </div>
          <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <Target className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-indigo-100 bg-indigo-50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-indigo-950">Overall Active Goal</p>
              <p className="mt-1 text-sm text-indigo-800">
                {formatAmount(overallPlanProgress.earned)} earned of {formatAmount(overallPlanProgress.target)}
              </p>
            </div>
            <div className="text-sm font-semibold text-indigo-900">
              {formatAmount(overallPlanProgress.remaining)} remaining
            </div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${overallPlanProgress.percent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-indigo-700">
            <span>{overallPlanProgress.percent.toFixed(2)}% complete</span>
            <span>{overallPlanProgress.activeCount} active package{overallPlanProgress.activeCount === 1 ? '' : 's'}</span>
          </div>
        </div>

        {planEarnings.length === 0 ? (
          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
            No launch packages found yet.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {planEarnings.map((plan) => {
              const incomePercent = clampPercent(plan.income_progress_percent);
              const timePercent = clampPercent(plan.time_progress_percent);
              const statusLabel = plan.is_exhausted ? 'Exhausted' : 'Active';

              return (
                <div key={plan.subscription_id} className="rounded-lg border border-gray-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 flex-shrink-0 text-indigo-600" />
                        <h5 className="truncate text-base font-semibold text-gray-900">{plan.plan_name}</h5>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatAmount(plan.plan_amount)} package • Started {formatDate(plan.start_date)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      plan.is_exhausted ? 'bg-gray-100 text-gray-700' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Target</p>
                      <p className="mt-1 font-semibold text-gray-900">{formatAmount(plan.target_income)}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Earned</p>
                      <p className="mt-1 font-semibold text-gray-900">{formatAmount(plan.total_paid)}</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Remaining</p>
                      <p className="mt-1 font-semibold text-gray-900">{formatAmount(plan.remaining_income)}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Earnings Progress
                        </span>
                        <span>{incomePercent.toFixed(2)}%</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${incomePercent}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Clock className="h-3.5 w-3.5" />
                          200-Day Window
                        </span>
                        <span>{Number(plan.days_used || 0)} used • {Number(plan.days_remaining || 0)} left</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${timePercent}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                    <div>Working: <span className="font-semibold text-gray-900">{formatAmount(plan.working_paid)}</span></div>
                    <div>Non-working: <span className="font-semibold text-gray-900">{formatAmount(plan.non_working_paid)}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
    </div>
  );
};

export default EarningsDashboard;
