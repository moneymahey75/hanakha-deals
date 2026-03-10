import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import { DollarSign, Users, CheckCircle, Clock, XCircle, ExternalLink, RefreshCw } from 'lucide-react';

interface PendingIncome {
  income_id: string;
  referrer_id: string;
  referrer_email: string;
  referrer_name: string;
  referred_user_id: string;
  referred_email: string;
  referred_name: string;
  amount: number;
  created_at: string;
}

const ReferralIncomeManagement: React.FC = () => {
  const notification = useNotification();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [pendingIncomes, setPendingIncomes] = useState<PendingIncome[]>([]);
  const [stats, setStats] = useState({
    totalPending: 0,
    totalAmount: 0,
    count: 0
  });

  useEffect(() => {
    loadPendingIncomes();
  }, []);

  const loadPendingIncomes = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc('get_pending_referral_incomes');

      if (error) throw error;

      const incomes = data || [];
      setPendingIncomes(incomes);

      const totalAmount = incomes.reduce((sum: number, income: PendingIncome) =>
        sum + parseFloat(income.amount.toString()), 0
      );

      setStats({
        totalPending: incomes.length,
        totalAmount,
        count: incomes.length
      });
    } catch (error) {
      console.error('Failed to load pending incomes:', error);
      notification.showError('Error', 'Failed to load pending referral incomes');
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async (incomeId: string, transactionHash: string) => {
    try {
      setProcessing(incomeId);

      const { data, error } = await supabase.rpc('mark_referral_income_paid', {
        p_income_id: incomeId,
        p_transaction_hash: transactionHash
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to mark as paid');
      }

      notification.showSuccess('Success', 'Referral income marked as paid');
      await loadPendingIncomes();
    } catch (error: any) {
      console.error('Failed to mark as paid:', error);
      notification.showError('Error', error.message || 'Failed to mark as paid');
    } finally {
      setProcessing(null);
    }
  };

  const handleMarkPaid = (incomeId: string) => {
    const txHash = prompt('Enter the transaction hash for this payment:');
    if (txHash && txHash.trim()) {
      markAsPaid(incomeId, txHash.trim());
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
          <DollarSign className="h-7 w-7 text-green-600" />
          <span>Referral Income Management</span>
        </h2>
        <button
          onClick={loadPendingIncomes}
          disabled={loading}
          className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center space-x-3 mb-2">
            <Clock className="h-6 w-6" />
            <span className="text-lg font-semibold">Pending Payments</span>
          </div>
          <div className="text-4xl font-bold">{stats.totalPending}</div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center space-x-3 mb-2">
            <DollarSign className="h-6 w-6" />
            <span className="text-lg font-semibold">Total Amount</span>
          </div>
          <div className="text-4xl font-bold">${stats.totalAmount.toFixed(2)}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
          <div className="flex items-center space-x-3 mb-2">
            <Users className="h-6 w-6" />
            <span className="text-lg font-semibold">Total Recipients</span>
          </div>
          <div className="text-4xl font-bold">{stats.count}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Pending Referral Incomes</h3>

        {pendingIncomes.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h4>
            <p className="text-gray-600">
              There are no pending referral income payments at the moment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Referrer</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Referred User</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Amount</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingIncomes.map((income) => (
                  <tr key={income.income_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium text-gray-900">{income.referrer_name}</div>
                        <div className="text-sm text-gray-600">{income.referrer_email}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <div className="font-medium text-gray-900">{income.referred_name}</div>
                        <div className="text-sm text-gray-600">{income.referred_email}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-green-600 text-lg">${income.amount}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {new Date(income.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleMarkPaid(income.income_id)}
                        disabled={processing === income.income_id}
                        className="inline-flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                      >
                        {processing === income.income_id ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            <span>Mark as Paid</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h4 className="font-semibold text-blue-900 mb-3 flex items-center space-x-2">
          <ExternalLink className="h-5 w-5" />
          <span>Payment Instructions</span>
        </h4>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Review the pending referral incomes above</li>
          <li>Send $2 USDT to each referrer's wallet address</li>
          <li>Copy the blockchain transaction hash after payment</li>
          <li>Click "Mark as Paid" and paste the transaction hash</li>
          <li>The payment status will be updated and the user will be notified</li>
        </ol>
      </div>
    </div>
  );
};

export default ReferralIncomeManagement;
