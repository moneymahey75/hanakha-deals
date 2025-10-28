import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMLM } from '../../contexts/MLMContext';
import ReferralLinkGenerator from '../../components/mlm/ReferralLinkGenerator';
import TransactionsDashboard from '../../components/customer/TransactionsDashboard';
import DailyTasksDashboard from '../../components/customer/DailyTasksDashboard';
import CouponInteractionsList from '../../components/customer/CouponInteractionsList';
import WalletList from '../../components/customer/WalletList';
import PaymentHistory from '../../components/customer/PaymentHistory';
import { useNotification } from '../../components/ui/NotificationProvider';
import {
  Users,
  TrendingUp,
  DollarSign,
  Award,
  UserPlus,
  BarChart3,
  CheckSquare,
  ExternalLink,
  Send,
  Download,
  Menu,
  X,
  Home,
  CreditCard,
  Ticket,
  Share2,
  Wallet as WalletIcon,
} from 'lucide-react';
import MyNetwork from "../../components/mlm/MyNetwork";

interface DashboardStats {
  totalReferrals: number;
  monthlyEarnings: number;
  currentLevel: number;
  achievementPoints: number;
  leftSideCount: number;
  rightSideCount: number;
  directReferrals: number;
  totalDownline: number;
}

interface RecentActivity {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  amount?: number;
}

interface EarningsData {
  totalEarnings: number;
  monthlyEarnings: number;
  commissionRate: number;
  growthPercentage: number;
}

