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
  CheckCircle,
  X,
  ChevronDown,
  Building,
  User,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal
} from 'lucide-react';

interface WalletData {
  user_id: string;
  user_email: string;
  user_name: string;
  user_type: 'customer' | 'company' | 'admin';
  wallet_balance: number;
  total_earned: number;
  total_spent: number;
  transaction_count: number;
  last_transaction: string;
  company_name?: string;
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
    type: 'customer' | 'company' | 'admin';
    company_name?: string;
  };
}

interface User {
  tu_id: string;
  tu_email: string;
  tu_user_type: 'customer' | 'company' | 'admin';
  tup_first_name?: string;
  tup_last_name?: string;
  company_name?: string;
}

// Loader Component
const Loader: React.FC = () => {
  return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
        <p className="text-gray-600">Loading data...</p>
      </div>
  );
};

// Skeleton Loader for Table Rows
const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
      <>
        {Array.from({ length: rows }).map((_, index) => (
            <tr key={index} className="animate-pulse">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-full"></div>
                  <div className="ml-4">
                    <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-40"></div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="h-6 bg-gray-200 rounded w-24"></div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="h-4 bg-gray-200 rounded w-24"></div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex space-x-2">
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                </div>
              </td>
            </tr>
        ))}
      </>
  );
};

// Skeleton Loader for Transaction Cards
const TransactionSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
      <>
        {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3 rounded-full bg-gray-200"></div>
                  <div>
                    <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
                    <div className="flex items-center space-x-4 mt-1">
                      <div className="h-3 bg-gray-200 rounded w-32"></div>
                      <div className="h-6 bg-gray-200 rounded w-16"></div>
                      <div className="h-3 bg-gray-200 rounded w-20"></div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="h-6 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
        ))}
      </>
  );
};

