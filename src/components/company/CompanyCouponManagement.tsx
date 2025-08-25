import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';
import {
  Gift,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  Image,
  Save,
  X,
  Upload,
  Tag,
  Percent,
  Users,
  TrendingUp
} from 'lucide-react';

interface Coupon {
  tc_id: string;
  tc_title: string;
  tc_description?: string;
  tc_coupon_code: string;
  tc_discount_type: 'percentage' | 'fixed_amount';
  tc_discount_value: number;
  tc_image_url?: string;
  tc_terms_conditions?: string;
  tc_valid_from: string;
  tc_valid_until: string;
  tc_usage_limit: number;
  tc_used_count: number;
  tc_share_reward_amount: number;
  tc_status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired';
  tc_is_active: boolean;
  tc_created_at: string;
  tc_updated_at: string;
}

const CompanyCouponManagement: React.FC = () => {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const notification = useNotification();

  const [newCoupon, setNewCoupon] = useState({
    title: '',
    description: '',
    coupon_code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed_amount',
    discount_value: 0,
    image_url: '',
    terms_conditions: '',
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    usage_limit: 1000,
    share_reward_amount: 0.5,
    is_active: true
  });

  useEffect(() => {
    if (user?.id) {
      loadCoupons();
    }
  }, [user?.id]);

  const loadCoupons = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      console.log('🔍 Loading company coupons...');

      const { data, error } = await supabase
        .from('tbl_coupons')
        .select('*')
        .eq('tc_created_by', user.id)
        .order('tc_created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to load coupons:', error);
        throw error;
      }

      setCoupons(data || []);
      console.log('✅ Company coupons loaded:', data?.length || 0);
    } catch (error) {
      console.error('Failed to load coupons:', error);
      notification.showError('Load Failed', 'Failed to load your coupons');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      // Get company ID
      const { data: companyData, error: companyError } = await supabase
        .from('tbl_companies')
        .select('tc_id')
        .eq('tc_user_id', user.id)
        .single();

      if (companyError) throw companyError;

      const { error } = await supabase
        .from('tbl_coupons')
        .insert({
          tc_created_by: user.id,
          tc_company_id: companyData.tc_id,
          tc_title: newCoupon.title,
          tc_description: newCoupon.description,
          tc_coupon_code: newCoupon.coupon_code,
          tc_discount_type: newCoupon.discount_type,
          tc_discount_value: newCoupon.discount_value,
          tc_image_url: newCoupon.image_url,
          tc_terms_conditions: newCoupon.terms_conditions,
          tc_valid_from: new Date(newCoupon.valid_from).toISOString(),
          tc_valid_until: new Date(newCoupon.valid_until).toISOString(),
          tc_usage_limit: newCoupon.usage_limit,
          tc_share_reward_amount: newCoupon.share_reward_amount,
          tc_status: 'pending', // Companies submit for approval
          tc_is_active: newCoupon.is_active
        });

      if (error) throw error;

      notification.showSuccess('Coupon Created', 'Coupon submitted for admin approval');
      setShowCreateModal(false);
      resetNewCoupon();
      loadCoupons();
    } catch (error) {
      console.error('Failed to create coupon:', error);
      notification.showError('Creation Failed', 'Failed to create coupon');
    }
  };

  const handleUpdateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoupon) return;

    try {
      const { error } = await supabase
        .from('tbl_coupons')
        .update({
          tc_title: newCoupon.title,
          tc_description: newCoupon.description,
          tc_coupon_code: newCoupon.coupon_code,
          tc_discount_type: newCoupon.discount_type,
          tc_discount_value: newCoupon.discount_value,
          tc_image_url: newCoupon.image_url,
          tc_terms_conditions: newCoupon.terms_conditions,
          tc_valid_from: new Date(newCoupon.valid_from).toISOString(),
          tc_valid_until: new Date(newCoupon.valid_until).toISOString(),
          tc_usage_limit: newCoupon.usage_limit,
          tc_share_reward_amount: newCoupon.share_reward_amount,
          tc_is_active: newCoupon.is_active,
          tc_status: 'pending' // Reset to pending after edit
        })
        .eq('tc_id', selectedCoupon.tc_id);

      if (error) throw error;

      notification.showSuccess('Coupon Updated', 'Coupon updated and resubmitted for approval');
      setShowEditModal(false);
      setSelectedCoupon(null);
      resetNewCoupon();
      loadCoupons();
    } catch (error) {
      console.error('Failed to update coupon:', error);
      notification.showError('Update Failed', 'Failed to update coupon');
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;

    try {
      const { error } = await supabase
        .from('tbl_coupons')
        .delete()
        .eq('tc_id', couponId);

      if (error) throw error;

      notification.showSuccess('Coupon Deleted', 'Coupon has been deleted');
      loadCoupons();
    } catch (error) {
      console.error('Failed to delete coupon:', error);
      notification.showError('Deletion Failed', 'Failed to delete coupon');
    }
  };

  const resetNewCoupon = () => {
    setNewCoupon({
      title: '',
      description: '',
      coupon_code: '',
      discount_type: 'percentage',
      discount_value: 0,
      image_url: '',
      terms_conditions: '',
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      usage_limit: 1000,
      share_reward_amount: 0.5,
      is_active: true
    });
  };

  const generateCouponCode = () => {
    const code = 'COMP' + Math.random().toString(36).substr(2, 8).toUpperCase();
    setNewCoupon(prev => ({ ...prev, coupon_code: code }));
  };

  const openEditModal = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setNewCoupon({
      title: coupon.tc_title,
      description: coupon.tc_description || '',
      coupon_code: coupon.tc_coupon_code,
      discount_type: coupon.tc_discount_type,
      discount_value: coupon.tc_discount_value,
      image_url: coupon.tc_image_url || '',
      terms_conditions: coupon.tc_terms_conditions || '',
      valid_from: coupon.tc_valid_from.split('T')[0],
      valid_until: coupon.tc_valid_until.split('T')[0],
      usage_limit: coupon.tc_usage_limit,
      share_reward_amount: coupon.tc_share_reward_amount,
      is_active: coupon.tc_is_active
    });
    setShowEditModal(true);
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = 
      coupon.tc_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coupon.tc_coupon_code.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' || coupon.tc_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getCouponStats = () => {
    const total = coupons.length;
    const pending = coupons.filter(c => c.tc_status === 'pending').length;
    const approved = coupons.filter(c => c.tc_status === 'approved').length;
    const totalShares = coupons.reduce((sum, c) => sum + c.tc_used_count, 0);

    return { total, pending, approved, totalShares };
  };

  const stats = getCouponStats();

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
            <div className="bg-orange-100 p-3 rounded-lg">
              <Gift className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">My Coupons</h3>
              <p className="text-gray-600">Create and manage your company coupons</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Coupon</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Coupons</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-gray-600">Pending Approval</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <div className="text-sm text-gray-600">Approved</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.totalShares}</div>
            <div className="text-sm text-gray-600">Total Shares</div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Search coupons..."
              />
            </div>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Coupons Grid */}
      <div className="p-6">
        {filteredCoupons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCoupons.map((coupon) => (
              <div key={coupon.tc_id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                {/* Coupon Preview */}
                <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-lg">{coupon.tc_title}</h4>
                    <span className="bg-white text-orange-600 px-2 py-1 rounded-full text-xs font-bold">
                      {coupon.tc_discount_type === 'percentage' ? `${coupon.tc_discount_value}%` : `$${coupon.tc_discount_value}`} OFF
                    </span>
                  </div>
                  <p className="text-orange-100 text-sm mb-3">{coupon.tc_description}</p>
                  <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2">
                    <p className="text-xs font-medium">Code:</p>
                    <p className="font-bold font-mono">{coupon.tc_coupon_code}</p>
                  </div>
                </div>

                {/* Coupon Details */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      coupon.tc_status === 'approved' ? 'bg-green-100 text-green-800' :
                      coupon.tc_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      coupon.tc_status === 'declined' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {coupon.tc_status === 'approved' && <CheckCircle className="h-3 w-3 mr-1 inline" />}
                      {coupon.tc_status === 'pending' && <Clock className="h-3 w-3 mr-1 inline" />}
                      {coupon.tc_status === 'declined' && <XCircle className="h-3 w-3 mr-1 inline" />}
                      {coupon.tc_status.charAt(0).toUpperCase() + coupon.tc_status.slice(1)}
                    </span>
                    <span className="text-sm font-medium text-green-600">
                      {coupon.tc_share_reward_amount} USDT/share
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Usage:</span>
                      <span>{coupon.tc_used_count} / {coupon.tc_usage_limit}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-orange-600 h-2 rounded-full" 
                        style={{ width: `${(coupon.tc_used_count / coupon.tc_usage_limit) * 100}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Valid until:</span>
                      <span>{new Date(coupon.tc_valid_until).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => openEditModal(coupon)}
                      disabled={coupon.tc_status === 'approved' || coupon.tc_status === 'declined'}
                      className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-1"
                    >
                      <Edit className="h-4 w-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteCoupon(coupon.tc_id)}
                      disabled={coupon.tc_status === 'approved'}
                      className="bg-red-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {(coupon.tc_status === 'approved' || coupon.tc_status === 'declined') && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {coupon.tc_status === 'approved' ? 'Approved coupons cannot be edited' : 'Declined coupons cannot be edited'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Gift className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No coupons found</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search criteria'
                : 'You haven\'t created any coupons yet'
              }
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors"
            >
              Create Your First Coupon
            </button>
          </div>
        )}
      </div>

      {/* Create/Edit Coupon Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {showCreateModal ? 'Create New Coupon' : 'Edit Coupon'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedCoupon(null);
                  resetNewCoupon();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={showCreateModal ? handleCreateCoupon : handleUpdateCoupon} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coupon Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCoupon.title}
                    onChange={(e) => setNewCoupon(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., Summer Sale 50% Off"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coupon Code *
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      required
                      value={newCoupon.coupon_code}
                      onChange={(e) => setNewCoupon(prev => ({ ...prev, coupon_code: e.target.value.toUpperCase() }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="SUMMER50"
                    />
                    <button
                      type="button"
                      onClick={generateCouponCode}
                      className="bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={newCoupon.description}
                  onChange={(e) => setNewCoupon(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Describe your coupon offer..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Discount Type *
                  </label>
                  <select
                    value={newCoupon.discount_type}
                    onChange={(e) => setNewCoupon(prev => ({ ...prev, discount_type: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed Amount</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={newCoupon.discount_value}
                    onChange={(e) => setNewCoupon(prev => ({ ...prev, discount_value: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder={newCoupon.discount_type === 'percentage' ? '50' : '10.00'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Share Reward (USDT) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={newCoupon.share_reward_amount}
                    onChange={(e) => setNewCoupon(prev => ({ ...prev, share_reward_amount: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="0.50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valid From *
                  </label>
                  <input
                    type="date"
                    required
                    value={newCoupon.valid_from}
                    onChange={(e) => setNewCoupon(prev => ({ ...prev, valid_from: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valid Until *
                  </label>
                  <input
                    type="date"
                    required
                    value={newCoupon.valid_until}
                    onChange={(e) => setNewCoupon(prev => ({ ...prev, valid_until: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Usage Limit *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newCoupon.usage_limit}
                  onChange={(e) => setNewCoupon(prev => ({ ...prev, usage_limit: parseInt(e.target.value) || 1000 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="1000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image URL
                </label>
                <input
                  type="url"
                  value={newCoupon.image_url}
                  onChange={(e) => setNewCoupon(prev => ({ ...prev, image_url: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="https://example.com/coupon-image.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Terms & Conditions
                </label>
                <textarea
                  value={newCoupon.terms_conditions}
                  onChange={(e) => setNewCoupon(prev => ({ ...prev, terms_conditions: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Enter terms and conditions..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setSelectedCoupon(null);
                    resetNewCoupon();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>{showCreateModal ? 'Create Coupon' : 'Update Coupon'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyCouponManagement;