import React, { useEffect, useState } from 'react';
import { Eye, RefreshCw, X } from 'lucide-react';
import { adminApi } from '../../lib/adminApi';
import { useNotification } from '../ui/NotificationProvider';
import { useScrollToTopOnChange } from '../../hooks/useScrollToTopOnChange';

let inFlightWithdrawalsRequest: {
  key: string;
  promise: Promise<{ rows: WithdrawalRequest[]; count: number }>;
} | null = null;

interface WithdrawalRequest {
  twr_id: string;
  twr_user_id: string;
  twr_wallet_connection_id?: string | null;
  twr_destination_address: string;
  twr_amount: number;
  twr_commission_percent: number;
  twr_commission_amount: number;
  twr_net_amount: number;
  twr_status: string;
  twr_auto_transfer: boolean;
  twr_requested_at?: string | null;
  twr_processed_at?: string | null;
  twr_blockchain_tx?: string | null;
  twr_failure_reason?: string | null;
  twr_admin_debug?: string | null;
  user?: {
    tu_email: string;
    tu_is_dummy?: boolean;
    tbl_user_profiles?: {
      tup_first_name?: string | null;
      tup_last_name?: string | null;
      tup_sponsorship_number?: string | null;
    } | null;
  };
}

const WithdrawalRequests: React.FC = () => {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalProcessing, setWithdrawalProcessing] = useState<string | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [rejectingWithdrawal, setRejectingWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [failingWithdrawal, setFailingWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [rejectionSubmitting, setRejectionSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'rejected' | 'failed'>('all');
  const [accountScope, setAccountScope] = useState<'real' | 'dummy' | 'all'>('real');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [searchText, setSearchText] = useState('');
  const pageSize = 10;
  const notification = useNotification();
  const topRef = useScrollToTopOnChange([currentPage], { smooth: true });

  const getOneLine = (value?: string | null, max = 120) => {
    const line = String(value || '').replace(/\s+/g, ' ').trim();
    if (!line) return '';
    return line.length > max ? `${line.slice(0, max - 3)}...` : line;
  };

  const getAdminSessionToken = () => {
    const directToken = sessionStorage.getItem('admin_session_token');
    if (directToken) return directToken;
    const sessionData = sessionStorage.getItem('admin_session_data');
    if (!sessionData) return null;
    try {
      const parsed = JSON.parse(sessionData);
      const fallback = parsed.sessionToken || parsed.tau_session_token || null;
      if (fallback) {
        sessionStorage.setItem('admin_session_token', fallback);
      }
      return fallback;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    loadWithdrawals();
  }, [currentPage]);

  useEffect(() => {
    // If we're already on page 1, changing filters won't trigger the `currentPage` effect.
    // So fetch directly; otherwise, reset to page 1 (which will fetch via the `currentPage` effect).
    if (currentPage === 1) {
      loadWithdrawals();
      return;
    }
    setCurrentPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, accountScope, dateFrom, dateTo, minAmount, maxAmount, searchText]);

  const loadWithdrawals = async () => {
    setWithdrawalsLoading(true);
    try {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const requestPayload = {
        statusFilter,
        accountScope,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        searchText,
        from,
        to
      };
      const requestKey = JSON.stringify(requestPayload);
      const requestPromise =
        inFlightWithdrawalsRequest?.key === requestKey
          ? inFlightWithdrawalsRequest.promise
          : adminApi.post<{ rows: WithdrawalRequest[]; count: number }>('admin-get-withdrawals', requestPayload);

      if (inFlightWithdrawalsRequest?.key !== requestKey) {
        inFlightWithdrawalsRequest = {
          key: requestKey,
          promise: requestPromise
        };
      }

      const result = await requestPromise;

      setWithdrawals(result?.rows || []);
      setTotalCount(result?.count || 0);
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const requestKey = JSON.stringify({
        statusFilter,
        accountScope,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        searchText,
        from,
        to
      });
      if (inFlightWithdrawalsRequest?.key === requestKey) {
        inFlightWithdrawalsRequest = null;
      }
      setWithdrawalsLoading(false);
    }
  };

  const handleApproveWithdrawal = async (withdrawalId: string) => {
    const adminSessionToken = getAdminSessionToken();
    console.log('adminSessionToken', adminSessionToken);
    if (!adminSessionToken) {
      notification.showError('Error', 'Admin session not found');
      return;
    }

    setWithdrawalProcessing(withdrawalId);
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-withdrawal`;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'X-Admin-Session': adminSessionToken,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey
        },
        body: JSON.stringify({ withdrawalId }),
      });

      const result = await response.json();

      if (result.status === 'processing' && result.txHash) {
        notification.showError(
          'Confirmation Pending',
          `Transfer was submitted but not confirmed yet. Verify tx before retry/fail: ${result.txHash}`
        );
        loadWithdrawals();
        return;
      }

      if (!result.success) {
        throw new Error(result.error || 'Withdrawal processing failed');
      }

      notification.showSuccess('Withdrawal Approved', 'Withdrawal transfer completed successfully.');
      loadWithdrawals();
    } catch (error: any) {
      notification.showError('Approval Failed', error.message);
    } finally {
      setWithdrawalProcessing(null);
    }
  };

  const handleRejectWithdrawal = async (withdrawalId: string, note: string): Promise<boolean> => {
    setWithdrawalProcessing(withdrawalId);
    try {
      await adminApi.post('admin-reject-withdrawal', {
        withdrawalId,
        note
      });

      notification.showSuccess('Withdrawal Rejected', 'Withdrawal request has been rejected');
      loadWithdrawals();
      return true;
    } catch (error: any) {
      notification.showError('Rejection Failed', error.message);
      return false;
    } finally {
      setWithdrawalProcessing(null);
    }
  };

  const handleFailWithdrawal = async (withdrawalId: string, note: string): Promise<boolean> => {
    setWithdrawalProcessing(withdrawalId);
    try {
      await adminApi.post('admin-fail-withdrawal', {
        withdrawalId,
        note
      });

      notification.showSuccess('Marked Failed', 'Withdrawal request has been marked as failed');
      loadWithdrawals();
      return true;
    } catch (error: any) {
      notification.showError('Update Failed', error.message);
      return false;
    } finally {
      setWithdrawalProcessing(null);
    }
  };

  const sendRejectionEmail = async (email: string, note: string, amount: number) => {
    if (!email) return;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const subject = 'Withdrawal Request Rejected';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Withdrawal Request Rejected</h2>
        <p>Your withdrawal request for <strong>${amount} USDT</strong> was rejected.</p>
        <p><strong>Reason:</strong> ${note}</p>
        <p>If you have questions, please contact support.</p>
      </div>
    `;

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey
      },
      body: JSON.stringify({ to: [email], subject, html })
    });

    const result = await response.json();
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to send rejection email');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div ref={topRef} />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Withdrawal Requests</h2>
          <p className="text-sm text-gray-600">Approve or reject customer withdrawal requests</p>
        </div>
        <button
          onClick={() => loadWithdrawals()}
          className="flex items-center space-x-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as any)}
              className="px-3 py-2 rounded border border-gray-200 text-sm bg-white"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Accounts</label>
            <select
              value={accountScope}
              onChange={(event) => setAccountScope(event.target.value as 'real' | 'dummy' | 'all')}
              className="px-3 py-2 rounded border border-gray-200 text-sm bg-white"
              title="Filter dummy/fake customer accounts"
            >
              <option value="real">Real Only</option>
              <option value="dummy">Dummy Only</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Min Amount</label>
            <input
              type="number"
              value={minAmount}
              onChange={(event) => setMinAmount(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm bg-white"
              placeholder="0"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Max Amount</label>
            <input
              type="number"
              value={maxAmount}
              onChange={(event) => setMaxAmount(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm bg-white"
              placeholder="0"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Search</label>
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="px-3 py-2 rounded border border-gray-200 text-sm bg-white"
              placeholder="Request ID or wallet"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Net
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Wallet
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Requested
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {withdrawalsLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                  Loading withdrawals...
                </td>
              </tr>
            ) : withdrawals.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                  No withdrawal requests found.
                </td>
              </tr>
            ) : (
              withdrawals.map((withdrawal) => (
                (() => {
                  const profile = withdrawal.user?.tbl_user_profiles;
                  const fullName = [profile?.tup_first_name, profile?.tup_last_name]
                    .filter(Boolean)
                    .join(' ')
                    .trim();
                  const sponsorId = profile?.tup_sponsorship_number || 'N/A';
                  const address = withdrawal.twr_destination_address || '';
                  const shortAddress = address.length > 12
                    ? `${address.slice(0, 6)}...${address.slice(-4)}`
                    : address || 'N/A';

                  return (
                <tr key={withdrawal.twr_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div className="text-sm font-medium text-gray-900">
                      {fullName || 'Unknown Customer'}
                    </div>
                    {withdrawal.user?.tu_is_dummy ? (
                      <div className="mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-50 text-orange-700 border border-orange-100">
                          Dummy
                        </span>
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-500">Sponsor ID: {sponsorId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {Number(withdrawal.twr_amount).toFixed(2)} USDT
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {Number(withdrawal.twr_net_amount).toFixed(2)} USDT
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 font-mono truncate max-w-xs">
                    <span title={address}>{shortAddress}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="space-y-1">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        withdrawal.twr_status === 'completed' ? 'bg-green-100 text-green-800' :
                          withdrawal.twr_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            withdrawal.twr_status === 'processing' ? 'bg-blue-100 text-blue-800' :
                              withdrawal.twr_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                      }`}>
                        {withdrawal.twr_status}
                      </span>
                      {withdrawal.twr_admin_debug && (
                        <div className="text-[11px] text-gray-500" title={withdrawal.twr_admin_debug}>
                          {getOneLine(withdrawal.twr_admin_debug, 120)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {withdrawal.twr_requested_at ? new Date(withdrawal.twr_requested_at).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedWithdrawal(withdrawal)}
                        className="p-2 bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleApproveWithdrawal(withdrawal.twr_id)}
                        disabled={
                          withdrawalProcessing === withdrawal.twr_id ||
                          !(
                            ['pending', 'failed'].includes(withdrawal.twr_status) ||
                            (withdrawal.twr_status === 'processing' && Boolean(withdrawal.twr_blockchain_tx))
                          )
                        }
                        className="px-3 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                      >
                        {withdrawalProcessing === withdrawal.twr_id
                          ? 'Processing...'
                          : withdrawal.twr_status === 'processing' && withdrawal.twr_blockchain_tx
                            ? 'Verify'
                          : withdrawal.twr_status === 'failed'
                            ? 'Retry'
                            : 'Approve'}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingWithdrawal(withdrawal);
                          setRejectionNote('');
                        }}
                        disabled={withdrawalProcessing === withdrawal.twr_id || Boolean(withdrawal.twr_blockchain_tx) || !['pending', 'failed', 'processing'].includes(withdrawal.twr_status)}
                        className="px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => {
                          setFailingWithdrawal(withdrawal);
                          setRejectionNote('');
                        }}
                        disabled={withdrawalProcessing === withdrawal.twr_id || Boolean(withdrawal.twr_blockchain_tx) || withdrawal.twr_status !== 'processing'}
                        className="px-3 py-1 bg-amber-50 text-amber-700 rounded hover:bg-amber-100 disabled:opacity-50"
                        title={withdrawal.twr_blockchain_tx ? 'A blockchain tx exists. Verify it before retrying or failing.' : 'If a withdrawal is stuck in processing, mark it failed to allow Retry.'}
                      >
                        Mark Failed
                      </button>
                    </div>
                  </td>
                </tr>
                  );
                })()
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-gray-500">
          Showing {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{totalCount === 0 ? 0 : Math.min(currentPage * pageSize, totalCount)} of {totalCount}
        </p>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {Math.max(1, Math.ceil(totalCount / pageSize))}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(Math.max(1, Math.ceil(totalCount / pageSize)), prev + 1))}
            disabled={currentPage >= Math.max(1, Math.ceil(totalCount / pageSize))}
            className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {selectedWithdrawal && (() => {
        const profile = selectedWithdrawal.user?.tbl_user_profiles;
        const fullName = [profile?.tup_first_name, profile?.tup_last_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        const sponsorId = profile?.tup_sponsorship_number || 'N/A';
        const requestedAt = selectedWithdrawal.twr_requested_at
          ? new Date(selectedWithdrawal.twr_requested_at).toLocaleString()
          : 'N/A';
        const processedAt = selectedWithdrawal.twr_processed_at
          ? new Date(selectedWithdrawal.twr_processed_at).toLocaleString()
          : 'N/A';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-xl bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Withdrawal Details</h3>
                  <p className="text-xs text-gray-500">Request ID: {selectedWithdrawal.twr_id}</p>
                </div>
                <button
                  onClick={() => setSelectedWithdrawal(null)}
                  className="p-2 text-gray-500 hover:text-gray-700"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Customer</p>
                    <p className="text-sm font-medium text-gray-900">{fullName || 'Unknown Customer'}</p>
                    <p className="text-xs text-gray-500 mt-1">Sponsor ID: {sponsorId}</p>
                    <p className="text-xs text-gray-500 mt-1">Email: {selectedWithdrawal.user?.tu_email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">{selectedWithdrawal.twr_status}</p>
                    <p className="text-xs text-gray-500 mt-1">Auto Transfer: {selectedWithdrawal.twr_auto_transfer ? 'Yes' : 'No'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="text-sm font-medium text-gray-900">{Number(selectedWithdrawal.twr_amount).toFixed(2)} USDT</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Commission</p>
                    <p className="text-sm font-medium text-gray-900">
                      {Number(selectedWithdrawal.twr_commission_amount).toFixed(2)} ({Number(selectedWithdrawal.twr_commission_percent).toFixed(2)}%)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Net Amount</p>
                    <p className="text-sm font-medium text-gray-900">{Number(selectedWithdrawal.twr_net_amount).toFixed(2)} USDT</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Wallet Address</p>
                  <p className="text-sm font-mono text-gray-900 break-all">{selectedWithdrawal.twr_destination_address || 'N/A'}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Requested At</p>
                    <p className="text-sm text-gray-900">{requestedAt}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Processed At</p>
                    <p className="text-sm text-gray-900">{processedAt}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Blockchain Tx</p>
                    <p className="text-sm text-gray-900 break-all">{selectedWithdrawal.twr_blockchain_tx || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Failure Reason</p>
                    <p className="text-sm text-gray-900">{selectedWithdrawal.twr_failure_reason || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Admin Debug (raw)</p>
                  <pre className="mt-1 max-h-56 overflow-auto rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-800 whitespace-pre-wrap break-words">
                    {selectedWithdrawal.twr_admin_debug || 'N/A'}
                  </pre>
                </div>
              </div>

              <div className="border-t border-gray-200 px-5 py-4 flex justify-end">
                <button
                  onClick={() => setSelectedWithdrawal(null)}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {rejectingWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Reject Withdrawal</h3>
                <p className="text-xs text-gray-500">Add a short note for the customer</p>
              </div>
              <button
                onClick={() => setRejectingWithdrawal(null)}
                className="p-2 text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Rejection Note</label>
              <textarea
                value={rejectionNote}
                onChange={(event) => setRejectionNote(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Explain why this withdrawal was rejected..."
              />
              <p className="mt-2 text-xs text-gray-500">This note will be emailed to the customer.</p>
            </div>

            <div className="border-t border-gray-200 px-5 py-4 flex justify-end space-x-2">
              <button
                onClick={() => setRejectingWithdrawal(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const note = rejectionNote.trim();
                  if (!note || !rejectingWithdrawal) {
                    notification.showError('Missing Note', 'Please add a rejection note.');
                    return;
                  }
                  setRejectionSubmitting(true);
                  try {
                    const rejected = await handleRejectWithdrawal(rejectingWithdrawal.twr_id, note);
                    if (rejected) {
                      try {
                        await sendRejectionEmail(
                          rejectingWithdrawal.user?.tu_email || '',
                          note,
                          Number(rejectingWithdrawal.twr_amount)
                        );
                      } catch (emailError: any) {
                        notification.showError('Email Failed', emailError.message || 'Failed to send rejection email');
                      }
                      setRejectingWithdrawal(null);
                    }
                  } finally {
                    setRejectionSubmitting(false);
                  }
                }}
                disabled={rejectionSubmitting}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {rejectionSubmitting ? 'Rejecting...' : 'Reject Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {failingWithdrawal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Mark Withdrawal Failed</h3>
                <p className="text-xs text-gray-500">Use this when a request is stuck in processing</p>
              </div>
              <button
                onClick={() => setFailingWithdrawal(null)}
                className="p-2 text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Failure Note</label>
              <textarea
                value={rejectionNote}
                onChange={(event) => setRejectionNote(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Explain why this was marked failed (e.g. stuck processing / RPC timeout)..."
              />
              <p className="mt-2 text-xs text-gray-500">This will also revert any pending debit (if present) so the user can withdraw again.</p>
            </div>

            <div className="border-t border-gray-200 px-5 py-4 flex justify-end space-x-2">
              <button
                onClick={() => setFailingWithdrawal(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const note = rejectionNote.trim();
                  if (!note || !failingWithdrawal) {
                    notification.showError('Missing Note', 'Please add a failure note.');
                    return;
                  }
                  setRejectionSubmitting(true);
                  try {
                    const ok = await handleFailWithdrawal(failingWithdrawal.twr_id, note);
                    if (ok) {
                      setFailingWithdrawal(null);
                    }
                  } finally {
                    setRejectionSubmitting(false);
                  }
                }}
                disabled={rejectionSubmitting}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {rejectionSubmitting ? 'Updating...' : 'Mark Failed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalRequests;