const CustomerDashboard: React.FC = () => {
  const { user } = useAuth();
  const notification = useNotification();
  const { treeData, loading: treeLoading, getTreeStats, loadTreeData } = useMLM();
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalReferrals: 0,
    monthlyEarnings: 0,
    currentLevel: 0,
    achievementPoints: 0,
    leftSideCount: 0,
    rightSideCount: 0,
    directReferrals: 0,
    totalDownline: 0
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [earningsData, setEarningsData] = useState<EarningsData>({
    totalEarnings: 0,
    monthlyEarnings: 0,
    commissionRate: 0,
    growthPercentage: 0
  });
  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Navigation items
  const navigationItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'interactions', label: 'My Coupons', icon: Ticket },
    { id: 'tasks', label: 'Daily Tasks', icon: CheckSquare },
    { id: 'network', label: 'My Network', icon: Users },
    { id: 'payments', label: 'Payment History', icon: CreditCard },
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'earnings', label: 'Earnings', icon: DollarSign },
    { id: 'wallets', label: 'My Wallets', icon: WalletIcon },
    { id: 'referrals', label: 'Referral Links', icon: Share2 },
  ];

  // FIXED: Load dashboard data with proper error handling
  useEffect(() => {
    let mounted = true;

    const loadDashboardData = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      console.log('🔄 Loading dashboard data for user:', user.id);

      try {
        // Load data in parallel with timeout
        const loadPromises = [
          loadTreeStats(),
          loadRecentActivities(),
          loadEarningsData()
        ];

        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Dashboard load timeout')), 10000)
        );

        await Promise.race([
          Promise.allSettled(loadPromises),
          timeoutPromise
        ]);

        if (mounted) {
          console.log('✅ Dashboard data loaded successfully');
          setInitialLoadComplete(true);
        }
      } catch (error: any) {
        console.error('❌ Failed to load dashboard data:', error);
        if (mounted) {
          notification.showError('Error', 'Failed to load some dashboard data. Please refresh.');
          setInitialLoadComplete(true); // Still show the dashboard
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const loadTreeStats = async () => {
    if (!user?.id) return;

    try {
      console.log('📊 Loading tree stats...');

      // Load tree data first if not already loaded
      if (!treeData || treeData.length === 0) {
        await loadTreeData(user.id);
      }

      const stats = await getTreeStats(user.id);
      console.log('✅ Tree stats loaded:', stats);

      setDashboardStats(prev => ({
        ...prev,
        totalReferrals: stats.totalDownline || 0,
        leftSideCount: stats.leftSideCount || 0,
        rightSideCount: stats.rightSideCount || 0,
        directReferrals: stats.directReferrals || 0,
        totalDownline: stats.totalDownline || 0,
        currentLevel: stats.maxDepth || 0
      }));
    } catch (error) {
      console.error('❌ Failed to load tree stats:', error);
      // Don't throw - allow other data to load
    }
  };

  const loadRecentActivities = async () => {
    try {
      console.log('📋 Loading recent activities...');

      // Simulate API call - replace with actual API endpoint
      const activities: RecentActivity[] = [
        {
          id: '1',
          type: 'referral',
          message: 'New referral joined your network',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          type: 'earning',
          message: 'Commission earned',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          amount: 125
        },
        {
          id: '3',
          type: 'level',
          message: 'Congratulations! Level up achieved',
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        }
      ];

      setRecentActivities(activities);
      console.log('✅ Recent activities loaded');
    } catch (error) {
      console.error('❌ Failed to load recent activities:', error);
    }
  };

  const loadEarningsData = async () => {
    try {
      console.log('💰 Loading earnings data...');

      // Simulate API call - replace with actual API endpoint
      const earnings: EarningsData = {
        totalEarnings: 12450,
        monthlyEarnings: 2450,
        commissionRate: 12,
        growthPercentage: 15
      };

      setEarningsData(earnings);
      console.log('✅ Earnings data loaded');
    } catch (error) {
      console.error('❌ Failed to load earnings data:', error);
    }
  };

  const handleInviteMembers = () => {
    setActiveTab('referrals');
    notification.showInfo('Invite Members', 'Use your referral links to invite new members!');
  };

  const handleViewEarningsReport = () => {
    setActiveTab('earnings');
  };

  const handleUpgradePlan = () => {
    notification.showInfo('Upgrade Plan', 'Plan upgrade functionality would be implemented here.');
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'referral': return UserPlus;
      case 'earning': return DollarSign;
      case 'level': return Award;
      default: return UserPlus;
    }
  };

  const stats = [
    {
      title: 'Total Referrals',
      value: dashboardStats.totalReferrals,
      icon: Users,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      title: 'Monthly Earnings',
      value: `$${dashboardStats.monthlyEarnings.toLocaleString()}`,
      icon: DollarSign,
      color: 'bg-green-500',
      change: '+8%'
    },
    {
      title: 'Current Level',
      value: dashboardStats.currentLevel,
      icon: TrendingUp,
      color: 'bg-purple-500',
      change: 'Level up!'
    },
    {
      title: 'Achievement Points',
      value: dashboardStats.achievementPoints.toLocaleString(),
      icon: Award,
      color: 'bg-yellow-500',
      change: '+15%'
    }
  ];

  // FIXED: Show loading only on initial load
  if (loading && !initialLoadComplete) {
    return (
        <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading dashboard...</p>
            <p className="text-gray-400 text-sm mt-2">Please wait...</p>
          </div>
        </div>
    );
  }

  // FIXED: Show error if user not loaded
  if (!user) {
    return (
        <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-500 mb-4">
              <X className="h-12 w-12 mx-auto" />
            </div>
            <p className="text-gray-900 font-semibold">User not found</p>
            <p className="text-gray-500 mt-2">Please login again</p>
          </div>
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Mobile menu button */}
        <div className="lg:hidden fixed top-4 left-4 z-50">
          <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-md bg-indigo-600 text-white shadow-lg"
          >
            {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:shadow-none
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <Home className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            </div>
          </div>

          <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-80px)]">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                  <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsSidebarOpen(false);
                      }}
                      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                          activeTab === item.id
                              ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span className="font-medium">{item.label}</span>
                  </button>
              );
            })}
          </nav>
        </div>

        {/* Overlay for mobile */}
        {isSidebarOpen && (
            <div
                className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
                onClick={() => setIsSidebarOpen(false)}
            />
        )}

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back, {user?.firstName || 'User'}!
              </h1>
              <p className="text-gray-600 mt-2">
                Sponsorship Number: <span className="font-semibold text-indigo-600">{user?.sponsorshipNumber || 'N/A'}</span>
              </p>
            </div>

            {/* Stats Grid - Only show on overview tab */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  {stats.map((stat, index) => (
                      <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                            <p className="text-sm text-green-600 mt-1">{stat.change}</p>
                          </div>
                          <div className={`${stat.color} p-3 rounded-lg`}>
                            <stat.icon className="h-6 w-6 text-white" />
                          </div>
                        </div>
                      </div>
                  ))}
                </div>
            )}

            {/* Tab Content */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-6">
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* Recent Activities */}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activities</h3>
                        <div className="space-y-4">
                          {recentActivities.length > 0 ? (
                              recentActivities.map((activity) => {
                                const ActivityIcon = getActivityIcon(activity.type);
                                return (
                                    <div key={activity.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                                      <div className="bg-indigo-100 p-2 rounded-full">
                                        <ActivityIcon className="h-4 w-4 text-indigo-600" />
                                      </div>
                                      <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">
                                          {activity.message}
                                          {activity.amount && `: $${activity.amount}`}
                                        </p>
                                        <p className="text-xs text-gray-500">{formatTimeAgo(activity.timestamp)}</p>
                                      </div>
                                    </div>
                                );
                              })
                          ) : (
                              <p className="text-gray-500 text-center py-4">No recent activities</p>
                          )}
                        </div>
                      </div>

                      {/* Quick Actions */}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                        <div className="space-y-3">
                          <button
                              onClick={handleInviteMembers}
                              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2"
                          >
                            <Send className="h-4 w-4" />
                            <span>Invite New Members</span>
                          </button>
                          <button
                              onClick={handleViewEarningsReport}
                              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                          >
                            <Download className="h-4 w-4" />
                            <span>View Earnings Report</span>
                          </button>
                          <button
                              onClick={handleUpgradePlan}
                              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center space-x-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span>Upgrade Plan</span>
                          </button>
                        </div>
                      </div>
                    </div>
                )}

                {activeTab === 'network' && (
                    <div>
                      {/* FIXED: Now uses the new MyNetwork component */}
                      <MyNetwork userId={user?.id || ''} />
                    </div>
                )}

                {activeTab === 'transactions' && (
                    <div>
                      <TransactionsDashboard />
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div>
                      <DailyTasksDashboard />
                    </div>
                )}

                {activeTab === 'interactions' && (
                    <div>
                      <CouponInteractionsList />
                    </div>
                )}

                {activeTab === 'earnings' && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Earnings Summary</h3>
                      <div className="bg-gradient-to-r from-green-500 to-blue-600 text-white p-6 rounded-lg mb-6">
                        <h4 className="text-lg font-semibold">Total Earnings</h4>
                        <p className="text-3xl font-bold mt-2">{earningsData.totalEarnings.toLocaleString()} USDT</p>
                        <p className="text-green-100 mt-1">+{earningsData.growthPercentage}% from last month</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h5 className="font-semibold text-gray-900">This Month</h5>
                          <p className="text-xl font-bold text-gray-700 mt-1">{earningsData.monthlyEarnings.toLocaleString()} USDT</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h5 className="font-semibold text-gray-900">Commission Rate</h5>
                          <p className="text-xl font-bold text-gray-700 mt-1">{earningsData.commissionRate}%</p>
                        </div>
                      </div>
                    </div>
                )}

                {activeTab === 'referrals' && (
                    <div>
                      <ReferralLinkGenerator />
                    </div>
                )}

                {activeTab === 'wallets' && (
                    <div>
                      <WalletList userId={user?.id || ''} />
                    </div>
                )}

                {activeTab === 'payments' && (
                    <div>
                      <PaymentHistory userId={user?.id || ''} />
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default CustomerDashboard;