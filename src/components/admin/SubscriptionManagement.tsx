import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import {
  CreditCard,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Calendar,
  Package,
  UserPlus,
  TrendingUp
} from 'lucide-react';

interface SubscriptionPlan {
  tsp_id: string;
  tsp_name: string;
  tsp_description: string;
  tsp_price: number;
  tsp_duration_days: number;
  tsp_features: any;
  tsp_is_active: boolean;
  tsp_type: 'registration' | 'upgrade';
  tsp_created_at: string;
  tsp_updated_at: string;
}

const SubscriptionManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'registration' | 'upgrade'>('registration');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const notification = useNotification();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    duration_days: '30',
    features: [''],
    is_active: true
  });

  useEffect(() => {
    loadPlans();
  }, [activeTab]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tbl_subscription_plans')
        .select('*')
        .eq('tsp_type', activeTab)
        .order('tsp_created_at', { ascending: false });

      if (error) throw error;
      setPlans(data || []);
    } catch (error: any) {
      notification.showError('Load Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    try {
      const features = formData.features.filter(f => f.trim() !== '');
      const featuresObj: any = {};
      features.forEach(feature => {
        const key = feature.toLowerCase().replace(/\s+/g, '_');
        featuresObj[key] = true;
      });

      const { error } = await supabase
        .from('tbl_subscription_plans')
        .insert({
          tsp_name: formData.name,
          tsp_description: formData.description,
          tsp_price: parseFloat(formData.price),
          tsp_duration_days: parseInt(formData.duration_days),
          tsp_features: featuresObj,
          tsp_is_active: formData.is_active,
          tsp_type: activeTab
        });

      if (error) throw error;

      notification.showSuccess('Success', `${activeTab === 'registration' ? 'Registration' : 'Upgrade'} plan created`);
      setShowCreateModal(false);
      resetForm();
      loadPlans();
    } catch (error: any) {
      notification.showError('Creation Failed', error.message);
    }
  };

  const handleUpdatePlan = async () => {
    if (!selectedPlan) return;

    try {
      const features = formData.features.filter(f => f.trim() !== '');
      const featuresObj: any = {};
      features.forEach(feature => {
        const key = feature.toLowerCase().replace(/\s+/g, '_');
        featuresObj[key] = true;
      });

      const { error } = await supabase
        .from('tbl_subscription_plans')
        .update({
          tsp_name: formData.name,
          tsp_description: formData.description,
          tsp_price: parseFloat(formData.price),
          tsp_duration_days: parseInt(formData.duration_days),
          tsp_features: featuresObj,
          tsp_is_active: formData.is_active
        })
        .eq('tsp_id', selectedPlan.tsp_id);

      if (error) throw error;

      notification.showSuccess('Success', 'Plan updated successfully');
      setShowEditModal(false);
      setSelectedPlan(null);
      resetForm();
      loadPlans();
    } catch (error: any) {
      notification.showError('Update Failed', error.message);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .delete()
        .eq('tsp_id', planId);

      if (error) throw error;

      notification.showSuccess('Success', 'Plan deleted successfully');
      loadPlans();
    } catch (error: any) {
      notification.showError('Deletion Failed', error.message);
    }
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    try {
      const { error } = await supabase
        .from('tbl_subscription_plans')
        .update({ tsp_is_active: !plan.tsp_is_active })
        .eq('tsp_id', plan.tsp_id);

      if (error) throw error;

      notification.showSuccess('Success', `Plan ${!plan.tsp_is_active ? 'activated' : 'deactivated'}`);
      loadPlans();
    } catch (error: any) {
      notification.showError('Update Failed', error.message);
    }
  };

  const openEditModal = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    const featuresArray = typeof plan.tsp_features === 'object'
      ? Object.keys(plan.tsp_features).map(k => k.replace(/_/g, ' '))
      : [''];

    setFormData({
      name: plan.tsp_name,
      description: plan.tsp_description || '',
      price: plan.tsp_price.toString(),
      duration_days: plan.tsp_duration_days.toString(),
      features: featuresArray.length > 0 ? featuresArray : [''],
      is_active: plan.tsp_is_active
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      duration_days: '30',
      features: [''],
      is_active: true
    });
  };

  const addFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ''] });
  };

  const updateFeature = (index: number, value: string) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  const removeFeature = (index: number) => {
    const newFeatures = formData.features.filter((_, i) => i !== index);
    setFormData({ ...formData, features: newFeatures.length > 0 ? newFeatures : [''] });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Subscription Plans Management</h2>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('registration')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'registration'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <UserPlus className="h-5 w-5" />
              <span>Registration Plans</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('upgrade')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'upgrade'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Upgrade Plans</span>
            </div>
          </button>
        </nav>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          <span>Create {activeTab === 'registration' ? 'Registration' : 'Upgrade'} Plan</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : plans.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Plans Found</h3>
          <p className="text-gray-500">Create your first {activeTab} plan to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div key={plan.tsp_id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{plan.tsp_name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{plan.tsp_description}</p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  plan.tsp_is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {plan.tsp_is_active ? 'Active' : 'Inactive'}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center text-gray-600">
                  <DollarSign className="h-5 w-5 mr-2" />
                  <span className="text-2xl font-bold text-gray-900">${plan.tsp_price}</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <Calendar className="h-5 w-5 mr-2" />
                  <span>{plan.tsp_duration_days} days</span>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Features:</h4>
                <ul className="space-y-1">
                  {typeof plan.tsp_features === 'object' && Object.keys(plan.tsp_features).map((key, idx) => (
                    <li key={idx} className="flex items-center text-sm text-gray-600">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                      <span>{key.replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => openEditModal(plan)}
                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                >
                  <Edit className="h-4 w-4" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => handleToggleActive(plan)}
                  className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                >
                  {plan.tsp_is_active ? <X className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                  <span>{plan.tsp_is_active ? 'Deactivate' : 'Activate'}</span>
                </button>
                <button
                  onClick={() => handleDeletePlan(plan.tsp_id)}
                  className="px-3 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">
                {showEditModal ? 'Edit' : 'Create'} {activeTab === 'registration' ? 'Registration' : 'Upgrade'} Plan
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Premium Plan"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Describe the plan benefits"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Days)</label>
                  <input
                    type="number"
                    value={formData.duration_days}
                    onChange={(e) => setFormData({ ...formData, duration_days: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Features</label>
                <div className="space-y-2">
                  {formData.features.map((feature, index) => (
                    <div key={index} className="flex space-x-2">
                      <input
                        type="text"
                        value={feature}
                        onChange={(e) => updateFeature(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Feature name"
                      />
                      <button
                        onClick={() => removeFeature(index)}
                        className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addFeature}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-5 w-5" />
                    <span>Add Feature</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">Active (visible to users)</label>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedPlan(null);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={showEditModal ? handleUpdatePlan : handleCreatePlan}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="h-5 w-5" />
                <span>{showEditModal ? 'Update' : 'Create'} Plan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionManagement;
