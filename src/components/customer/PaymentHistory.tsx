import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';
import {
    CreditCard,
    CheckCircle,
    XCircle,
    Clock,
    Download,
    RefreshCw,
    ExternalLink,
    Calendar,
    Zap,
    Star,
    FileText
} from 'lucide-react';

interface SubscriptionPlan {
    tsp_id: string;
    tsp_name: string;
    tsp_description: string;
    tsp_price: number;
    tsp_duration_days: number;
    tsp_features: string[];
}

interface Payment {
    tp_id: string;
    tp_amount: number;
    tp_currency: string;
    tp_payment_method: string;
    tp_payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
    tp_transaction_id: string | null;
    tp_error_message: string | null;
    tp_created_at: string;
    tp_gateway_response: any;
    subscription: {
        tus_id: string;
        tus_plan_id: string;
        tus_status: string;
        tus_start_date: string;
        tus_end_date: string;
        tus_payment_amount: number;
        plan: SubscriptionPlan;
    } | null;
}

interface PaymentHistoryProps {
    userId: string;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({ userId }) => {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const notification = useNotification();

    useEffect(() => {
        if (userId) {
            loadPaymentHistory();
        }
    }, [userId]);

    const loadPaymentHistory = async () => {
        if (!userId) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tbl_payments')
                .select(`
                  *,
                  subscription:tbl_user_subscriptions(
                    tus_id,
                    tus_plan_id,
                    tus_status,
                    tus_start_date,
                    tus_end_date,
                    tus_payment_amount,
                    plan:tbl_subscription_plans(*)
                  )
                `)
                .eq('tp_user_id', userId)
                .order('tp_created_at', { ascending: false })
                .limit(50);

            if (error) {
                throw error;
            }

            setPayments(data || []);
        } catch (error) {
            console.error('Failed to load payment history:', error);
            notification.showError('Error', 'Failed to load payment history.');
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-5 w-5 text-green-500" />;
            case 'failed':
                return <XCircle className="h-5 w-5 text-red-500" />;
            case 'pending':
                return <Clock className="h-5 w-5 text-yellow-500" />;
            default:
                return <Clock className="h-5 w-5 text-gray-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getSubscriptionStatusColor = (status: string) => {
        switch (status) {
            case 'active':
                return 'bg-green-100 text-green-800';
            case 'expired':
                return 'bg-red-100 text-red-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'cancelled':
                return 'bg-gray-100 text-gray-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateShort = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const viewOnExplorer = (transactionHash: string | null, blockchain: string) => {
        if (!transactionHash) return;

        const explorerUrl = blockchain === 'BSC Mainnet'
            ? `https://bscscan.com/tx/${transactionHash}`
            : `https://testnet.bscscan.com/tx/${transactionHash}`;

        window.open(explorerUrl, '_blank', 'noopener,noreferrer');
    };

    const viewPaymentDetails = (payment: Payment) => {
        setSelectedPayment(payment);
        setShowDetailsModal(true);
    };

    const getDaysRemaining = (endDate: string) => {
        const end = new Date(endDate);
        const now = new Date();
        const diffTime = end.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading payment history...</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
                <div className="flex space-x-2">
                    <button
                        onClick={loadPaymentHistory}
                        disabled={loading}
                        className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        <span>Refresh</span>
                    </button>
                    <button className="flex items-center space-x-2 px-3 py-2 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200">
                        <Download className="h-4 w-4" />
                        <span>Export</span>
                    </button>
                </div>
            </div>

            {payments.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No payments found</h4>
                    <p className="text-gray-500">Your payment history will appear here</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {payments.map((payment) => (
                        <div key={payment.tp_id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="bg-blue-100 p-2 rounded-lg">
                                        <CreditCard className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">
                                            {payment.subscription?.plan?.tsp_name || 'Unknown Plan'}
                                        </h4>
                                        <p className="text-sm text-gray-500">
                                            {formatDate(payment.tp_created_at)}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.tp_payment_status)}`}>
                    {getStatusIcon(payment.tp_payment_status)}
                      <span className="ml-1 capitalize">{payment.tp_payment_status}</span>
                  </span>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-gray-900">
                                            {payment.tp_amount} {payment.tp_currency}
                                        </p>
                                        <p className="text-sm text-gray-500 capitalize">
                                            {payment.tp_payment_method}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Subscription Status */}
                            {payment.subscription && (
                                <div className="mt-3 flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSubscriptionStatusColor(payment.subscription.tus_status)}`}>
                    <Zap className="h-3 w-3 mr-1" />
                    Subscription: {payment.subscription.tus_status}
                  </span>
                                    {payment.subscription.tus_status === 'active' && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      <Calendar className="h-3 w-3 mr-1" />
                                            {getDaysRemaining(payment.subscription.tus_end_date)} days left
                    </span>
                                    )}
                                </div>
                            )}

                            {(payment.tp_transaction_id || payment.tp_error_message) && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                    {payment.tp_transaction_id && (
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm font-medium text-gray-900">Transaction ID</p>
                                            <div className="flex items-center space-x-2">
                                                <code className="text-sm text-gray-500 font-mono">
                                                    {payment.tp_transaction_id.slice(0, 10)}...{payment.tp_transaction_id.slice(-8)}
                                                </code>
                                                <button
                                                    onClick={() => viewOnExplorer(
                                                        payment.tp_transaction_id,
                                                        payment.tp_gateway_response?.blockchain || 'BSC Testnet'
                                                    )}
                                                    className="p-1 text-gray-400 hover:text-gray-600"
                                                    title="View on blockchain explorer"
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {payment.tp_error_message && (
                                        <div className="mt-2">
                                            <p className="text-sm font-medium text-gray-900">Error Message</p>
                                            <p className="text-sm text-red-600">{payment.tp_error_message}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-3 flex justify-end">
                                <button
                                    onClick={() => viewPaymentDetails(payment)}
                                    className="flex items-center space-x-1 text-sm text-indigo-600 hover:text-indigo-700"
                                >
                                    <FileText className="h-4 w-4" />
                                    <span>View Details</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Payment Details Modal */}
            {showDetailsModal && selectedPayment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-semibold text-gray-900">Payment Details</h3>
                                <button
                                    onClick={() => setShowDetailsModal(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <XCircle className="h-6 w-6" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Payment Information */}
                                <div>
                                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                                        <CreditCard className="h-5 w-5 mr-2" />
                                        Payment Information
                                    </h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Amount:</span>
                                            <span className="font-medium">{selectedPayment.tp_amount} {selectedPayment.tp_currency}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Status:</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedPayment.tp_payment_status)}`}>
                        {getStatusIcon(selectedPayment.tp_payment_status)}
                                                <span className="ml-1 capitalize">{selectedPayment.tp_payment_status}</span>
                      </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Method:</span>
                                            <span className="capitalize">{selectedPayment.tp_payment_method}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Date:</span>
                                            <span>{formatDate(selectedPayment.tp_created_at)}</span>
                                        </div>
                                        {selectedPayment.tp_transaction_id && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Transaction ID:</span>
                                                <div className="flex items-center">
                                                    <code className="text-xs font-mono">
                                                        {selectedPayment.tp_transaction_id.slice(0, 8)}...{selectedPayment.tp_transaction_id.slice(-6)}
                                                    </code>
                                                    <button
                                                        onClick={() => viewOnExplorer(
                                                            selectedPayment.tp_transaction_id,
                                                            selectedPayment.tp_gateway_response?.blockchain || 'BSC Testnet'
                                                        )}
                                                        className="ml-1 text-gray-400 hover:text-gray-600"
                                                        title="View on blockchain explorer"
                                                    >
                                                        <ExternalLink className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Subscription Information */}
                                {selectedPayment.subscription && (
                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                                            <Star className="h-5 w-5 mr-2" />
                                            Subscription Plan
                                        </h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Plan:</span>
                                                <span className="font-medium">{selectedPayment.subscription.plan.tsp_name}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Price:</span>
                                                <span>{selectedPayment.subscription.plan.tsp_price} USDT</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Duration:</span>
                                                <span>{selectedPayment.subscription.plan.tsp_duration_days} days</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Status:</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSubscriptionStatusColor(selectedPayment.subscription.tus_status)}`}>
                          {selectedPayment.subscription.tus_status}
                        </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Start Date:</span>
                                                <span>{formatDateShort(selectedPayment.subscription.tus_start_date)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">End Date:</span>
                                                <span>{formatDateShort(selectedPayment.subscription.tus_end_date)}</span>
                                            </div>
                                            {selectedPayment.subscription.tus_status === 'active' && (
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Days Remaining:</span>
                                                    <span className="font-medium text-green-600">
                            {getDaysRemaining(selectedPayment.subscription.tus_end_date)} days
                          </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Plan Features */}
                            {selectedPayment.subscription?.plan?.tsp_features && (
                                <div className="mt-6">
                                    <h4 className="font-medium text-gray-900 mb-3">Plan Features</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {selectedPayment.subscription.plan.tsp_features.map((feature, index) => (
                                            <div key={index} className="flex items-center">
                                                <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                                                <span className="text-sm text-gray-600">{feature}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error Details */}
                            {selectedPayment.tp_error_message && (
                                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                                    <h4 className="font-medium text-red-900 mb-2">Error Details</h4>
                                    <p className="text-red-700">{selectedPayment.tp_error_message}</p>
                                    {selectedPayment.tp_gateway_response?.error_details && (
                                        <pre className="mt-2 text-xs text-red-600 overflow-auto">
                      {JSON.stringify(selectedPayment.tp_gateway_response.error_details, null, 2)}
                    </pre>
                                    )}
                                </div>
                            )}

                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => setShowDetailsModal(false)}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentHistory;