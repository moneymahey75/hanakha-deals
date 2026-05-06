import React, { useState, useEffect } from 'react';
import { adminApi } from '../../lib/adminApi';
import { useNotification } from '../ui/NotificationProvider';
import {
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  Eye,
  RefreshCw,
  Download,
  AlertTriangle,
  Copy,
  ExternalLink,
  Smartphone,
} from 'lucide-react';

let inFlightPendingPaymentsRequest: { key: string; promise: Promise<any> } | null = null;
let inFlightAdminUsersRequest: Promise<AdminUser[]> | null = null;
let inFlightAdminEarningsRequest: {
  key: string;
  promise: Promise<AdminEarning[]>;
} | null = null;

interface Payment {
  tp_id: string;
  tp_user_id: string;
  tp_amount: number;
  tp_payment_method: string;
  tp_payment_status: string;
  tp_transaction_id: string | null;
  tp_error_message?: string | null;
  tp_gateway_response?: any;
  tp_wallet_error_code?: string | null;
  tp_wallet_error_raw?: string | null;
  tp_device_info?: string | null;
  tp_is_stuck?: boolean;
  tp_stuck_at?: string | null;
  tp_wallet_address?: string | null;
  tp_to_address?: string | null;
  tp_network?: string | null;
  tp_created_at?: string;
  tp_verified_at?: string;
  user?: {
    tu_email: string;
    tu_is_dummy?: boolean;
  };
  subscription?: {
    tus_id: string;
    plan?: {
      tsp_name: string;
      tsp_type: string;
    };
  };
}

interface AdminUser {
  tau_id: string;
  tau_email: string;
  tau_full_name?: string | null;
  tau_role?: string | null;
}

interface AdminEarning {
  tp_id: string;
  tp_transaction_id: string | null;
  tp_amount: number | null;
  tp_currency: string | null;
  tp_payment_status: string | null;
  tp_created_at?: string | null;
  tp_verified_at?: string | null;
  tp_gateway_response?: any;
  tp_processed_by_admin_id?: string | null;
  tp_processed_by_admin_email?: string | null;
  tp_processed_by_admin_name?: string | null;
  user?: {
    tu_email: string;
    tu_is_dummy?: boolean;
  };
}

type AdminWalletStats = {
  walletAddress: string;
  walletUsdtBalance: number;
  walletNativeBalance: number;
  todayEarnings: number;
  todayEarningsAll?: number;
  todayEarningsReal?: number;
  todayEarningsDummy?: number;
  todayWithdrawalsRequested: number;
  todayWithdrawalsRequestedAll?: number;
  todayWithdrawalsRequestedReal?: number;
  todayWithdrawalsRequestedDummy?: number;
  todayWithdrawalsCount: number;
  todayWithdrawalsCountAll?: number;
  todayWithdrawalsCountReal?: number;
  todayWithdrawalsCountDummy?: number;
};

