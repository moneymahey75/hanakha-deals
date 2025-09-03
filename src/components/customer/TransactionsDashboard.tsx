import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';
import {
    DollarSign,
    ArrowUpRight,
    ArrowDownLeft,
    ExternalLink,
    RefreshCw,
    Gift,
    Share2,
    Calendar,
    Clock
} from 'lucide-react';

interface Transaction {
    twt_id: string;
    twt_transaction_type: 'credit' | 'debit' | 'transfer';
    twt_amount: number;
    twt_currency: string;
    twt_description: string;
    twt_reference_type?: string;
    twt_reference_id?: string;
    twt_blockchain_hash?: string;
    twt_status: 'pending' | 'completed' | 'failed' | 'cancelled';
    twt_created_at: string;
}

const TransactionsDashboard: React.FC = () => {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const notification = useNotification();

    useEffect(() => {
        if (user?.id) {
            loadTransactions();
        }
    }, [user?.id]);

    const loadTransactions = async () => {
        if (!user?.id) return;

        try {
            const { data, error } = await supabase
                .from('tbl_wallet_transactions')
                .select('*')
                .eq('twt_user_id', user.id)
                .order('twt_created_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            setTransactions(data || []);
        } catch (error) {
            console.error('Failed to load transactions:', error);
            notification.showError('Error', 'Failed to load transactions');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadTransactions();
    };

    const getTransactionIcon = (type: string, referenceType?: string) => {
        if (referenceType === 'task_reward' || referenceType === 'coupon_share') return Gift;
        if (referenceType === 'social_share') return Share2;
        return type === 'credit' ? ArrowUpRight : ArrowDownLeft;
    };

    // Group transactions by date
    const groupTransactionsByDate = () => {
        const grouped: { [key: string]: Transaction[] } = {};

        transactions.forEach(transaction => {
            const date = new Date(transaction.twt_created_at).toLocaleDateString();
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(transaction);
        });

        return grouped;
    };

    const groupedTransactions = groupTransactionsByDate();

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="animate-pulse">
                        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                        <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="bg-indigo-100 text-indigo-700 p-2 rounded-lg hover:bg-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Today's Transactions Summary */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Today's Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg">
                        <div className="flex items-center space-x-2">
                            <ArrowUpRight className="h-5 w-5 text-green-600" />
                            <span className="text-sm font-medium text-green-800">Total Credits</span>
                        </div>
                        <p className="text-2xl font-bold text-green-600 mt-2">
                            {transactions
                                .filter(t => t.twt_transaction_type === 'credit' &&
                                    new Date(t.twt_created_at).toDateString() === new Date().toDateString())
                                .reduce((sum, t) => sum + t.twt_amount, 0)
                                .toFixed(2)} USDT
                        </p>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="flex items-center space-x-2">
                            <Clock className="h-5 w-5 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800">Today's Count</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-600 mt-2">
                            {transactions.filter(t =>
                                new Date(t.twt_created_at).toDateString() === new Date().toDateString()
                            ).length}
                        </p>
                    </div>

                    <div className="bg-red-50 p-4 rounded-lg">
                        <div className="flex items-center space-x-2">
                            <ArrowDownLeft className="h-5 w-5 text-red-600" />
                            <span className="text-sm font-medium text-red-800">Total Debits</span>
                        </div>
                        <p className="text-2xl font-bold text-red-600 mt-2">
                            {transactions
                                .filter(t => t.twt_transaction_type === 'debit' &&
                                    new Date(t.twt_created_at).toDateString() === new Date().toDateString())
                                .reduce((sum, t) => sum + t.twt_amount, 0)
                                .toFixed(2)} USDT
                        </p>
                    </div>
                </div>
            </div>

            {/* Recent Transactions Overview */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h4>
                <div className="space-y-3">
                    {transactions.slice(0, 5).map((transaction) => {
                        const Icon = getTransactionIcon(transaction.twt_transaction_type, transaction.twt_reference_type);
                        return (
                            <div key={transaction.twt_id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                                <div className={`p-2 rounded-full ${
                                    transaction.twt_transaction_type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                                }`}>
                                    <Icon className={`h-4 w-4 ${
                                        transaction.twt_transaction_type === 'credit' ? 'text-green-600' : 'text-red-600'
                                    }`} />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{transaction.twt_description}</p>
                                    <p className="text-xs text-gray-500">
                                        {new Date(transaction.twt_created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className={`text-sm font-medium ${
                                    transaction.twt_transaction_type === 'credit' ? 'text-green-600' : 'text-red-600'
                                }`}>
                                    {transaction.twt_transaction_type === 'credit' ? '+' : '-'}{transaction.twt_amount} USDT
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Full Transaction History */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">All Transactions</h4>

                {Object.entries(groupedTransactions).length > 0 ? (
                    <div className="space-y-6">
                        {Object.entries(groupedTransactions).map(([date, dateTransactions]) => (
                            <div key={date}>
                                <div className="flex items-center space-x-2 mb-4">
                                    <Calendar className="h-4 w-4 text-gray-400" />
                                    <h5 className="font-medium text-gray-700">{date}</h5>
                                </div>

                                <div className="space-y-3">
                                    {dateTransactions.map((transaction) => {
                                        const Icon = getTransactionIcon(transaction.twt_transaction_type, transaction.twt_reference_type);
                                        return (
                                            <div key={transaction.twt_id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-4">
                                                        <div className={`p-3 rounded-full ${
                                                            transaction.twt_transaction_type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                                                        }`}>
                                                            <Icon className={`h-5 w-5 ${
                                                                transaction.twt_transaction_type === 'credit' ? 'text-green-600' : 'text-red-600'
                                                            }`} />
                                                        </div>
                                                        <div>
                                                            <h5 className="font-medium text-gray-900">{transaction.twt_description}</h5>
                                                            <div className="flex items-center space-x-4 mt-1">
                                <span className="text-sm text-gray-500">
                                  {new Date(transaction.twt_created_at).toLocaleTimeString()}
                                </span>
                                                                {transaction.twt_reference_type && (
                                                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                    {transaction.twt_reference_type.replace('_', ' ')}
                                  </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`text-lg font-bold ${
                                                            transaction.twt_transaction_type === 'credit' ? 'text-green-600' : 'text-red-600'
                                                        }`}>
                                                            {transaction.twt_transaction_type === 'credit' ? '+' : '-'}{transaction.twt_amount} USDT
                                                        </div>
                                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                                            transaction.twt_status === 'completed' ? 'bg-green-100 text-green-800' :
                                                                transaction.twt_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-red-100 text-red-800'
                                                        }`}>
                              {transaction.twt_status}
                            </span>
                                                    </div>
                                                </div>
                                                {transaction.twt_blockchain_hash && (
                                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="text-xs text-gray-500">Blockchain Hash:</span>
                                                            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                                                                {transaction.twt_blockchain_hash.slice(0, 10)}...{transaction.twt_blockchain_hash.slice(-8)}
                                                            </code>
                                                            <button
                                                                onClick={() => window.open(`https://testnet.bscscan.com/tx/${transaction.twt_blockchain_hash}`, '_blank')}
                                                                className="text-blue-600 hover:text-blue-800"
                                                            >
                                                                <ExternalLink className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h3>
                        <p className="text-gray-600">Complete daily tasks to start earning USDT rewards!</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransactionsDashboard;