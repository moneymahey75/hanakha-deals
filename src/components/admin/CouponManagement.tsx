import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import { useAuth } from '../../contexts/AuthContext';
import {
  Gift,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  DollarSign,
  Image,
  FileText,
  Save,
  X,
  ArrowLeft,
  Upload,
  Tag,
  Percent,
  Users,
  TrendingUp
} from 'lucide-react';

interface Coupon {
  tc_id: string;
  tc_created_by: string;
  tc_company_id?: string;
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
  company_info?: {
    name: string;
    email: string;
  };
  creator_info?: {
    name: string;
    email: string;
  };
}

interface Company {
  tc_id: string;
  tc_company_name: string;
  tc_official_email: string;
  tc_verification_status: string;
}

const CouponManagement: React.FC = () => {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [showCouponDetails, setShowCouponDetails] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
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
    company_id: '',
    is_active: true
  });

  useEffect(() => {
    loadCoupons();
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      console.log('🔍 Loading companies for coupon assignment...');
      
      const { data, error } = await supabase
        .from('tbl_companies')
        .select('tc_id, tc_company_name, tc_official_email, tc_verification_status')
        .eq('tc_verification_status', 'verified')
        .order('tc_company_name');

      if (error) {
        console.error('❌ Failed to load companies:', error);
        throw error;
      }

      setCompanies(data || []);
      console.log('✅ Companies loaded for coupon assignment:', data?.length || 0);
    } catch (error) {
      console.error('Failed to load companies:', error);
      notification.showError('Load Failed', 'Failed to load companies');
    }
  };

  const loadCoupons = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading coupons from database...');

      const { data, error } = await supabase
        .from('tbl_coupons')
        .select(`
          *,
          tbl_companies(tc_company_name, tc_official_email),
          tbl_users!tbl_coupons_tc_created_by_fkey(
            tbl_user_profiles(tup_first_name, tup_last_name)
          )
        `)
        .order('tc_created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to load coupons:', error);
        throw error;
      }

      const formattedCoupons = (data || []).map(coupon => ({
        ...coupon,
        company_info: coupon.tbl_companies ? {
          name: coupon.tbl_companies.tc_company_name,
          email: coupon.tbl_companies.tc_official_email
        } : undefined,
        creator_info: coupon.tbl_users?.tbl_user_profiles ? {
          name: `${coupon.tbl_users.tbl_user_profiles.tup_first_name} ${coupon.tbl_users.tbl_user_profiles.tup_last_name}`,
          email: ''
        } : undefined
      }));

      setCoupons(formattedCoupons);
      console.log('✅ Coupons loaded:', formattedCoupons.length);
    } catch (error) {
      console.error('Failed to load coupons:', error);
      notification.showError('Load Failed', 'Failed to load coupon data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    if (!newCoupon.company_id) {
      notification.showError('Company Required', 'Please select a company for this coupon');
      return;
    }

    try {
      const { error } = await supabase
        .from('tbl_coupons')
        .insert({
          tc_created_by: user.id,
          tc_company_id: newCoupon.company_id,
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
          tc_status: 'approved', // Admin can directly approve
          tc_is_active: newCoupon.is_active
        });

      if (error) throw error;

      notification.showSuccess('Coupon Created', 'Coupon has been created successfully');
      setShowCreateModal(false);
      resetNewCoupon();
      loadCoupons();
    } catch (error) {
      console.error('Failed to create coupon:', error);
      notification.showError('Creation Failed', 'Failed to create coupon');
    }
  };

  const handleApproveCoupon = async (couponId: string) => {
    try {
      const { error } = await supabase
        .from('tbl_coupons')
        .update({ tc_status: 'approved' })
        .eq('tc_id', couponId);

      if (error) throw error;

      notification.showSuccess('Coupon Approved', 'Coupon has been approved and is now active');
      loadCoupons();
    } catch (error) {
      console.error('Failed to approve coupon:', error);
      notification.showError('Approval Failed', 'Failed to approve coupon');
    }
  };

  const handleDeclineCoupon = async (couponId: string) => {
    try {
      const { error } = await supabase
        .from('tbl_coupons')
        .update({ tc_status: 'declined' })
        .eq('tc_id', couponId);

      if (error) throw error;

      notification.showSuccess('Coupon Declined', 'Coupon has been declined');
      loadCoupons();
    } catch (error) {
      console.error('Failed to decline coupon:', error);
      notification.showError('Decline Failed', 'Failed to decline coupon');
    }
  };

  const handleCancelCoupon = async (couponId: string) => {
    if (!confirm('Are you sure you want to cancel this coupon?')) return;

    try {
      const { error } = await supabase
        .from('tbl_coupons')
        .update({ tc_status: 'cancelled', tc_is_active: false })
        .eq('tc_id', couponId);

      if (error) throw error;

      notification.showSuccess('Coupon Cancelled', 'Coupon has been cancelled');
      loadCoupons();
    } catch (error) {
      console.error('Failed to cancel coupon:', error);
      notification.showError('Cancellation Failed', 'Failed to cancel coupon');
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm('Are you sure you want to delete this coupon? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('tbl_coupons')
        .delete()
        .eq('tc_id', couponId);

      if (error) throw error;

      notification.showSuccess('Coupon Deleted', 'Coupon has been deleted successfully');
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
      company_id: '',
      is_active: true
    });
  };

  const generateCouponCode = () => {
    const code = 'COUP' + Math.random().toString(36).substr(2, 8).toUpperCase();
    setNewCoupon(prev => ({ ...prev, coupon_code: code }));
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = 
      coupon.tc_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coupon.tc_coupon_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      coupon.company_info?.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' || coupon.tc_status === statusFilter;

    const matchesCompany = 
      companyFilter === 'all' || 
      (companyFilter === 'admin' && !coupon.tc_company_id) ||
      coupon.tc_company_id === companyFilter;

    return matchesSearch && matchesStatus && matchesCompany;
  });

  const getCouponStats = () => {
    const total = coupons.length;
    const pending = coupons.filter(c => c.tc_status === 'pending').length;
    const approved = coupons.filter(c => c.tc_status === 'approved').length;
    const active = coupons.filter(c => c.tc_is_active).length;
    const totalShares = coupons.reduce((sum, c) => sum + c.tc_used_count, 0);

    return { total, pending, approved, active, totalShares };
  };

  const stats = getCouponStats();

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

  if (showCouponDetails && selectedCoupon) {
    return (
      <CouponDetails
        coupon={selectedCoupon}
        onBack={() => {
          setShowCouponDetails(false);
          setSelectedCoupon(null);
          setEditMode(false);
        }}
        onUpdate={loadCoupons}
        editMode={editMode}
        setEditMode={setEditMode}
      />
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
              <h3 className="text-lg font-semibold text-gray-900">Coupon Management</h3>
              <p className="text-gray-600">Manage coupons and sharing rewards</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Total: {coupons.length} coupons
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Coupon</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Coupons</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            <div className="text-sm text-gray-600">Approved</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.active}</div>
            <div className="text-sm text-gray-600">Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.totalShares}</div>
            <div className="text-sm text-gray-600">Total Shares</div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="Search by title, code, or company..."
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
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="all">All Companies</option>
              <option value="admin">Admin Created</option>
              {companies.map(company => (
                <option key={company.tc_id} value={company.tc_id}>
                  {company.tc_company_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Coupons List */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Coupon
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Discount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reward
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Valid Until
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCoupons.map((coupon) => (
              <tr key={coupon.tc_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      {coupon.tc_image_url ? (
                        <img
                          src={coupon.tc_image_url}
                          alt={coupon.tc_title}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center">
                          <Gift className="h-5 w-5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {coupon.tc_title}
                      </div>
                      <div className="text-sm text-gray-500 font-mono">
                        {coupon.tc_coupon_code}
                      </div>
                      <div className="text-xs text-gray-400">
                        {coupon.company_info?.name || 'Admin Created'} 
                        {coupon.tc_company_id && (
                          <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                            Company
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {coupon.tc_discount_type === 'percentage' ? `${coupon.tc_discount_value}%` : `$${coupon.tc_discount_value}`}
                  </div>
                  <div className="text-sm text-gray-500">
                    {coupon.tc_discount_type === 'percentage' ? 'Percentage' : 'Fixed Amount'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {coupon.tc_used_count} / {coupon.tc_usage_limit}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className="bg-orange-600 h-2 rounded-full" 
                      style={{ width: `${(coupon.tc_used_count / coupon.tc_usage_limit) * 100}%` }}
                    ></div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {coupon.tc_share_reward_amount} USDT
                  </div>
                  <div className="text-sm text-gray-500">per share</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    coupon.tc_status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : coupon.tc_status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : coupon.tc_status === 'declined'
                      ? 'bg-red-100 text-red-800'
                      : coupon.tc_status === 'cancelled'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {coupon.tc_status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {coupon.tc_status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                    {coupon.tc_status === 'declined' && <XCircle className="h-3 w-3 mr-1" />}
                    {coupon.tc_status.charAt(0).toUpperCase() + coupon.tc_status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(coupon.tc_valid_until).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setSelectedCoupon(coupon);
                        setShowCouponDetails(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {coupon.tc_status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApproveCoupon(coupon.tc_id)}
                          className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                          title="Approve"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeclineCoupon(coupon.tc_id)}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                          title="Decline"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {coupon.tc_status === 'approved' && (
                      <button
                        onClick={() => handleCancelCoupon(coupon.tc_id)}
                        className="text-yellow-600 hover:text-yellow-800 p-1 rounded hover:bg-yellow-50"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteCoupon(coupon.tc_id)}
                      className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredCoupons.length === 0 && (
        <div className="text-center py-12">
          <Gift className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No coupons found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search criteria'
              : 'No coupons have been created yet'
            }
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors"
          >
            Create First Coupon
          </button>
        </div>
      )}

      {/* Create Coupon Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Create New Coupon</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetNewCoupon();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleCreateCoupon} className="space-y-6">
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
                  placeholder="Describe the coupon offer..."
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
                  Company *
                </label>
                <select
                  value={newCoupon.company_id}
                  onChange={(e) => setNewCoupon(prev => ({ ...prev, company_id: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="">Select Company</option>
                  {companies.map(company => (
                    <option key={company.tc_id} value={company.tc_id}>
                      {company.tc_company_name} ({company.tc_official_email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Select the company this coupon belongs to</p>
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

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={newCoupon.is_active}
                  onChange={(e) => setNewCoupon(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
                  Coupon is active and available for sharing
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
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
                  <span>Create Coupon</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Coupon Details Component
const CouponDetails: React.FC<{
  coupon: Coupon;
  onBack: () => void;
  onUpdate: () => void;
  editMode: boolean;
  setEditMode: (mode: boolean) => void;
}> = ({ coupon, onBack, onUpdate, editMode, setEditMode }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Coupons</span>
            </button>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {coupon.tc_title}
              </h3>
              <p className="text-gray-600">Coupon Details & Management</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Coupon Preview */}
          <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-6 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xl font-bold">{coupon.tc_title}</h4>
              <span className="bg-white text-orange-600 px-3 py-1 rounded-full text-sm font-bold">
                {coupon.tc_discount_type === 'percentage' ? `${coupon.tc_discount_value}% OFF` : `$${coupon.tc_discount_value} OFF`}
              </span>
            </div>
            <p className="text-orange-100 mb-4">{coupon.tc_description}</p>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
              <p className="text-sm font-medium">Coupon Code:</p>
              <p className="text-xl font-bold font-mono">{coupon.tc_coupon_code}</p>
            </div>
          </div>

          {/* Coupon Details */}
          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-4">Coupon Information</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    coupon.tc_status === 'approved' ? 'bg-green-100 text-green-800' :
                    coupon.tc_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {coupon.tc_status.charAt(0).toUpperCase() + coupon.tc_status.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Usage:</span>
                  <span>{coupon.tc_used_count} / {coupon.tc_usage_limit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Share Reward:</span>
                  <span className="font-medium">{coupon.tc_share_reward_amount} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Valid Until:</span>
                  <span>{new Date(coupon.tc_valid_until).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CouponManagement;