const PendingPayments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stuckPayments, setStuckPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [adminEarnings, setAdminEarnings] = useState<AdminEarning[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [accountScope, setAccountScope] = useState<'real' | 'dummy' | 'all'>('real');
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [earningsAdminFilter, setEarningsAdminFilter] = useState('all');
  const [earningsStartDate, setEarningsStartDate] = useState('');
  const [earningsEndDate, setEarningsEndDate] = useState('');
  const [walletStats, setWalletStats] = useState<AdminWalletStats | null>(null);
  const [walletStatsLoading, setWalletStatsLoading] = useState(false);
  const notification = useNotification();

  useEffect(() => {
    loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountScope]);

  useEffect(() => {
    loadAdmins();
  }, []);

  useEffect(() => {
    loadAdminEarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earningsAdminFilter, earningsStartDate, earningsEndDate, accountScope]);

  useEffect(() => {
    loadWalletStats();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const requestKey = JSON.stringify({ accountScope });
      const requestPromise =
        inFlightPendingPaymentsRequest?.key === requestKey
          ? inFlightPendingPaymentsRequest.promise
          : adminApi.post<any>('admin-get-pending-payments', { accountScope });

      if (inFlightPendingPaymentsRequest?.key !== requestKey) {
        inFlightPendingPaymentsRequest = { key: requestKey, promise: requestPromise };
      }

      const result = await requestPromise as any;
      // Edge function returns { all, stuck, pending } — handle both old array shape and new object shape
      let stuck: Payment[] = [];
      let pending: Payment[] = [];
      if (Array.isArray(result)) {
        stuck = result.filter((p: Payment) => p.tp_is_stuck);
        pending = result.filter((p: Payment) => !p.tp_is_stuck);
      } else if (result && typeof result === 'object') {
        stuck = result.stuck || [];
        pending = result.pending || [];
      }
      setPayments(pending);
      setStuckPayments(stuck);
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      const requestKey = JSON.stringify({ accountScope });
      if (inFlightPendingPaymentsRequest?.key === requestKey) {
        inFlightPendingPaymentsRequest = null;
      }
      setLoading(false);
    }
  };

  const loadWalletStats = async () => {
    setWalletStatsLoading(true);
    try {
      const data = await adminApi.post<AdminWalletStats>('admin-get-admin-wallet-stats', {});
      setWalletStats(data || null);
    } catch (error: any) {
      console.error('Failed to load admin wallet stats:', error);
      setWalletStats(null);
    } finally {
      setWalletStatsLoading(false);
    }
  };

  const parseGatewayResponse = (raw: any) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return {};
  };

  const getGatewayIssue = (payment: Payment) => {
    const gateway = parseGatewayResponse(payment.tp_gateway_response);
    return (
      payment.tp_error_message ||
      gateway.error ||
      gateway.reason ||
      gateway.shortMessage ||
      gateway.gateway_response?.error ||
      gateway.gateway_response?.message ||
      gateway.raw_error?.reason ||
      gateway.raw_error?.message ||
      ''
    );
  };

  const loadAdmins = async () => {
    try {
      const requestPromise = inFlightAdminUsersRequest ?? adminApi.post<AdminUser[]>('admin-get-admin-users');
      inFlightAdminUsersRequest = requestPromise;
      const data = await requestPromise;
      setAdmins(data || []);
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      inFlightAdminUsersRequest = null;
    }
  };

  const loadAdminEarnings = async () => {
    setEarningsLoading(true);
    try {
      const requestPayload = {
        adminId: earningsAdminFilter,
        startDate: earningsStartDate || null,
        endDate: earningsEndDate || null,
        accountScope
      };
      const requestKey = JSON.stringify(requestPayload);
      const requestPromise =
        inFlightAdminEarningsRequest?.key === requestKey
          ? inFlightAdminEarningsRequest.promise
          : adminApi.post<AdminEarning[]>('admin-get-admin-earnings', requestPayload);

      if (inFlightAdminEarningsRequest?.key !== requestKey) {
        inFlightAdminEarningsRequest = {
          key: requestKey,
          promise: requestPromise
        };
      }

      const data = await requestPromise;

      setAdminEarnings(data || []);
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      const requestKey = JSON.stringify({
        adminId: earningsAdminFilter,
        startDate: earningsStartDate || null,
        endDate: earningsEndDate || null,
        accountScope
      });
      if (inFlightAdminEarningsRequest?.key === requestKey) {
        inFlightAdminEarningsRequest = null;
      }
      setEarningsLoading(false);
    }
  };

  const handleApprovePayment = async (paymentId: string) => {
    const payment = payments.find((item) => item.tp_id === paymentId);
    const hasTxHash = Boolean(payment?.tp_transaction_id);
    const manualVerified = hasTxHash
      ? confirm(
        `Only approve this payment if you have manually verified this exact transaction in the admin wallet:\n\n${payment?.tp_transaction_id}`
      )
      : true;

    if (!manualVerified) return;

    setProcessing(paymentId);
    try {
      const result = await adminApi.post<any>('process-registration-payment', {
        paymentId,
        manualVerified: hasTxHash
      });
      const commissionPaid = typeof result?.commission_paid === 'number' ? result.commission_paid : 0;
      notification.showSuccess(
        'Payment Approved',
        commissionPaid > 0
          ? `Payment processed and $${commissionPaid} commission credited to referrer`
          : 'Payment processed. No referral commission applied.'
      );

      loadPayments();
    } catch (error: any) {
      notification.showError('Approval Failed', error.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    if (!confirm('Are you sure you want to reject this payment?')) return;

    setProcessing(paymentId);
    try {
      await adminApi.post('admin-reject-payment', { paymentId });

      notification.showSuccess('Payment Rejected', 'Payment has been rejected');
      loadPayments();
    } catch (error: any) {
      notification.showError('Rejection Failed', error.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleVerifyPayment = async (paymentId: string) => {
    setVerifying(paymentId);
    try {
      await adminApi.post('verify-registration-payment-admin', { paymentId });

      notification.showSuccess('Verification Complete', 'Payment verified and updated.');
      loadPayments();
    } catch (error: any) {
      notification.showError('Verification Failed', error.message);
    } finally {
      setVerifying(null);
    }
  };

  const getAdminLabel = (earning: AdminEarning) => {
    const name = earning.tp_processed_by_admin_name?.trim();
    const email = earning.tp_processed_by_admin_email?.trim();
    if (name && email) return `${name} (${email})`;
    if (name) return name;
    if (email) return email;
    return earning.tp_processed_by_admin_id || 'System';
  };

  const exportEarningsCsv = () => {
    const headers = [
      'Verified Date',
      'Customer Email',
      'Amount',
      'Currency',
      'Admin Income',
      'Commission Paid',
      'Commission To',
      'Processed By',
      'Transaction Id',
      'Payment Id'
    ];

    const rows = adminEarnings.map((earning) => {
      const gateway = parseGatewayResponse(earning.tp_gateway_response);
      const adminIncome = Number(gateway.admin_income ?? 0);
      const commissionPaid = Number(gateway.parent_income ?? 0);
      const commissionTo = gateway.parent_account || gateway.parent_user_id || '';
      const verifiedAt = earning.tp_verified_at || earning.tp_created_at || '';

      return [
        verifiedAt,
        earning.user?.tu_email || '',
        earning.tp_amount ?? '',
        earning.tp_currency ?? '',
        adminIncome,
        commissionPaid,
        commissionTo,
        getAdminLabel(earning),
        earning.tp_transaction_id || '',
        earning.tp_id
      ];
    });

    const escapeCsv = (value: any) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `admin-earnings-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const earningsTotals = adminEarnings.reduce(
    (acc, earning) => {
      const gateway = parseGatewayResponse(earning.tp_gateway_response);
      acc.gross += Number(earning.tp_amount ?? 0);
      acc.adminIncome += Number(gateway.admin_income ?? 0);
      acc.commission += Number(gateway.parent_income ?? 0);
      return acc;
    },
    { gross: 0, adminIncome: 0, commission: 0 }
  );

  const resolvedWalletStats = (() => {
    if (!walletStats) return null;
    const earningsAll = Number(walletStats.todayEarningsAll ?? walletStats.todayEarnings ?? 0) || 0;
    const earningsDummy = Number(walletStats.todayEarningsDummy ?? 0) || 0;
    const earningsReal = Number(walletStats.todayEarningsReal ?? (earningsAll - earningsDummy)) || 0;

    const withdrawalsAll = Number(walletStats.todayWithdrawalsRequestedAll ?? walletStats.todayWithdrawalsRequested ?? 0) || 0;
    const withdrawalsDummy = Number(walletStats.todayWithdrawalsRequestedDummy ?? 0) || 0;
    const withdrawalsReal = Number(walletStats.todayWithdrawalsRequestedReal ?? (withdrawalsAll - withdrawalsDummy)) || 0;

    const withdrawalsCountAll = Number(walletStats.todayWithdrawalsCountAll ?? walletStats.todayWithdrawalsCount ?? 0) || 0;
    const withdrawalsCountDummy = Number(walletStats.todayWithdrawalsCountDummy ?? 0) || 0;
    const withdrawalsCountReal = Number(walletStats.todayWithdrawalsCountReal ?? (withdrawalsCountAll - withdrawalsCountDummy)) || 0;

    const primary =
      accountScope === 'dummy'
        ? {
          earnings: earningsDummy,
          withdrawalsAmount: withdrawalsDummy,
          withdrawalsCount: withdrawalsCountDummy,
        }
        : accountScope === 'all'
          ? {
            earnings: earningsAll,
            withdrawalsAmount: withdrawalsAll,
            withdrawalsCount: withdrawalsCountAll,
          }
          : {
            earnings: earningsReal,
            withdrawalsAmount: withdrawalsReal,
            withdrawalsCount: withdrawalsCountReal,
          };

    return {
      earningsAll,
      earningsReal,
      earningsDummy,
      withdrawalsAll,
      withdrawalsReal,
      withdrawalsDummy,
      withdrawalsCountAll,
      withdrawalsCountReal,
      withdrawalsCountDummy,
      primary,
    };
  })();

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pending Registration Payments</h2>
            <p className="text-gray-600 mt-1">Review and approve customer registration payments</p>
          </div>
          <div className="flex items-center space-x-3">
            <select
              value={accountScope}
              onChange={(e) => setAccountScope(e.target.value as 'real' | 'dummy' | 'all')}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              title="Filter dummy/fake customer payments"
            >
              <option value="real">Real Only</option>
              <option value="dummy">Dummy Only</option>
              <option value="all">All Accounts</option>
            </select>
            <button
              onClick={() => {
                loadPayments();
                loadWalletStats();
              }}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
            >
              <RefreshCw className="h-5 w-5" />
              <span>Refresh</span>
            </button>
          </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Live Admin Wallet Stats</h3>
            <p className="text-sm text-gray-600">Balance and today’s totals</p>
          </div>
          <button
            onClick={loadWalletStats}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{walletStatsLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {walletStatsLoading ? (
          <div className="text-sm text-gray-500">Loading wallet stats...</div>
        ) : walletStats ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-indigo-50 rounded-lg p-4">
              <p className="text-xs text-indigo-700">Wallet USDT Balance</p>
              <p className="text-lg font-semibold text-indigo-900">{walletStats.walletUsdtBalance.toFixed(2)} USDT</p>
              <p className="text-xs text-indigo-600 mt-1 truncate">{walletStats.walletAddress}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-xs text-green-700">
                {accountScope === 'dummy' ? 'Dummy Earnings Today' : accountScope === 'all' ? 'Total Earnings Today' : 'Real Earnings Today'}
              </p>
              <p className="text-lg font-semibold text-green-900">
                {(resolvedWalletStats?.primary.earnings ?? 0).toFixed(2)} USDT
              </p>
              <p className="text-xs text-green-700 mt-1">
                Real: {(resolvedWalletStats?.earningsReal ?? 0).toFixed(2)} • Dummy: {(resolvedWalletStats?.earningsDummy ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-xs text-amber-700">Withdrawals Today</p>
              <p className="text-lg font-semibold text-amber-900">
                {(resolvedWalletStats?.primary.withdrawalsAmount ?? 0).toFixed(2)} USDT
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {(resolvedWalletStats?.primary.withdrawalsCount ?? 0)} requests
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Real: {(resolvedWalletStats?.withdrawalsReal ?? 0).toFixed(2)} • Dummy: {(resolvedWalletStats?.withdrawalsDummy ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Wallet stats unavailable.</div>
        )}
      </div>

      {payments.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Payments</h3>
          <p className="text-gray-500">All registration payments have been processed</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transaction Hash
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.tp_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {payment.user?.tu_email || 'N/A'}
                          </div>
                          {payment.user?.tu_is_dummy ? (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-100">
                                Dummy
                              </span>
                            </div>
                          ) : null}
                          <div className="text-sm text-gray-500">User Payment</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{payment.subscription?.plan?.tsp_name || 'N/A'}</div>
                      <div className="text-sm text-gray-500 capitalize">{payment.subscription?.plan?.tsp_type || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <DollarSign className="h-4 w-4 text-green-600 mr-1" />
                        <span className="text-sm font-medium text-gray-900">{payment.tp_amount}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900 capitalize">
                        {payment.tp_payment_method.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-4 w-4 mr-1" />
                        {new Date(payment.tp_verified_at || payment.tp_created_at || Date.now()).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        {payment.tp_transaction_id ? (
                          <div className="text-sm text-gray-900 font-mono truncate max-w-xs">
                            {payment.tp_transaction_id}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not provided</span>
                        )}
                        {getGatewayIssue(payment) ? (
                          <div className="max-w-xs rounded border border-amber-200 bg-amber-50 px-2 py-1">
                            <p className="text-[11px] font-medium text-amber-800">Gateway response</p>
                            <p className="text-xs text-amber-700 break-words">{getGatewayIssue(payment)}</p>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleApprovePayment(payment.tp_id)}
                          disabled={processing === payment.tp_id || verifying === payment.tp_id}
                          className="flex items-center space-x-1 px-3 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                        >
                          {processing === payment.tp_id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-700"></div>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              <span>Approve</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleVerifyPayment(payment.tp_id)}
                          disabled={verifying === payment.tp_id || processing === payment.tp_id || !payment.tp_transaction_id}
                          className="flex items-center space-x-1 px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50"
                        >
                          {verifying === payment.tp_id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>
                              <span>Verifying...</span>
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4" />
                              <span>Verify</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleRejectPayment(payment.tp_id)}
                          disabled={processing === payment.tp_id || verifying === payment.tp_id}
                          className="flex items-center space-x-1 px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Stuck Payments Section ── */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden border-l-4 border-amber-400">
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Stuck Payments
                  {stuckPayments.length > 0 && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      {stuckPayments.length}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500">
                  Payments where USDT was deducted from the customer wallet but automatic verification failed.
                  Verify each transaction manually on BSCScan before approving.
                </p>
              </div>
            </div>
            <button
              onClick={loadPayments}
              className="flex items-center space-x-2 px-3 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading stuck payments...</div>
          ) : stuckPayments.length === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-800">No stuck payments</p>
              <p className="text-xs text-green-600 mt-1">All payments are processing normally.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stuckPayments.map((payment) => {
                const walletError = payment.tp_wallet_error_raw || getGatewayIssue(payment);
                const errorCode = payment.tp_wallet_error_code;
                const isAndroid = /android/i.test(payment.tp_device_info || '');
                const isMetaMask = /metamask/i.test(payment.tp_device_info || '');
                const stuckDate = payment.tp_stuck_at || payment.tp_created_at;
                const isMainnet = payment.tp_network === 'BSC Mainnet';
                const explorerBase = isMainnet ? 'https://bscscan.com' : 'https://testnet.bscscan.com';

                return (
                  <div key={payment.tp_id} className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                    {/* Header row */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white border border-amber-200">
                          <User className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{payment.user?.tu_email || 'Unknown'}</span>
                            {payment.user?.tu_is_dummy && (
                              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700 border border-orange-200">
                                Dummy
                              </span>
                            )}
                            {isAndroid && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                                <Smartphone className="h-3 w-3" />
                                Android
                              </span>
                            )}
                            {isMetaMask && (
                              <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600 border border-orange-100">
                                MetaMask
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Stuck: {stuckDate ? new Date(stuckDate).toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-bold text-gray-900">{payment.tp_amount} USDT</div>
                        <div className="text-xs text-gray-500">{payment.tp_network || 'BSC'}</div>
                      </div>
                    </div>

                    {/* Wallet error reason */}
                    {walletError && (
                      <div className="mb-3 rounded-lg border border-red-200 bg-white p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                            Wallet Error{errorCode ? ` (${errorCode})` : ''}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 leading-relaxed break-words">{walletError}</p>
                      </div>
                    )}

                    {/* Transaction ID */}
                    {payment.tp_transaction_id ? (
                      <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Transaction ID</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => navigator.clipboard?.writeText(payment.tp_transaction_id!)}
                              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
                            >
                              <Copy className="h-3 w-3" />
                              Copy
                            </button>
                            <a
                              href={`${explorerBase}/tx/${payment.tp_transaction_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                            >
                              <ExternalLink className="h-3 w-3" />
                              BSCScan
                            </a>
                          </div>
                        </div>
                        <code className="block break-all text-[11px] font-mono text-gray-800">{payment.tp_transaction_id}</code>
                      </div>
                    ) : (
                      <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-xs text-gray-500">No transaction ID recorded — customer may not have completed the wallet signing step.</p>
                      </div>
                    )}

                    {/* From / To wallets */}
                    {(payment.tp_wallet_address || payment.tp_to_address) && (
                      <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {payment.tp_wallet_address && (
                          <div className="rounded border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">From (Customer)</p>
                            <code className="text-[11px] font-mono text-gray-700 break-all">{payment.tp_wallet_address}</code>
                          </div>
                        )}
                        {payment.tp_to_address && (
                          <div className="rounded border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">To (Admin Wallet)</p>
                            <code className="text-[11px] font-mono text-gray-700 break-all">{payment.tp_to_address}</code>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Device info */}
                    {payment.tp_device_info && (
                      <details className="mb-3">
                        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">Device / Browser Info</summary>
                        <p className="mt-1 text-[11px] text-gray-500 break-words leading-relaxed pl-2">{payment.tp_device_info}</p>
                      </details>
                    )}

                    {/* Admin instruction */}
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                      <p className="text-xs font-semibold text-blue-800 mb-1">Admin Verification Steps:</p>
                      <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                        <li>Open BSCScan using the link above and confirm the transaction succeeded.</li>
                        <li>Verify the amount matches <strong>{payment.tp_amount} USDT</strong>.</li>
                        <li>Confirm the recipient is the admin wallet shown above.</li>
                        <li>Click <strong>Verify</strong> to auto-process, or <strong>Approve</strong> after manual check.</li>
                      </ol>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleApprovePayment(payment.tp_id)}
                        disabled={processing === payment.tp_id || verifying === payment.tp_id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {processing === payment.tp_id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        {processing === payment.tp_id ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleVerifyPayment(payment.tp_id)}
                        disabled={verifying === payment.tp_id || processing === payment.tp_id || !payment.tp_transaction_id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {verifying === payment.tp_id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        {verifying === payment.tp_id ? 'Verifying...' : 'Auto-Verify on Chain'}
                      </button>
                      <button
                        onClick={() => handleRejectPayment(payment.tp_id)}
                        disabled={processing === payment.tp_id || verifying === payment.tp_id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Admin Earnings</h3>
            <p className="text-sm text-gray-600">Track admin income and commissions paid to sub-admins</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={loadAdminEarnings}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            <button
              onClick={exportEarningsCsv}
              disabled={adminEarnings.length === 0}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-xs text-blue-700">Total Gross</p>
            <p className="text-lg font-semibold text-blue-900">{earningsTotals.gross.toFixed(2)} USDT</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-xs text-green-700">Admin Income</p>
            <p className="text-lg font-semibold text-green-900">{earningsTotals.adminIncome.toFixed(2)} USDT</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <p className="text-xs text-amber-700">Commission Paid</p>
            <p className="text-lg font-semibold text-amber-900">{earningsTotals.commission.toFixed(2)} USDT</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-600">Records</p>
            <p className="text-lg font-semibold text-gray-900">{adminEarnings.length}</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Sub Admin</label>
            <select
              value={earningsAdminFilter}
              onChange={(event) => setEarningsAdminFilter(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm"
            >
              <option value="all">All Admins</option>
              {admins.map((admin) => (
                <option key={admin.tau_id} value={admin.tau_id}>
                  {admin.tau_full_name || admin.tau_email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={earningsStartDate}
              onChange={(event) => setEarningsStartDate(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={earningsEndDate}
              onChange={(event) => setEarningsEndDate(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin Income
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Commission Paid
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Commission To
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Processed By
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {earningsLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading earnings...
                  </td>
                </tr>
              ) : adminEarnings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                    No earnings found for the selected filters.
                  </td>
                </tr>
              ) : (
                adminEarnings.map((earning) => {
                  const gateway = parseGatewayResponse(earning.tp_gateway_response);
                  const adminIncome = Number(gateway.admin_income ?? 0);
                  const commissionPaid = Number(gateway.parent_income ?? 0);
                  const commissionTo = gateway.parent_account || gateway.parent_user_id || 'N/A';
                  const displayDate = earning.tp_verified_at || earning.tp_created_at;
                  return (
                    <tr key={earning.tp_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {displayDate ? new Date(displayDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <span>{earning.user?.tu_email || 'N/A'}</span>
                          {earning.user?.tu_is_dummy ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-100">
                              Dummy
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {earning.tp_amount ?? 0} {earning.tp_currency ?? 'USDT'}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-700 font-medium">
                        ${adminIncome.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-amber-700 font-medium">
                        ${commissionPaid.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {commissionTo}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {getAdminLabel(earning)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default PendingPayments;