const WalletManagement: React.FC = () => {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'wallets' | 'transactions'>('wallets');
  const [userTypeFilter, setUserTypeFilter] = useState<'customer' | 'company'>('customer');
  const [searchTerm, setSearchTerm] = useState('');
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [transactionType, setTransactionType] = useState<'credit' | 'debit'>('credit');
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [selectedWalletTransactions, setSelectedWalletTransactions] = useState<Transaction[]>([]);
  const [selectedWalletUser, setSelectedWalletUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const notification = useNotification();

  useEffect(() => {
    if (activeTab === 'wallets') {
      loadWallets();
    } else {
      loadTransactions();
    }
  }, [activeTab, userTypeFilter]);

  useEffect(() => {
    if (userSearch.length > 2) {
      searchUsers(userSearch);
    } else {
      setUsers([]);
      setShowUserDropdown(false);
    }
  }, [userSearch]);

  const searchUsers = async (searchQuery: string) => {
    try {
      // First search for users by email
      const { data: usersData, error: usersError } = await supabase
          .from('tbl_users')
          .select(`
          tu_id,
          tu_email,
          tu_user_type,
          tbl_user_profiles (
            tup_first_name,
            tup_last_name
          )
        `)
          .ilike('tu_email', `%${searchQuery}%`)
          .limit(10);

      if (usersError) throw usersError;

      // Then search for users by name in profiles
      const { data: profileUsersData, error: profileError } = await supabase
          .from('tbl_user_profiles')
          .select(`
            tup_first_name,
            tup_last_name,
            tbl_users (
              tu_id,
              tu_email,
              tu_user_type
            )
          `)
          .or(`tup_first_name.ilike.%${searchQuery}%,tup_last_name.ilike.%${searchQuery}%`)
          .limit(10);

      if (profileError) throw profileError;

      // Combine results
      const allUsers = [...(usersData || [])];

      if (profileUsersData) {
        profileUsersData.forEach(profile => {
          if (profile.tbl_users && !allUsers.some(u => u.tu_id === profile.tbl_users.tu_id)) {
            allUsers.push({
              ...profile.tbl_users,
              tbl_user_profiles: [{
                tup_first_name: profile.tup_first_name,
                tup_last_name: profile.tup_last_name
              }]
            });
          }
        });
      }

      // Get user IDs to search for companies
      const userIds = allUsers.map(user => user.tu_id);

      // Search for companies related to these users
      let companiesMap = new Map();
      if (userIds.length > 0) {
        const { data: companiesData, error: companiesError } = await supabase
            .from('tbl_companies')
            .select('tc_user_id, tc_company_name')
            .in('tc_user_id', userIds);

        if (!companiesError && companiesData) {
          companiesData.forEach(company => {
            companiesMap.set(company.tc_user_id, company.tc_company_name);
          });
        }
      }

      const formattedUsers = allUsers.map(user => ({
        tu_id: user.tu_id,
        tu_email: user.tu_email,
        tu_user_type: user.tu_user_type,
        tup_first_name: user.tbl_user_profiles?.[0]?.tup_first_name,
        tup_last_name: user.tbl_user_profiles?.[0]?.tup_last_name,
        company_name: companiesMap.get(user.tu_id)
      }));

      setUsers(formattedUsers);
      setShowUserDropdown(formattedUsers.length > 0);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const selectUser = async (user: User) => {
    try {
      setSelectedUser(user);
      setSelectedUserId(user.tu_id);
      const displayName = user.tu_user_type === 'company' && user.company_name
          ? user.company_name
          : `${user.tup_first_name || ''} ${user.tup_last_name || ''}`.trim();

      setUserSearch(`${displayName} (${user.tu_email})`.trim());
      setShowUserDropdown(false);
    } catch (error) {
      console.error('Error selecting user:', error);
      notification.showError('Error', 'Failed to select user');
    }
  };

  const loadWallets = async () => {
    try {
      setLoading(true);
      setListLoading(true);
      console.log('🔍 Loading wallet data...');

      // First get wallets
      const { data: walletsData, error: walletsError } = await supabase
          .from('tbl_wallets')
          .select(`
          tw_user_id,
          tw_balance,
          tw_currency,
          tw_created_at
        `)
          .eq('tw_currency', 'USDT')
          .order('tw_balance', { ascending: false });

      if (walletsError) {
        console.error('Wallets error:', walletsError);
        throw walletsError;
      }

      if (!walletsData || walletsData.length === 0) {
        console.log('No wallet data found');
        setWallets([]);
        setLoading(false);
        setListLoading(false);
        return;
      }

      // Get user IDs to fetch user details
      const userIds = walletsData.map(wallet => wallet.tw_user_id);

      // Get users with their type and profiles
      const { data: usersData, error: usersError } = await supabase
          .from('tbl_users')
          .select(`
          tu_id,
          tu_email,
          tu_user_type,
          tbl_user_profiles (
            tup_first_name,
            tup_last_name
          )
        `)
          .in('tu_id', userIds);

      if (usersError) {
        console.error('Users error:', usersError);
        throw usersError;
      }

      // Get companies for company users
      const companyUserIds = usersData?.filter(user => user.tu_user_type === 'company').map(user => user.tu_id) || [];
      let companiesMap = new Map();

      if (companyUserIds.length > 0) {
        const { data: companiesData, error: companiesError } = await supabase
            .from('tbl_companies')
            .select('tc_user_id, tc_company_name')
            .in('tc_user_id', companyUserIds);

        if (!companiesError && companiesData) {
          companiesData.forEach(company => {
            companiesMap.set(company.tc_user_id, company.tc_company_name);
          });
        }
      }

      // Get transaction counts and totals for each user
      const walletsWithStats = await Promise.all(
          walletsData.map(async (wallet) => {
            try {
              // Get transactions for this wallet
              const { data: txData, error: txError } = await supabase
                  .from('tbl_wallet_transactions')
                  .select('twt_amount, twt_transaction_type, twt_created_at')
                  .eq('twt_user_id', wallet.tw_user_id)
                  .eq('twt_status', 'completed');

              if (txError) {
                console.error('Error fetching transactions:', txError);
              }

              const totalEarned = txData?.filter(tx => tx.twt_transaction_type === 'credit')
                  .reduce((sum, tx) => sum + parseFloat(tx.twt_amount.toString()), 0) || 0;

              const totalSpent = txData?.filter(tx => tx.twt_transaction_type === 'debit')
                  .reduce((sum, tx) => sum + parseFloat(tx.twt_amount.toString()), 0) || 0;

              const lastTransaction = txData && txData.length > 0
                  ? txData.reduce((latest, tx) =>
                          new Date(tx.twt_created_at) > new Date(latest) ? tx.twt_created_at : latest,
                      txData[0].twt_created_at
                  )
                  : wallet.tw_created_at;

              // Find user details
              const user = usersData?.find(u => u.tu_id === wallet.tw_user_id);
              const userType = user?.tu_user_type as 'customer' | 'company' | 'admin';
              const userEmail = user?.tu_email || 'Unknown Email';

              let userName = 'Unknown User';
              let companyName: string | undefined;

              if (userType === 'company') {
                companyName = companiesMap.get(wallet.tw_user_id);
                userName = companyName || 'Company User';
              } else {
                const firstName = user?.tbl_user_profiles?.[0]?.tup_first_name || '';
                const lastName = user?.tbl_user_profiles?.[0]?.tup_last_name || '';
                userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : userEmail;
              }

              return {
                user_id: wallet.tw_user_id,
                user_email: userEmail,
                user_name: userName,
                user_type: userType,
                wallet_balance: parseFloat(wallet.tw_balance.toString()),
                total_earned: totalEarned,
                total_spent: totalSpent,
                transaction_count: txData?.length || 0,
                last_transaction: lastTransaction,
                company_name: companyName
              };
            } catch (error) {
              console.error('Error processing wallet:', wallet.tw_user_id, error);
              // Return basic wallet info even if transaction data fails
              const user = usersData?.find(u => u.tu_id === wallet.tw_user_id);
              return {
                user_id: wallet.tw_user_id,
                user_email: user?.tu_email || 'Unknown Email',
                user_name: user?.tbl_user_profiles?.[0]?.tup_first_name
                    ? `${user.tbl_user_profiles[0].tup_first_name} ${user.tbl_user_profiles[0].tup_last_name || ''}`.trim()
                    : user?.tu_email || 'Unknown User',
                user_type: user?.tu_user_type as 'customer' | 'company' | 'admin' || 'customer',
                wallet_balance: parseFloat(wallet.tw_balance.toString()),
                total_earned: 0,
                total_spent: 0,
                transaction_count: 0,
                last_transaction: wallet.tw_created_at
              };
            }
          })
      );

      setWallets(walletsWithStats);
      console.log('✅ Wallets loaded:', walletsWithStats.length);
    } catch (error) {
      console.error('Failed to load wallets:', error);
      notification.showError('Load Failed', 'Failed to load wallet data. Please check console for details.');
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setListLoading(true);
      console.log('🔍 Loading transactions...');

      const { data: transactionsData, error: transactionsError } = await supabase
          .from('tbl_wallet_transactions')
          .select(`
          twt_id,
          twt_user_id,
          twt_transaction_type,
          twt_amount,
          twt_description,
          twt_reference_type,
          twt_status,
          twt_created_at
        `)
          .order('twt_created_at', { ascending: false })
          .limit(100);

      if (transactionsError) {
        console.error('Transactions error:', transactionsError);
        throw transactionsError;
      }

      if (!transactionsData || transactionsData.length === 0) {
        setTransactions([]);
        setLoading(false);
        setListLoading(false);
        return;
      }

      // Get user IDs from transactions
      const userIds = [...new Set(transactionsData.map(tx => tx.twt_user_id))];

      // Get users with their type and profiles
      const { data: usersData, error: usersError } = await supabase
          .from('tbl_users')
          .select(`
          tu_id,
          tu_email,
          tu_user_type,
          tbl_user_profiles (
            tup_first_name,
            tup_last_name
          )
        `)
          .in('tu_id', userIds);

      if (usersError) {
        console.error('Users error:', usersError);
        throw usersError;
      }

      // Get companies for company users
      const companyUserIds = usersData?.filter(user => user.tu_user_type === 'company').map(user => user.tu_id) || [];
      let companiesMap = new Map();

      if (companyUserIds.length > 0) {
        const { data: companiesData, error: companiesError } = await supabase
            .from('tbl_companies')
            .select('tc_user_id, tc_company_name')
            .in('tc_user_id', companyUserIds);

        if (!companiesError && companiesData) {
          companiesData.forEach(company => {
            companiesMap.set(company.tc_user_id, company.tc_company_name);
          });
        }
      }

      const formattedTransactions = transactionsData.map(tx => {
        const user = usersData?.find(u => u.tu_id === tx.twt_user_id);
        const userType = user?.tu_user_type as 'customer' | 'company' | 'admin';

        let userName = 'Unknown User';
        let companyName: string | undefined;

        if (userType === 'company') {
          companyName = companiesMap.get(tx.twt_user_id);
          userName = companyName || 'Company User';
        } else {
          const firstName = user?.tbl_user_profiles?.[0]?.tup_first_name || '';
          const lastName = user?.tbl_user_profiles?.[0]?.tup_last_name || '';
          userName = firstName || lastName ? `${firstName} ${lastName}`.trim() : user?.tu_email || 'Customer User';
        }

        return {
          ...tx,
          user_info: {
            email: user?.tu_email || 'Unknown Email',
            name: userName,
            type: userType,
            company_name: companyName
          }
        };
      });

      setTransactions(formattedTransactions);
      console.log('✅ Transactions loaded:', formattedTransactions.length);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      notification.showError('Load Failed', 'Failed to load transaction data. Please check console for details.');
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  };

  const loadWalletTransactions = async (userId: string, userEmail: string, userName: string) => {
    try {
      setLoading(true);

      // First get the wallet ID
      const { data: wallet, error: walletError } = await supabase
          .from('tbl_wallets')
          .select('tw_id')
          .eq('tw_user_id', userId)
          .eq('tw_currency', 'USDT')
          .single();

      if (walletError) throw walletError;

      // Then get transactions for this wallet
      const { data: transactionsData, error } = await supabase
          .from('tbl_wallet_transactions')
          .select('*')
          .eq('twt_wallet_id', wallet.tw_id)
          .order('twt_created_at', { ascending: false })
          .limit(50);

      if (error) throw error;

      setSelectedWalletTransactions(transactionsData || []);
      setSelectedWalletUser({
        tu_id: userId,
        tu_email: userEmail,
        tu_user_type: 'customer', // This would need to be fetched properly
        tup_first_name: userName
      });
      setShowTransactionsModal(true);

    } catch (error) {
      console.error('Failed to load wallet transactions:', error);
      notification.showError('Load Failed', 'Failed to load wallet transactions');
    } finally {
      setLoading(false);
    }
  };

  const ensureWalletExists = async (userId: string): Promise<string> => {
    try {
      // Check if wallet already exists
      const { data: existingWallet, error: checkError } = await supabase
          .from('tbl_wallets')
          .select('tw_id')
          .eq('tw_user_id', userId)
          .eq('tw_currency', 'USDT')
          .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows found"
        throw checkError;
      }

      // If wallet doesn't exist, create it
      if (!existingWallet) {
        const newWalletId = crypto.randomUUID();
        const { error: createError } = await supabase
            .from('tbl_wallets')
            .insert({
              tw_id: newWalletId,
              tw_user_id: userId,
              tw_balance: 0,
              tw_currency: 'USDT',
              tw_is_active: true,
              tw_created_at: new Date().toISOString(),
              tw_updated_at: new Date().toISOString()
            });

        if (createError) throw createError;

        console.log('✅ Wallet created for user:', userId);
        return newWalletId;
      }

      return existingWallet.tw_id; // Return existing wallet ID
    } catch (error) {
      console.error('Error ensuring wallet exists:', error);
      throw error;
    }
  };

  const handleCreateWalletForAllUsers = async () => {
    try {
      setLoading(true);
      notification.showInfo('Processing', 'Creating wallets for users without one...');

      // Get all users
      const { data: users, error: usersError } = await supabase
          .from('tbl_users')
          .select('tu_id')
          .eq('tu_is_active', true);

      if (usersError) throw usersError;

      if (!users || users.length === 0) {
        notification.showInfo('Complete', 'No users found to create wallets for');
        return;
      }

      // Get existing wallets
      const { data: existingWallets, error: walletsError } = await supabase
          .from('tbl_wallets')
          .select('tw_user_id')
          .eq('tw_currency', 'USDT');

      if (walletsError) throw walletsError;

      const existingWalletUserIds = new Set(existingWallets?.map(w => w.tw_user_id) || []);

      // Find users without wallets
      const usersWithoutWallets = users.filter(user => !existingWalletUserIds.has(user.tu_id));

      if (usersWithoutWallets.length === 0) {
        notification.showInfo('Complete', 'All users already have wallets');
        return;
      }

      // Create wallets for users without one
      const walletCreations = usersWithoutWallets.map(user =>
          supabase
              .from('tbl_wallets')
              .insert({
                tw_user_id: user.tu_id,
                tw_balance: 0,
                tw_currency: 'USDT',
                tw_is_active: true,
                tw_created_at: new Date().toISOString(),
                tw_updated_at: new Date().toISOString()
              })
      );

      await Promise.all(walletCreations);

      notification.showSuccess(
          'Wallets Created',
          `Created wallets for ${usersWithoutWallets.length} users`
      );

      loadWallets(); // Reload the wallets list

    } catch (error: any) {
      console.error('Failed to create wallets:', error);
      notification.showError('Creation Failed', error.message || 'Failed to create wallets');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletTransaction = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if we have a selected user ID OR if we need to validate the search field
    if (!selectedUserId && !userSearch) {
      notification.showError('Validation Error', 'Please select a user and enter a valid amount');
      return;
    }

    if (amount <= 0) {
      notification.showError('Validation Error', 'Please enter a valid amount');
      return;
    }

    // If we have a selectedUserId but no userSearch (from the Manage Wallet button)
    // we need to make sure we have the user details
    if (selectedUserId && !selectedUser) {
      try {
        // Fetch user details based on selectedUserId
        const { data: userData, error: userError } = await supabase
            .from('tbl_users')
            .select(`
          tu_id,
          tu_email,
          tu_user_type,
          tbl_user_profiles (
            tup_first_name,
            tup_last_name
          )
        `)
            .eq('tu_id', selectedUserId)
            .single();

        if (userError) throw userError;

        // Get company name if it's a company user
        let companyName;
        if (userData.tu_user_type === 'company') {
          const { data: companyData } = await supabase
              .from('tbl_companies')
              .select('tc_company_name')
              .eq('tc_user_id', selectedUserId)
              .single();

          companyName = companyData?.tc_company_name;
        }

        setSelectedUser({
          tu_id: userData.tu_id,
          tu_email: userData.tu_email,
          tu_user_type: userData.tu_user_type,
          tup_first_name: userData.tbl_user_profiles?.[0]?.tup_first_name,
          tup_last_name: userData.tbl_user_profiles?.[0]?.tup_last_name,
          company_name: companyName
        });

        // Set the user search field for display
        const displayName = userData.tu_user_type === 'company' && companyName
            ? companyName
            : `${userData.tbl_user_profiles?.[0]?.tup_first_name || ''} ${userData.tbl_user_profiles?.[0]?.tup_last_name || ''}`.trim();

        setUserSearch(`${displayName} (${userData.tu_email})`.trim());
      } catch (error) {
        console.error('Failed to fetch user details:', error);
        notification.showError('Error', 'Failed to load user details');
        return;
      }
    }

    // Rest of your function remains the same...
    try {
      // Ensure wallet exists before processing transaction
      await ensureWalletExists(selectedUserId);

      // Get current wallet details including wallet ID
      const { data: currentWallet, error: walletError } = await supabase
          .from('tbl_wallets')
          .select('tw_id, tw_balance')
          .eq('tw_user_id', selectedUserId)
          .eq('tw_currency', 'USDT')
          .single();

      if (walletError) throw walletError;

      // Calculate the transaction amount with proper sign
      const transactionAmount = transactionType === 'credit' ? amount : -amount;
      const newBalance = parseFloat(currentWallet.tw_balance) + transactionAmount;

      // Update wallet balance
      const { error: updateError } = await supabase
          .from('tbl_wallets')
          .update({
            tw_balance: newBalance,
            tw_updated_at: new Date().toISOString()
          })
          .eq('tw_id', currentWallet.tw_id);

      if (updateError) throw updateError;

      // Record transaction with wallet ID
      const { error: txError } = await supabase
          .from('tbl_wallet_transactions')
          .insert({
            twt_id: crypto.randomUUID(),
            twt_wallet_id: currentWallet.tw_id,
            twt_user_id: selectedUserId,
            twt_transaction_type: transactionType,
            twt_amount: amount,
            twt_description: description || `Admin ${transactionType}`,
            twt_reference_type: transactionType === 'credit' ? 'admin_credit' : 'withdrawal',
            twt_status: 'completed',
            twt_created_at: new Date().toISOString()
          });

      if (txError) throw txError;

      notification.showSuccess(
          'Wallet Updated',
          `Successfully ${transactionType === 'credit' ? 'credited' : 'debited'} ${amount} USDT. New balance: ${newBalance.toFixed(2)} USDT`
      );

      setShowManageModal(false);
      setSelectedUserId('');
      setSelectedUser(null);
      setUserSearch('');
      setAmount(0);
      setDescription('');
      setTransactionType('credit');
      loadWallets();
    } catch (error: any) {
      console.error('Failed to update wallet:', error);
      notification.showError('Transaction Failed', error.message || 'Failed to process transaction');
    }
  };

  const filteredWallets = wallets.filter(wallet => {
    const matchesSearch = wallet.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        wallet.user_name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = wallet.user_type === userTypeFilter;

    return matchesSearch && matchesType;
  });

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.user_info?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.user_info?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.twt_description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = tx.user_info?.type === userTypeFilter;

    return matchesSearch && matchesType;
  });

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentWallets = filteredWallets.slice(indexOfFirstItem, indexOfLastItem);
  const currentTransactions = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(
      activeTab === 'wallets'
          ? filteredWallets.length / itemsPerPage
          : filteredTransactions.length / itemsPerPage
  );

  // Improved pagination with limited page numbers
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages if total pages is less than max visible
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Always include first page
      pageNumbers.push(1);

      // Calculate start and end of visible page range
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      // Adjust if we're near the beginning
      if (currentPage <= 3) {
        endPage = 4;
      }

      // Adjust if we're near the end
      if (currentPage >= totalPages - 2) {
        startPage = totalPages - 3;
      }

      // Add ellipsis after first page if needed
      if (startPage > 2) {
        pageNumbers.push('...');
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }

      // Add ellipsis before last page if needed
      if (endPage < totalPages - 1) {
        pageNumbers.push('...');
      }

      // Always include last page
      pageNumbers.push(totalPages);
    }

    return pageNumbers;
  };

  const paginate = (pageNumber: number) => {
    if (pageNumber !== '...') {
      setCurrentPage(pageNumber as number);
    }
  };

  const getWalletStats = () => {
    const filtered = wallets.filter(w => w.user_type === userTypeFilter);

    const totalBalance = filtered.reduce((sum, w) => sum + w.wallet_balance, 0);
    const totalEarned = filtered.reduce((sum, w) => sum + w.total_earned, 0);
    const totalSpent = filtered.reduce((sum, w) => sum + w.total_spent, 0);
    const activeWallets = filtered.filter(w => w.wallet_balance > 0).length;

    return { totalBalance, totalEarned, totalSpent, activeWallets };
  };

  const stats = getWalletStats();

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
                  onClick={() => setShowManageModal(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <Wallet className="h-4 w-4" />
                <span>Manage Wallet</span>
              </button>
              <button
                  onClick={handleCreateWalletForAllUsers}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Create Missing Wallets</span>
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

          {/* Tabs and Filters */}
          <div className="flex items-center justify-between mb-6">
            <nav className="flex space-x-8">
              {[
                { id: 'wallets', label: 'User Wallets', icon: Wallet },
                { id: 'transactions', label: 'All Transactions', icon: DollarSign }
              ].map((tab) => (
                  <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setCurrentPage(1); // Reset to first page when changing tabs
                      }}
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

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">Filter by:</label>
                <select
                    value={userTypeFilter}
                    onChange={(e) => setUserTypeFilter(e.target.value as any)}
                    className="border border-gray-300 rounded-lg px-3 py-1 focus:ring-2 focus:ring-green-500"
                >
                  <option value="customer">Customers</option>
                  <option value="company">Companies</option>
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">Show:</label>
                <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="border border-gray-300 rounded-lg px-3 py-1 focus:ring-2 focus:ring-green-500"
                >
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
                <span className="text-sm text-gray-600">per page</span>
              </div>
            </div>
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
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1); // Reset to first page when searching
                  }}
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
                  {listLoading ? (
                      <TableSkeleton rows={itemsPerPage} />
                  ) : (
                      <>
                        {currentWallets.map((wallet) => (
                            <tr key={wallet.user_id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                  <div className="flex-shrink-0 h-10 w-10">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                        wallet.user_type === 'company'
                                            ? 'bg-gradient-to-r from-blue-500 to-purple-600'
                                            : 'bg-gradient-to-r from-green-500 to-blue-600'
                                    }`}>
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
                                    {wallet.company_name && (
                                        <div className="text-xs text-blue-600">
                                          {wallet.company_name}
                                        </div>
                                    )}
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
                                        // Set the selected user ID and user object
                                        setSelectedUserId(wallet.user_id);
                                        setSelectedUser({
                                          tu_id: wallet.user_id,
                                          tu_email: wallet.user_email,
                                          tu_user_type: wallet.user_type,
                                          tup_first_name: wallet.user_name.split(' ')[0],
                                          tup_last_name: wallet.user_name.split(' ')[1],
                                          company_name: wallet.company_name
                                        });
                                        setUserSearch(`${wallet.user_name} (${wallet.user_email})`);
                                        setShowManageModal(true);
                                      }}
                                      className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                                      title="Manage Wallet"
                                  >
                                    <Wallet className="h-4 w-4" />
                                  </button>
                                  <button
                                      onClick={() => loadWalletTransactions(wallet.user_id, wallet.user_email, wallet.user_name)}
                                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                                      title="View Transactions"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                        ))}
                      </>
                  )}
                  </tbody>
                </table>

                {/* Show loader when no data is available yet */}
                {listLoading && filteredWallets.length === 0 && (
                    <div className="py-8">
                      <Loader />
                    </div>
                )}

                {/* Show empty state when no data is found */}
                {!listLoading && filteredWallets.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No wallets found matching your criteria
                    </div>
                )}

                {/* Pagination for wallets */}
                {filteredWallets.length > 0 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-gray-700">
                        Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredWallets.length)} of {filteredWallets.length} entries
                      </div>
                      <div className="flex space-x-1">
                        <button
                            onClick={() => paginate(currentPage - 1)}
                            disabled={currentPage === 1}
                            className={`px-3 py-1 rounded-md ${currentPage === 1 ? 'bg-gray-200 text-gray-400' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        {getPageNumbers().map((page, index) => (
                            <button
                                key={index}
                                onClick={() => paginate(page)}
                                className={`px-3 py-1 rounded-md ${
                                    page === currentPage
                                        ? 'bg-green-600 text-white'
                                        : page === '...'
                                            ? 'bg-transparent text-gray-500 cursor-default'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                                disabled={page === '...'}
                            >
                              {page === '...' ? <MoreHorizontal className="h-4 w-4" /> : page}
                            </button>
                        ))}
                        <button
                            onClick={() => paginate(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className={`px-3 py-1 rounded-md ${currentPage === totalPages ? 'bg-gray-200 text-gray-400' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                )}
              </div>
          )}

          {activeTab === 'transactions' && (
              <div className="space-y-4">
                {listLoading ? (
                    <TransactionSkeleton count={itemsPerPage} />
                ) : (
                    <>
                      {currentTransactions.map((transaction) => (
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
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                                        transaction.user_info?.type === 'company'
                                            ? 'bg-blue-100 text-blue-800'
                                            : 'bg-green-100 text-green-800'
                                    }`}>
                                    {transaction.user_info?.type}
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
                    </>
                )}

                {/* Show loader when no data is available yet */}
                {listLoading && filteredTransactions.length === 0 && (
                    <div className="py-8">
                      <Loader />
                    </div>
                )}

                {/* Show empty state when no data is found */}
                {!listLoading && filteredTransactions.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No transactions found matching your criteria
                    </div>
                )}

                {/* Pagination for transactions */}
                {filteredTransactions.length > 0 && (
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-gray-700">
                        Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredTransactions.length)} of {filteredTransactions.length} entries
                      </div>
                      <div className="flex space-x-1">
                        <button
                            onClick={() => paginate(currentPage - 1)}
                            disabled={currentPage === 1}
                            className={`px-3 py-1 rounded-md ${currentPage === 1 ? 'bg-gray-200 text-gray-400' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        {getPageNumbers().map((page, index) => (
                            <button
                                key={index}
                                onClick={() => paginate(page)}
                                className={`px-3 py-1 rounded-md ${
                                    page === currentPage
                                        ? 'bg-green-600 text-white'
                                        : page === '...'
                                            ? 'bg-transparent text-gray-500 cursor-default'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                                disabled={page === '...'}
                            >
                              {page === '...' ? <MoreHorizontal className="h-4 w-4" /> : page}
                            </button>
                        ))}
                        <button
                            onClick={() => paginate(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className={`px-3 py-1 rounded-md ${currentPage === totalPages ? 'bg-gray-200 text-gray-400' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                )}
              </div>
          )}
        </div>

        {/* Manage Wallet Modal */}
        {showManageModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Manage User Wallet</h3>
                  <button
                      onClick={() => {
                        setShowManageModal(false);
                        setSelectedUserId('');
                        setSelectedUser(null);
                        setUserSearch('');
                        setAmount(0);
                        setDescription('');
                        setTransactionType('credit');
                      }}
                      className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleWalletTransaction} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Search User *
                    </label>
                    <div className="relative">
                      <input
                          type="text"
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          onFocus={() => userSearch.length > 2 && setShowUserDropdown(true)}
                          placeholder="Search by name or email..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          required
                      />
                      {showUserDropdown && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {users.map((user) => (
                                <div
                                    key={user.tu_id}
                                    onClick={() => selectUser(user)}
                                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                                >
                                  <div className="font-medium">
                                    {user.tu_user_type === 'company' && user.company_name
                                        ? user.company_name
                                        : `${user.tup_first_name || ''} ${user.tup_last_name || ''}`.trim()
                                    }
                                  </div>
                                  <div className="text-sm text-gray-600">{user.tu_email}</div>
                                  <div className="text-xs text-blue-600 capitalize">{user.tu_user_type}</div>
                                </div>
                            ))}
                            {users.length === 0 && (
                                <div className="px-4 py-2 text-gray-500">No users found</div>
                            )}
                          </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transaction Type *
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                          type="button"
                          onClick={() => setTransactionType('credit')}
                          className={`px-4 py-2 rounded-lg border-2 font-medium transition-colors ${
                              transactionType === 'credit'
                                  ? 'border-green-500 bg-green-50 text-green-700'
                                  : 'border-gray-300 text-gray-700 hover:border-green-300'
                          }`}
                      >
                        <Plus className="h-4 w-4 inline mr-2" />
                        Credit
                      </button>
                      <button
                          type="button"
                          onClick={() => setTransactionType('debit')}
                          className={`px-4 py-2 rounded-lg border-2 font-medium transition-colors ${
                              transactionType === 'debit'
                                  ? 'border-red-500 bg-red-50 text-red-700'
                                  : 'border-gray-300 text-gray-700 hover:border-red-300'
                          }`}
                      >
                        <Minus className="h-4 w-4 inline mr-2" />
                        Debit
                      </button>
                    </div>
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
                        value={amount}
                        onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
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
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder={`Reason for ${transactionType}`}
                    />
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={() => {
                          setShowManageModal(false);
                          setSelectedUserId('');
                          setSelectedUser(null);
                          setUserSearch('');
                          setAmount(0);
                          setDescription('');
                          setTransactionType('credit');
                        }}
                        className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                        type="submit"
                        className={`px-4 py-2 text-white rounded-lg transition-colors flex items-center space-x-2 ${
                            transactionType === 'credit'
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-red-600 hover:bg-red-700'
                        }`}
                    >
                      {transactionType === 'credit' ? (
                          <Plus className="h-4 w-4" />
                      ) : (
                          <Minus className="h-4 w-4" />
                      )}
                      <span>{transactionType === 'credit' ? 'Credit' : 'Debit'} Wallet</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {/* View Transactions Modal */}
        {showTransactionsModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Transactions for {selectedWalletUser?.tup_first_name} ({selectedWalletUser?.tu_email})
                  </h3>
                  <button
                      onClick={() => {
                        setShowTransactionsModal(false);
                        setSelectedWalletTransactions([]);
                        setSelectedWalletUser(null);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-4">
                  {selectedWalletTransactions.map((transaction) => (
                      <div key={transaction.twt_id} className="border border-gray-200 rounded-lg p-4">
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
                                  {new Date(transaction.twt_created_at).toLocaleDateString()}
                                </span>
                                {transaction.twt_reference_type && (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                      {transaction.twt_reference_type?.replace('_', ' ')}
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

                  {selectedWalletTransactions.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        No transactions found for this wallet
                      </div>
                  )}
                </div>
              </div>
            </div>
        )}
      </div>
  );
};

export default WalletManagement;