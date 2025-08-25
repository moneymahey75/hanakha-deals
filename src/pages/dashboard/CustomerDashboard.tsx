import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMLM } from '../../contexts/MLMContext';
import BinaryTreeVisualizer from '../../components/mlm/BinaryTreeVisualizer';
import ReferralLinkGenerator from '../../components/mlm/ReferralLinkGenerator';
import WalletDashboard from '../../components/customer/WalletDashboard';
import { useNotification } from '../../components/ui/NotificationProvider';
import { 
  Users, 
  TrendingUp, 
  DollarSign, 
  Award,
  Eye,
  UserPlus,
  BarChart3,
  Calendar,
  Wallet
} from 'lucide-react';

const CustomerDashboard: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const notification = useNotification();
  const { treeData, loading: treeLoading, getUserPosition, getDownline, getUpline, getTreeStats, loadTreeData } = useMLM();
  const [activeTab, setActiveTab] = useState('overview');
  const [treeStats, setTreeStats] = useState({
    totalDownline: 0,
    leftSideCount: 0,
    rightSideCount: 0,
    directReferrals: 0,
    maxDepth: 0,
    activeMembers: 0
  });

  // Load tree data when component mounts
  React.useEffect(() => {
    if (user?.id) {
      loadTreeData(user.id);
      loadTreeStats();
    }
  }, [user?.id]);

  // Show payment success notification
  React.useEffect(() => {
    if (location.state?.paymentSuccess) {
      notification.showSuccess(
        'Payment Successful!', 
        `Your ${location.state.planName} subscription is now active. Welcome to your dashboard!`
      );
      // Clear the state to prevent showing notification again
      window.history.replaceState({}, document.title);
    }
  }, [location.state, notification]);
  const loadTreeStats = async () => {
    if (user?.id) {
      try {
        const stats = await getTreeStats(user.id);
        setTreeStats(stats);
      } catch (error) {
        console.error('Failed to load tree stats:', error);
      }
    }
  };

  const userPosition = getUserPosition(user?.id || '');
  const downline = getDownline(userPosition?.id || '');
  const upline = getUpline(userPosition?.id || '');

  const stats = [
    {
      title: 'Total Referrals',
      value: treeStats.totalDownline || downline.length,
      icon: Users,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      title: 'Monthly Earnings',
      value: '$2,450',
      icon: DollarSign,
      color: 'bg-green-500',
      change: '+8%'
    },
    {
      title: 'Current Level',
      value: userPosition?.level || treeStats.maxDepth || 0,
      icon: TrendingUp,
      color: 'bg-purple-500',
      change: 'Level up!'
    },
    {
      title: 'Achievement Points',
      value: '1,250',
      icon: Award,
      color: 'bg-yellow-500',
      change: '+15%'
    }
  ];

  const recentActivities = [
    {
      type: 'referral',
      message: 'New referral joined your network',
      time: '2 hours ago',
      icon: UserPlus
    },
    {
      type: 'earning',
      message: 'Commission earned: $125',
      time: '1 day ago',
      icon: DollarSign
    },
    {
      type: 'level',
      message: 'Congratulations! Level 3 achieved',
      time: '3 days ago',
      icon: Award
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.firstName}!
          </h1>
          <p className="text-gray-600 mt-2">
            Sponsorship Number: <span className="font-semibold text-indigo-600">{user?.sponsorshipNumber}</span>
          </p>
        </div>

        {/* Stats Grid */}
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

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-sm mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'network', label: 'My Network', icon: Users },
                { id: 'tree', label: 'Binary Tree', icon: Eye },
                { id: 'wallet', label: 'Wallet & Tasks', icon: Wallet },
                { id: 'earnings', label: 'Earnings', icon: DollarSign },
                { id: 'referrals', label: 'Referral Links', icon: Users }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recent Activities */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activities</h3>
                  <div className="space-y-4">
                    {recentActivities.map((activity, index) => (
                      <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <div className="bg-indigo-100 p-2 rounded-full">
                          <activity.icon className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                          <p className="text-xs text-gray-500">{activity.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                  <div className="space-y-3">
                    <button className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                      Invite New Members
                    </button>
                    <button className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors">
                      View Earnings Report
                    </button>
                    <button className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                      Upgrade Plan
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
                    <p className="text-2xl font-bold text-blue-600 mt-2">{treeStats.directReferrals || 0}</p>
                  </div>
                  <div className="bg-green-50 p-6 rounded-lg">
                    <h4 className="font-semibold text-green-900">Total Network</h4>
                    <p className="text-2xl font-bold text-green-600 mt-2">{treeStats.totalDownline || 0}</p>
                  </div>
                  <div className="bg-purple-50 p-6 rounded-lg">
                    <h4 className="font-semibold text-purple-900">Left Side</h4>
                    <p className="text-2xl font-bold text-purple-600 mt-2">{treeStats.leftSideCount || 0}</p>
                  </div>
                  <div className="bg-yellow-50 p-6 rounded-lg">
                    <h4 className="font-semibold text-yellow-900">Right Side</h4>
                    <p className="text-2xl font-bold text-yellow-600 mt-2">{treeStats.rightSideCount || 0}</p>
                  </div>
                </div>
                
                {/* Network Balance */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">Network Balance</h4>
                  <div className="flex items-center space-x-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Left Side</span>
                        <span>{treeStats?.leftSideCount || 0} members</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ 
                            width: `${treeStats.totalDownline > 0 ? (treeStats.leftSideCount / treeStats.totalDownline) * 100 : 0}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Right Side</span>
                        <span>{treeStats?.rightSideCount || 0} members</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ 
                            width: `${treeStats.totalDownline > 0 ? (treeStats.rightSideCount / treeStats.totalDownline) * 100 : 0}%` 
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

            {activeTab === 'wallet' && (
              <div>
                <WalletDashboard />
              </div>
            )}

            {activeTab === 'earnings' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Earnings Summary</h3>
                <div className="bg-gradient-to-r from-green-500 to-blue-600 text-white p-6 rounded-lg mb-6">
                  <h4 className="text-lg font-semibold">Total Earnings</h4>
                  <p className="text-3xl font-bold mt-2">12,450 USDT</p>
                  <p className="text-green-100 mt-1">+15% from last month</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-semibold text-gray-900">This Month</h5>
                    <p className="text-xl font-bold text-gray-700 mt-1">2,450 USDT</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-semibold text-gray-900">Commission Rate</h5>
                    <p className="text-xl font-bold text-gray-700 mt-1">12%</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'referrals' && (
              <div>
                <ReferralLinkGenerator />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;