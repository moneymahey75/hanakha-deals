import React, { useState, useEffect } from 'react';
import { adminSupabase as supabase } from '../../lib/adminSupabase';
import { useNotification } from '../ui/NotificationProvider';
import {
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  Eye,
  RefreshCw
} from 'lucide-react';

interface Payment {
  tp_id: string;
  tp_user_id: string;
  tp_amount: number;
  tp_payment_method: string;
  tp_payment_status: string;
  tp_transaction_hash: string | null;
  tp_payment_date: string;
  user: {
    tu_email: string;
    tu_first_name: string;
    tu_last_name: string;
  };
  plan: {
    tsp_name: string;
    tsp_type: string;
  };
}

const PendingPayments: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const notification = useNotification();

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tbl_payments')
        .select(`
          *,
          user:tp_user_id(tu_email, tu_first_name, tu_last_name),
          plan:tp_subscription_plan_id(tsp_name, tsp_type)
        `)
        .eq('tp_payment_status', 'pending')
        .order('tp_payment_date', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePayment = async (paymentId: string) => {
    const adminSessionToken = sessionStorage.getItem('admin_session_token');
    if (!adminSessionToken) {
      notification.showError('Error', 'Admin session not found');
      return;
    }

    setProcessing(paymentId);
    try {
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-registration-payment`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'X-Admin-Session': adminSessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentId }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Payment processing failed');
      }

      notification.showSuccess(
        'Payment Approved',
        `Payment processed and $${result.commission_paid} commission credited to referrer`
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
      const { error } = await supabase
        .from('tbl_payments')
        .update({ tp_payment_status: 'rejected' })
        .eq('tp_id', paymentId);

      if (error) throw error;

      notification.showSuccess('Payment Rejected', 'Payment has been rejected');
      loadPayments();
    } catch (error: any) {
      notification.showError('Rejection Failed', error.message);
    } finally {
      setProcessing(null);
    }
  };

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
                            {payment.user.tu_first_name} {payment.user.tu_last_name}
                          </div>
                          <div className="text-sm text-gray-500">{payment.user.tu_email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{payment.plan.tsp_name}</div>
                      <div className="text-sm text-gray-500 capitalize">{payment.plan.tsp_type}</div>
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
                        {new Date(payment.tp_payment_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {payment.tp_transaction_hash ? (
                        <div className="text-sm text-gray-900 font-mono truncate max-w-xs">
                          {payment.tp_transaction_hash}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not provided</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleApprovePayment(payment.tp_id)}
                          disabled={processing === payment.tp_id}
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
                          onClick={() => handleRejectPayment(payment.tp_id)}
                          disabled={processing === payment.tp_id}
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
    </div>
  );
};

export default PendingPayments;
