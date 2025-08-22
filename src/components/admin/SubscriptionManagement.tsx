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
              <p className="text-gray-600