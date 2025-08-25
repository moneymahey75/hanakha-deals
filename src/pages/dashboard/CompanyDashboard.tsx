import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import CompanyCouponManagement from '../../components/company/CompanyCouponManagement';
import { 
  Building, 
  Users, 
  TrendingUp, 
  DollarSign,
  BarChart3,
  FileText,
  Settings,
  Globe,
  Gift
} from 'lucide-react';

const CompanyDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const stats = [
    {
      title: 'Total Customers',
      value: '2,847',
      icon: Users,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      title: 'Monthly Revenue',
      value: '$45,230',
      icon: DollarSign,
      color: 'bg-green-500',
      change: '+8%'
    },
    {
      title: 'Active Campaigns',
      value: '12',
      icon: TrendingUp,
      color: 'bg-purple-500',
      change: '+3'
    },
    {
      title: 'Conversion Rate',
      value: '3.2%',
      icon: BarChart3,
      color: 'bg-yellow-500',
      change: '+0.5%'
    }
  ];

  const recentActivities = [
    {
      type: 'customer',
      message: 'New customer registration',
      time: '2 hours ago',
      icon: Users
    },
    {
      type: 'payment',
      message: 'Payment received: $299',
      time: '4 hours ago',
      icon: DollarSign
    },
    {
      type: 'campaign',
      message: 'Marketing campaign launched',
      time: '1 day ago',
      icon: TrendingUp
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome, {user?.companyName || user?.firstName}!
          </h1>
          <p className="text-gray-600 mt-2">
            Company Dashboard - Manage your MLM business operations
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
                { id: 'customers', label: 'Customers', icon: Users },
                { id: 'coupons', label: 'My Coupons', icon: Gift },
                { id: 'campaigns', label: 'Campaigns', icon: TrendingUp },
                { id: 'reports', label: 'Reports', icon: FileText },
                { id: 'settings', label: 'Settings', icon: Settings }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
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
                        <div className="bg-green-100 p-2 rounded-full">
                          <activity.icon className="h-4 w-4 text-green-600" />
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
                    <button className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors">
                      Create New Campaign
                    </button>
                    <button className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                      View Customer Analytics
                    </button>
                    <button className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                      Generate Reports
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Management</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-blue-50 p-6 rounded-lg">
                    <h4 className="font-semibold text-blue-900">New Customers</h4>
                    <p className="text-2xl font-bold text-blue-600 mt-2">147</p>
                    <p className="text-sm text-blue-600 mt-1">This month</p>
                  </div>
                  <div className="bg-green-50 p-6 rounded-lg">
                    <h4 className="font-semibold text-green-900">Active Customers</h4>
                    <p className="text-2xl font-bold text-green-600 mt-2">2,847</p>
                    <p className="text-sm text-green-600 mt-1">Total active</p>
                  </div>
                  <div className="bg-yellow-50 p-6 rounded-lg">
                    <h4 className="font-semibold text-yellow-900">Retention Rate</h4>
                    <p className="text-2xl font-bold text-yellow-600 mt-2">89%</p>
                    <p className="text-sm text-yellow-600 mt-1">Last 30 days</p>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-600">Customer list and management tools will be displayed here.</p>
                </div>
              </div>
            )}

            {activeTab === 'coupons' && (
              <div>
                <CompanyCouponManagement />
              </div>
            )}

            {activeTab === 'campaigns' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Marketing Campaigns</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900">Summer Promotion</h4>
                    <p className="text-sm text-gray-600 mt-2">Active campaign with 25% discount</p>
                    <div className="mt-4">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>75%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div className="bg-green-600 h-2 rounded-full" style={{ width: '75%' }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900">Referral Bonus</h4>
                    <p className="text-sm text-gray-600 mt-2">Ongoing referral incentive program</p>
                    <div className="mt-4">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>60%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '60%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Reports</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-6 rounded-lg">
                    <h4 className="text-lg font-semibold">Revenue Report</h4>
                    <p className="text-3xl font-bold mt-2">45,230 USDT</p>
                    <p className="text-blue-100 mt-1">Monthly revenue</p>
                  </div>
                  <div className="bg-gradient-to-r from-green-500 to-teal-600 text-white p-6 rounded-lg">
                    <h4 className="text-lg font-semibold">Growth Rate</h4>
                    <p className="text-3xl font-bold mt-2">+12%</p>
                    <p className="text-green-100 mt-1">Month over month</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Settings</h3>
                <div className="space-y-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Company Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                        <input
                          type="text"
                          value={user?.companyName || ''}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                        <input
                          type="email"
                          value={user?.email || ''}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          readOnly
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Notification Preferences</h4>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600 focus:ring-green-500" defaultChecked />
                        <span className="ml-2 text-sm text-gray-700">Email notifications for new customers</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600 focus:ring-green-500" defaultChecked />
                        <span className="ml-2 text-sm text-gray-700">SMS alerts for important updates</span>
                      </label>
                      <label className="flex items-center">
                        <input type="checkbox" className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                        <span className="ml-2 text-sm text-gray-700">Weekly performance reports</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyDashboard;