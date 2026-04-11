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
  Download
} from 'lucide-react';

let inFlightPendingPaymentsRequest: Promise<Payment[]> | null = null;
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
  tp_created_at?: string;
  tp_verified_at?: string;
  user?: {
    tu_email: string;
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
  };
}

const PendingPayments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [adminEarnings, setAdminEarnings] = useState<AdminEarning[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [earningsAdminFilter, setEarningsAdminFilter] = useState('all');
  const [earningsStartDate, setEarningsStartDate] = useState('');
  const [earningsEndDate, setEarningsEndDate] = useState('');
  const notification = useNotification();

  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    loadAdmins();
  }, []);

  useEffect(() => {
    loadAdminEarnings();
  }, [earningsAdminFilter, earningsStartDate, earningsEndDate]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const requestPromise = inFlightPendingPaymentsRequest ?? adminApi.post<Payment[]>('admin-get-pending-payments');
      inFlightPendingPaymentsRequest = requestPromise;
      const data = await requestPromise;
      setPayments(data || []);
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      inFlightPendingPaymentsRequest = null;
      setLoading(false);
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
        endDate: earningsEndDate || null
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
        endDate: earningsEndDate || null
      });
      if (inFlightAdminEarningsRequest?.key === requestKey) {
        inFlightAdminEarningsRequest = null;
      }
      setEarningsLoading(false);
    }
  };

  const handleApprovePayment = async (paymentId: string) => {
    setProcessing(paymentId);
    try {
      const result = await adminApi.post<any>('process-registration-payment', { paymentId });
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
        <button
          onClick={loadPayments}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
        >
          <RefreshCw className="h-5 w-5" />
          <span>Refresh</span>
        </button>
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
                      {payment.tp_transaction_id ? (
                        <div className="text-sm text-gray-900 font-mono truncate max-w-xs">
                          {payment.tp_transaction_id}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not provided</span>
                      )}
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

      <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
                        {earning.user?.tu_email || 'N/A'}
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
