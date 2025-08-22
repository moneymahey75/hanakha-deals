import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import {
  CreditCard,
  Plus,
  Edit,
  Trash2,
  Eye,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Calendar,
  Users,
  TrendingUp,
  Package,
  Settings,
  Filter,
  Search,
  RefreshCw
} from 'lucide-react';

interface SubscriptionPlan {
  tsp_id: string;
  tsp_name: string;
  tsp_description: string;
  tsp_price: number;
  tsp_duration_days: number;
  tsp_features: string[];
  tsp_is_active: boolean;
  tsp_created_at: string;
  tsp_updated_at: string;
}

interface UserSubscription {
  tus_id: string;
  tus_user_id: string;
  tus_plan_id: string;
  tus_status: 'active' | 'expired' | 'cancelled';
  tus_start_date: string;
  tus_end_date: string;
  tus_payment_amount: number;
  tus_created_at: string;
  user_info?: {
    email: string;
    first_name: string;
    last_name: string;
  };
  plan_info?: {
    name: string;
  };
}

const SubscriptionManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'plans' | 'subscriptions'>('plans');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const notification = useNotification();

  const [newPlan, setNewPlan] = useState({
    name: '',
    description: '',
    price: 0,
    duration_days: 30,
    features: [''],
    is_active: true
  });

  useEffect(() => {
    console.log('🔄 SubscriptionManagement useEffect triggered, activeTab:', activeTab);
    console.log('🔄 Loading data for tab:', activeTab);
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    console.log('📊 loadData called for tab:', activeTab);
    setLoading(true);
    try {
      if (activeTab === 'plans') {
        console.log('📋 Loading plans...');
        await loadPlans();
      } else {
        console.log('👥 Loading subscriptions...');
        await loadSubscriptions();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      notification.showError('Load Failed', 'Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      console.log('🔍 Loading subscription plans from database...');
      
      const { data, error } = await supabase
        .from('tbl_subscription_plans')
        .select('*')
        .order('tsp_created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to load plans:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }
      
      console.log('✅ Plans loaded successfully:', data?.length || 0, 'plans');
      console.log('Plans data:', data);
      setPlans(data || []);
    } catch (error) {
      console.error('Failed to load plans:', error);
      notification.showError('Load Failed', 'Failed to load subscription plans from database');
      setPlans([]);
    }
  };

  const loadSubscriptions = async () => {
    try {
      console.log('🔍 Loading user subscriptions from database...');
      
      const { data, error } = await supabase
        .from('tbl_user_subscriptions')
        .select(`
          *,
          tbl_users!inner(tu_email),
          tbl_user_profiles(tup_first_name, tup_last_name),
          tbl_subscription_plans(tsp_name)
        `)
        .order('tus_created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to load subscriptions:', error);
        throw error;
      }
      
      console.log('✅ Subscriptions loaded:', data);
      
      const formattedSubscriptions = (data || []).map(sub => ({
        ...sub,
        user_info: {
          email: sub.tbl_users?.tu_email || '',
          first_name: sub.tbl_user_profiles?.tup_first_name || '',
          last_name: sub.tbl_user_profiles?.tup_last_name || ''
        },
        plan_info: {
          name: sub.tbl_subscription_plans?.tsp_name || ''
        }
      }));

      setSubscriptions(formattedSubscriptions);
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
      notification.showError('Load Failed', 'Failed to load user subscriptions from database');
      setSubscriptions([]);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .insert({
          tsp_name: newPlan.name,
          tsp_description: newPlan.description,
          tsp_price: newPlan.price,
          tsp_duration_days: newPlan.duration_days,
          tsp_features: newPlan.features.filter(f => f.trim() !== ''),
          tsp_is_active: newPlan.is_active
        });

      if (error) throw error;

      notification.showSuccess('Plan Created', 'Subscription plan created successfully');
      setShowCreatePlanModal(false);
      resetNewPlan();
      loadPlans();
    } catch (error) {
      console.error('Failed to create plan:', error);
      notification.showError('Creation Failed', 'Failed to create subscription plan');
    }
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    try {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .update({
          tsp_name: newPlan.name,
          tsp_description: newPlan.description,
          tsp_price: newPlan.price,
          tsp_duration_days: newPlan.duration_days,
          tsp_features: newPlan.features.filter(f => f.trim() !== ''),
          tsp_is_active: newPlan.is_active
        })
        .eq('tsp_id', selectedPlan.tsp_id);

      if (error) throw error;

      notification.showSuccess('Plan Updated', 'Subscription plan updated successfully');
      setShowEditPlanModal(false);
      setSelectedPlan(null);
      resetNewPlan();
      loadPlans();
    } catch (error) {
      console.error('Failed to update plan:', error);
      notification.showError('Update Failed', 'Failed to update subscription plan');
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .delete()
        .eq('tsp_id', planId);

      if (error) throw error;

      notification.showSuccess('Plan Deleted', 'Subscription plan deleted successfully');
      loadPlans();
    } catch (error) {
      console.error('Failed to delete plan:', error);
      notification.showError('Deletion Failed', 'Failed to delete subscription plan');
    }
  };

  const handleTogglePlanStatus = async (planId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .update({ tsp_is_active: !currentStatus })
        .eq('tsp_id', planId);

      if (error) throw error;

      notification.showSuccess(
        'Status Updated',
        `Plan ${!currentStatus ? 'activated' : 'deactivated'} successfully`
      );
      loadPlans();
    } catch (error) {
      console.error('Failed to toggle plan status:', error);
      notification.showError('Update Failed', 'Failed to update plan status');
    }
  };

  const resetNewPlan = () => {
    setNewPlan({
      name: '',
      description: '',
      price: 0,
      duration_days: 30,
      features: [''],
      is_active: true
    });
  };

  const addFeature = () => {
    setNewPlan(prev => ({
      ...prev,
      features: [...prev.features, '']
    }));
  };

  const removeFeature = (index: number) => {
    setNewPlan(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  const updateFeature = (index: number, value: string) => {
    setNewPlan(prev => ({
      ...prev,
      features: prev.features.map((feature, i) => i === index ? value : feature)
    }));
  };

  const openEditModal = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setNewPlan({
      name: plan.tsp_name,
      description: plan.tsp_description,
      price: plan.tsp_price,
      duration_days: plan.tsp_duration_days,
      features: plan.tsp_features.length > 0 ? plan.tsp_features : [''],
      is_active: plan.tsp_is_active
    });
    setShowEditPlanModal(true);
  };

  const filteredPlans = plans.filter(plan =>
    plan.tsp_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.tsp_description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSubscriptions = subscriptions.filter(sub => {
    const matchesSearch = 
      sub.user_info?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user_info?.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.user_info?.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.plan_info?.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' || sub.tus_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getSubscriptionStats = () => {
    const total = subscriptions.length;
    const active = subscriptions.filter(s => s.tus_status === 'active').length;
    const expired = subscriptions.filter(s => s.tus_status === 'expired').length;
    const cancelled = subscriptions.filter(s => s.tus_status === 'cancelled').length;
    const totalRevenue = subscriptions
      .filter(s => s.tus_status === 'active')
      .reduce((sum, s) => sum + s.tus_payment_amount, 0);

    return { total, active, expired, cancelled, totalRevenue };
  };

  const stats = getSubscriptionStats();

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
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
            <div className="bg-purple-100 p-3 rounded-lg">
              <CreditCard className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Subscription Management</h3>
              <p className="text-gray-600">Manage subscription plans and user subscriptions</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={loadData}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {activeTab === 'plans' && (
              <button
                onClick={() => setShowCreatePlanModal(true)}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Plan</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {[
              { id: 'plans', label: 'Subscription Plans', icon: Package },
              { id: 'subscriptions', label: 'User Subscriptions', icon: Users }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'plans' | 'subscriptions')}
                className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Search and Filters */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder={activeTab === 'plans' ? 'Search plans...' : 'Search subscriptions...'}
              />
            </div>
          </div>
          {activeTab === 'subscriptions' && (
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          )}
          <div>
            <button
              onClick={loadData}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats for Subscriptions */}
      {activeTab === 'subscriptions' && (
        <div className="p-6 bg-purple-50 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Subscriptions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.expired}</div>
              <div className="text-sm text-gray-600">Expired</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.cancelled}</div>
              <div className="text-sm text-gray-600">Cancelled</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">${stats.totalRevenue.toFixed(2)}</div>
              <div className="text-sm text-gray-600">Active Revenue</div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading {activeTab === 'plans' ? 'subscription plans' : 'user subscriptions'}...</p>
          </div>
        )}
        
        {/* Error State */}
        {!loading && plans.length === 0 && activeTab === 'plans' && (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Subscription Plans Found</h3>
            <p className="text-gray-600 mb-6">
              Either no plans exist in the database or there's a connection issue.
            </p>
            <div className="space-y-3">
              <button
                onClick={loadData}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 mx-auto"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry Loading</span>
              </button>
              <button
                onClick={() => setShowCreatePlanModal(true)}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Create First Plan</span>
              </button>
            </div>
          </div>
        )}
        
        {/* Content when data is loaded */}
        {!loading && (
          activeTab === 'plans' ? (
            <div>
              {/* Debug Info */}
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 mb-2">Debug Information</h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>Total plans in database: {plans.length}</p>
                  <p>Filtered plans: {filteredPlans.length}</p>
                  <p>Search term: "{searchTerm}"</p>
                  <p>Loading state: {loading ? 'Loading...' : 'Loaded'}</p>
                </div>
              </div>
              
              <PlansTab
                plans={filteredPlans}
                onEdit={openEditModal}
                onDelete={handleDeletePlan}
                onToggleStatus={handleTogglePlanStatus}
              />
            </div>
          ) : (
            <div>
              {/* Debug Info */}
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="text-sm font-medium text-green-800 mb-2">Debug Information</h4>
                <div className="text-sm text-green-700 space-y-1">
                  <p>Total subscriptions in database: {subscriptions.length}</p>
                  <p>Filtered subscriptions: {filteredSubscriptions.length}</p>
                  <p>Search term: "{searchTerm}"</p>
                  <p>Status filter: {statusFilter}</p>
                </div>
              </div>
              
              <SubscriptionsTab
                subscriptions={filteredSubscriptions}
              />
            </div>
          )
        )}
      </div>

      {/* Create Plan Modal */}
      {showCreatePlanModal && (
        <PlanModal
          title="Create New Plan"
          plan={newPlan}
          setPlan={setNewPlan}
          onSubmit={handleCreatePlan}
          onClose={() => {
            setShowCreatePlanModal(false);
            resetNewPlan();
          }}
          addFeature={addFeature}
          removeFeature={removeFeature}
          updateFeature={updateFeature}
        />
      )}

      {/* Edit Plan Modal */}
      {showEditPlanModal && selectedPlan && (
        <PlanModal
          title="Edit Plan"
          plan={newPlan}
          setPlan={setNewPlan}
          onSubmit={handleUpdatePlan}
          onClose={() => {
            setShowEditPlanModal(false);
            setSelectedPlan(null);
            resetNewPlan();
          }}
          addFeature={addFeature}
          removeFeature={removeFeature}
          updateFeature={updateFeature}
        />
      )}
    </div>
  );
};

// Plans Tab Component
const PlansTab: React.FC<{
  plans: SubscriptionPlan[];
  onEdit: (plan: SubscriptionPlan) => void;
  onDelete: (planId: string) => void;
  onToggleStatus: (planId: string, currentStatus: boolean) => void;
}> = ({ plans, onEdit, onDelete, onToggleStatus }) => {
  console.log('📋 PlansTab rendering with plans:', plans);
  
  if (plans.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No subscription plans found</h3>
        <p className="text-gray-600 mb-4">
          {plans.length === 0 ? 'No plans exist in the database.' : 'No plans match your search criteria.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 mx-auto"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Refresh Page</span>
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {plans.map((plan) => (
        <div key={plan.tsp_id} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900">{plan.tsp_name}</h4>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              plan.tsp_is_active
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {plan.tsp_is_active ? 'Active' : 'Inactive'}
            </span>
          </div>

          <div className="mb-4">
            <div className="text-3xl font-bold text-gray-900 mb-1">
              ${plan.tsp_price}
            </div>
            <div className="text-sm text-gray-600">
              {plan.tsp_duration_days} days subscription
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4">{plan.tsp_description}</p>

          <div className="mb-6">
            <h5 className="text-sm font-medium text-gray-900 mb-2">Features:</h5>
            <ul className="space-y-1">
              {plan.tsp_features.map((feature, index) => (
                <li key={index} className="flex items-center text-sm text-gray-600">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => onEdit(plan)}
              className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-1"
            >
              <Edit className="h-4 w-4" />
              <span>Edit</span>
            </button>
            <button
              onClick={() => onToggleStatus(plan.tsp_id, plan.tsp_is_active)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-1 ${
                plan.tsp_is_active
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>{plan.tsp_is_active ? 'Disable' : 'Enable'}</span>
            </button>
            <button
              onClick={() => onDelete(plan.tsp_id)}
              className="bg-red-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Subscriptions Tab Component
const SubscriptionsTab: React.FC<{
  subscriptions: UserSubscription[];
}> = ({ subscriptions }) => {
  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No subscriptions found</h3>
        <p className="text-gray-600">No user subscriptions match your search criteria.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Plan
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Period
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {subscriptions.map((subscription) => (
            <tr key={subscription.tus_id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="flex-shrink-0 h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center">
                      <span className="text-white font-medium text-sm">
                        {subscription.user_info?.first_name?.charAt(0) || 'U'}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">
                      {subscription.user_info?.first_name} {subscription.user_info?.last_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {subscription.user_info?.email}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {subscription.plan_info?.name}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {subscription.tus_payment_amount} USDT
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  subscription.tus_status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : subscription.tus_status === 'expired'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {subscription.tus_status === 'active' && <CheckCircle className="h-3 w-3 mr-1" />}
                  {subscription.tus_status === 'expired' && <AlertCircle className="h-3 w-3 mr-1" />}
                  {subscription.tus_status === 'cancelled' && <X className="h-3 w-3 mr-1" />}
                  {subscription.tus_status.charAt(0).toUpperCase() + subscription.tus_status.slice(1)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  <div>
                    <div>{new Date(subscription.tus_start_date).toLocaleDateString()}</div>
                    <div className="text-xs">to {new Date(subscription.tus_end_date).toLocaleDateString()}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
                  <button
                    className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                    title="View Details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                    title="Extend Subscription"
                  >
                    <Calendar className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Plan Modal Component
const PlanModal: React.FC<{
  title: string;
  plan: any;
  setPlan: (plan: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  addFeature: () => void;
  removeFeature: (index: number) => void;
  updateFeature: (index: number, value: string) => void;
}> = ({ title, plan, setPlan, onSubmit, onClose, addFeature, removeFeature, updateFeature }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Plan Name *
              </label>
              <input
                type="text"
                required
                value={plan.name}
                onChange={(e) => setPlan(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="e.g., Premium Plan"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price (USD) *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={plan.price}
                  onChange={(e) => setPlan(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="99.00"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={plan.description}
              onChange={(e) => setPlan(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Describe what this plan includes..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration (Days) *
            </label>
            <input
              type="number"
              required
              min="1"
              value={plan.duration_days}
              onChange={(e) => setPlan(prev => ({ ...prev, duration_days: parseInt(e.target.value) || 30 }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="30"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Features
            </label>
            <div className="space-y-3">
              {plan.features.map((feature: string, index: number) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={feature}
                    onChange={(e) => updateFeature(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter feature description"
                  />
                  {plan.features.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeFeature(index)}
                      className="text-red-600 hover:text-red-800 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addFeature}
                className="text-purple-600 hover:text-purple-800 text-sm font-medium flex items-center space-x-1"
              >
                <Plus className="h-4 w-4" />
                <span>Add Feature</span>
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={plan.is_active}
              onChange={(e) => setPlan(prev => ({ ...prev, is_active: e.target.checked }))}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
              Plan is active and available for purchase
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{title.includes('Create') ? 'Create Plan' : 'Update Plan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubscriptionManagement;