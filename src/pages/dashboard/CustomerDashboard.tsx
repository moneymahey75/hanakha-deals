import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMLM } from '../../contexts/MLMContext';
import BinaryTreeVisualizer from '../../components/mlm/BinaryTreeVisualizer';
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
  FileText,
  CheckSquare,
  ExternalLink,
  Send,
  Download,
  Menu,
  X,
  Home,
  Network,
  GitBranch,
  CreditCard,
  Ticket,
  Share2,
  Wallet as WalletIcon,
  Bell,
  HelpCircle
} from 'lucide-react';

// Define interfaces for the data we expect from the API
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

  // Navigation items
  const navigationItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'network', label: 'My Network', icon: Users },
    { id: 'tree', label: 'Binary Tree', icon: GitBranch },
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'tasks', label: 'Daily Tasks', icon: CheckSquare },
    { id: 'interactions', label: 'My Coupons', icon: Ticket },
    { id: 'wallets', label: 'My Wallets', icon: WalletIcon },
    { id: 'payments', label: 'Payment History', icon: CreditCard },
    { id: 'earnings', label: 'Earnings', icon: DollarSign },
    { id: 'referrals', label: 'Referral Links', icon: Share2 },
    // { id: 'settings', label: 'Settings', icon: Settings },
    // { id: 'help', label: 'Help & Support', icon: HelpCircle }
  ];

  // Load all dashboard data
  useEffect(() => {
    if (user?.id) {
      loadDashboardData();
    }
  }, [user?.id]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load tree data
      await loadTreeData(user!.id);

      // Load all data in parallel
      await Promise.all([
        loadTreeStats(),
        loadRecentActivities(),
        loadEarningsData()
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      notification.showError('Error', 'Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTreeStats = async () => {
    if (user?.id) {
      try {
        const stats = await getTreeStats(user.id);
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
        console.error('Failed to load tree stats:', error);
      }
    }
  };

  const loadRecentActivities = async () => {
    try {
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
    } catch (error) {
      console.error('Failed to load recent activities:', error);
    }
  };

  const loadEarningsData = async () => {
    try {
      // Simulate API call - replace with actual API endpoint
      const earnings: EarningsData = {
        totalEarnings: 12450,
        monthlyEarnings: 2450,
        commissionRate: 12,
        growthPercentage: 15
      };
      setEarningsData(earnings);
    } catch (error) {
      console.error('Failed to load earnings data:', error);
    }
  };

  const handleInviteMembers = () => {
    // Navigate to referral links tab
    setActiveTab('referrals');
    notification.showInfo('Invite Members', 'Use your referral links to invite new members!');
  };

  const handleViewEarningsReport = () => {
    // Navigate to earnings tab
    setActiveTab('earnings');
  };

  const handleUpgradePlan = () => {
    // Navigate to upgrade page (would be implemented elsewhere)
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

  if (loading) {
    return (
        <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="text-gray-500 mt-4">Loading dashboard...</p>
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
              className="p-2 rounded-md bg-indigo-600 text-white"
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
                Welcome back, {user?.firstName}!
              </h1>
              <p className="text-gray-600 mt-2">
                Sponsorship Number: <span className="font-semibold text-indigo-600">{user?.sponsorshipNumber}</span>
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
                          {recentActivities.map((activity) => {
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
                          })}
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
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Network Overview</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                        <div className="bg-blue-50 p-6 rounded-lg">
                          <h4 className="font-semibold text-blue-900">Direct Referrals</h4>
                          <p className="text-2xl font-bold text-blue-600 mt-2">{dashboardStats.directReferrals}</p>
                        </div>
                        <div className="bg-green-50 p-6 rounded-lg">
                          <h4 className="font-semibold text-green-900">Total Network</h4>
                          <p className="text-2xl font-bold text-green-600 mt-2">{dashboardStats.totalDownline}</p>
                        </div>
                        <div className="bg-purple-50 p-6 rounded-lg">
                          <h4 className="font-semibold text-purple-900">Left Side</h4>
                          <p className="text-2xl font-bold text-purple-600 mt-2">{dashboardStats.leftSideCount}</p>
                        </div>
                        <div className="bg-yellow-50 p-6 rounded-lg">
                          <h4 className="font-semibold text-yellow-900">Right Side</h4>
                          <p className="text-2xl font-bold text-yellow-600 mt-2">{dashboardStats.rightSideCount}</p>
                        </div>
                      </div>

                      {/* Network Balance */}
                      <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h4 className="font-semibold text-gray-900 mb-4">Network Balance</h4>
                        <div className="flex items-center space-x-4">
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span>Left Side</span>
                              <span>{dashboardStats.leftSideCount} members</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{
                                    width: `${dashboardStats.totalDownline > 0 ? (dashboardStats.leftSideCount / dashboardStats.totalDownline) * 100 : 0}%`
                                  }}
                              ></div>
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span>Right Side</span>
                              <span>{dashboardStats.rightSideCount} members</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                  className="bg-green-600 h-2 rounded-full"
                                  style={{
                                    width: `${dashboardStats.totalDownline > 0 ? (dashboardStats.rightSideCount / dashboardStats.totalDownline) * 100 : 0}%`
                                  }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                )}

                {activeTab === 'tree' && (
                    <div>
                      {treeLoading ? (
                          <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                            <p className="text-gray-500 mt-2">Loading tree data...</p>
                          </div>
                      ) : (
                          <BinaryTreeVisualizer
                              userId={user?.id || ''}
                              treeData={treeData}
                              showStats={true}
                          />
                      )}
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

                {/*{activeTab === 'notifications' && (*/}
                {/*    <div>*/}
                {/*      <h3 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h3>*/}
                {/*      <div className="text-center py-12 text-gray-500">*/}
                {/*        <Bell className="h-12 w-12 mx-auto text-gray-300 mb-4" />*/}
                {/*        <p>No new notifications</p>*/}
                {/*      </div>*/}
                {/*    </div>*/}
                {/*)}*/}

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

                {/*{activeTab === 'help' && (*/}
                {/*    <div>*/}
                {/*      <h3 className="text-lg font-semibold text-gray-900 mb-4">Help & Support</h3>*/}
                {/*      <div className="text-center py-12 text-gray-500">*/}
                {/*        <HelpCircle className="h-12 w-12 mx-auto text-gray-300 mb-4" />*/}
                {/*        <p>Help and support content will be implemented here</p>*/}
                {/*      </div>*/}
                {/*    </div>*/}
                {/*)}*/}

              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default CustomerDashboard;