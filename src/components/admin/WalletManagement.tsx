import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import {
  Wallet,
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  Eye,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  RefreshCw,
  CreditCard,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

interface WalletData {
  user_id: string;
  user_email: string;
  user_name: string;
  wallet_balance: number;
  total_earned: number;
  total_spent: number;
  transaction_count: number;
  last_transaction: string;
}

interface Transaction {
  twt_id: string;
  twt_user_id: string;
  twt_transaction_type: 'credit' | 'debit' | 'transfer';
  twt_amount: number;
  twt_description: string;
  twt_reference_type?: string;
  twt_status: string;
  twt_created_at: string;
  user_info?: {
    email: string;
    name: string;
  };
}

const WalletManagement: React.FC = () => {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'wallets' | 'transactions'>('wallets');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditDescription, setCreditDescription] = useState('');
  const notification = useNotification();

  useEffect(() => {
    if (activeTab === 'wallets') {
      loadWallets();
    } else {
      loadTransactions();
    }
  }, [activeTab]);

  const loadWallets = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading wallet data...');

      const { data, error } = await supabase
        .from('tbl_wallets')
        .select(`
          tw_user_id,
          tw_balance,
          tw_currency,
          tw_created_at,
          tbl_users!inner(tu_email),
          tbl_user_profiles(tup_first_name, tup_last_name)
        `)
        .eq('tw_currency', 'USDT')
        .order('tw_balance', { ascending: false });

      if (error) throw error;

      // Get transaction counts and totals for each user
      const walletsWithStats = await Promise.all(
        (data || []).map(async (wallet) => {
          const { data: txData } = await supabase
            .from('tbl_wallet_transactions')
            .select('twt_amount, twt_transaction_type, twt_created_at')
            .eq('twt_user_id', wallet.tw_user_id)
            .eq('twt_status', 'completed');

          const totalEarned = txData?.filter(tx => tx.twt_transaction_type === 'credit')
            .reduce((sum, tx) => sum + parseFloat(tx.twt_amount), 0) || 0;
          
          const totalSpent = txData?.filter(tx => tx.twt_transaction_type === 'debit')
            .reduce((sum, tx) => sum + parseFloat(tx.twt_amount), 0) || 0;

          const lastTransaction = txData?.[0]?.twt_created_at || wallet.tw_created_at;

          return {
            user_id: wallet.tw_user_id,
            user_email: wallet.tbl_users.tu_email,
            user_name: wallet.tbl_user_profiles ? 
              `${wallet.tbl_user_profiles.tup_first_name} ${wallet.tbl_user_profiles.tup_last_name}` : 
              'Unknown User',
            wallet_balance: parseFloat(wallet.tw_balance),
            total_earned: totalEarned,
            total_spent: totalSpent,
            transaction_count: txData?.length || 0,
            last_transaction: lastTransaction
          };
        })
      );

      setWallets(walletsWithStats);
      console.log('✅ Wallets loaded:', walletsWithStats.length);
    } catch (error) {
      console.error('Failed to load wallets:', error);
      notification.showError('Load Failed', 'Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading transactions...');

      const { data, error } = await supabase
        .from('tbl_wallet_transactions')
        .select(`
          *,
          tbl_users!inner(tu_email),
          tbl_user_profiles(tup_first_name, tup_last_name)
        `)
        .order('twt_created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedTransactions = (data || []).map(tx => ({
        ...tx,
        user_info: {
          email: tx.tbl_users.tu_email,
          name: tx.tbl_user_profiles ? 
            `${tx.tbl_user_profiles.tup_first_name} ${tx.tbl_user_profiles.tup_last_name}` : 
            'Unknown User'
        }
      }));

      setTransactions(formattedTransactions);
      console.log('✅ Transactions loaded:', formattedTransactions.length);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      notification.showError('Load Failed', 'Failed to load transaction data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreditWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || creditAmount <= 0) return;

    try {
      const { data, error } = await supabase.rpc('update_wallet_balance', {
        p_user_id: selectedUserId,
        p_amount: creditAmount,
        p_transaction_type: 'credit',
        p_description: creditDescription || 'Admin credit',
        p_reference_type: 'admin_credit'
      });

      if (error) throw error;

      notification.showSuccess('Wallet Credited', `Successfully credited ${creditAmount} USDT`);
      setShowCreditModal(false);
      setSelectedUserId('');
      setCreditAmount(0);
      setCreditDescription('');
      loadWallets();
    } catch (error: any) {
      console.error('Failed to credit wallet:', error);
      notification.showError('Credit Failed', error.message || 'Failed to credit wallet');
    }
  };

  const filteredWallets = wallets.filter(wallet =>
    wallet.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wallet.user_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTransactions = transactions.filter(tx =>
    tx.user_info?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.user_info?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.twt_description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getWalletStats = () => {
    const totalBalance = wallets.reduce((sum, w) => sum + w.wallet_balance, 0);
    const totalEarned = wallets.reduce((sum, w) => sum + w.total_earned, 0);
    const totalSpent = wallets.reduce((sum, w) => sum + w.total_spent, 0);
    const activeWallets = wallets.filter(w => w.wallet_balance > 0).length;

    return { totalBalance, totalEarned, totalSpent, activeWallets };
  };

  const stats = getWalletStats();

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <Wallet className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Wallet Management</h3>
              <p className="text-gray-600">Monitor and manage user wallets and transactions</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowCreditModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Credit Wallet</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.totalBalance.toFixed(2)}</div>
            <div className="text-sm text-gray-600">Total Balance (USDT)</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalEarned.toFixed(2)}</div>
            <div className="text-sm text-gray-600">Total Earned</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.totalSpent.toFixed(2)}</div>
            <div className="text-sm text-gray-600">Total Spent</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.activeWallets}</div>
            <div className="text-sm text-gray-600">Active Wallets</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {[
              { id: 'wallets', label: 'User Wallets', icon: Wallet },
              { id: 'transactions', label: 'All Transactions', icon: DollarSign }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Search */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder={activeTab === 'wallets' ? 'Search users...' : 'Search transactions...'}
            />
          </div>
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'wallets' && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Earned
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Spent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transactions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWallets.map((wallet) => (
                  <tr key={wallet.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center">
                            <span className="text-white font-medium text-sm">
                              {wallet.user_name.charAt(0)}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {wallet.user_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {wallet.user_email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-lg font-bold text-green-600">
                        {wallet.wallet_balance.toFixed(2)} USDT
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {wallet.total_earned.toFixed(2)} USDT
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {wallet.total_spent.toFixed(2)} USDT
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {wallet.transaction_count}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(wallet.last_transaction).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUserId(wallet.user_id);
                            setShowCreditModal(true);
                          }}
                          className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                          title="Credit Wallet"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                          title="View Transactions"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-4">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.twt_id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-full ${
                      transaction.twt_transaction_type === 'credit' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {transaction.twt_transaction_type === 'credit' ? (
                        <ArrowUpRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <ArrowDownLeft className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <h5 className="font-medium text-gray-900">{transaction.twt_description}</h5>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="text-sm text-gray-500">
                          {transaction.user_info?.name} ({transaction.user_info?.email})
                        </span>
                        <span className="text-sm text-gray-500">
                          {new Date(transaction.twt_created_at).toLocaleDateString()}
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credit Wallet Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Credit User Wallet</h3>
              <button
                onClick={() => {
                  setShowCreditModal(false);
                  setSelectedUserId('');
                  setCreditAmount(0);
                  setCreditDescription('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleCreditWallet} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select User *
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select a user</option>
                  {wallets.map(wallet => (
                    <option key={wallet.user_id} value={wallet.user_id}>
                      {wallet.user_name} ({wallet.user_email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (USDT) *
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description *
                </label>
                <input
                  type="text"
                  required
                  value={creditDescription}
                  onChange={(e) => setCreditDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Reason for credit"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreditModal(false);
                    setSelectedUserId('');
                    setCreditAmount(0);
                    setCreditDescription('');
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Credit Wallet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletManagement;