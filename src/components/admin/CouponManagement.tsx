import React, { useState, useEffect } from 'react';
import { adminApi } from '../../lib/adminApi';
import { useNotification } from '../ui/NotificationProvider';
import { Gift, Plus, Search, Filter, Eye, CreditCard as Edit, Trash2, CheckCircle, XCircle, Clock, Calendar, DollarSign, Image, FileText, Save, X, ArrowLeft, Upload, Tag, Percent, Users, TrendingUp, Rocket, Play, ExternalLink } from 'lucide-react';
import {useAdminAuth} from "../../contexts/AdminAuthContext.tsx";

let inFlightCouponsRequest: Promise<any[]> | null = null;
let inFlightCouponCompaniesRequest: Promise<Company[]> | null = null;

interface Coupon {
  tc_id: string;
  tc_created_by: string;
  tc_company_id?: string;
  tc_title: string;
  tc_description?: string;
  tc_coupon_code?: string | null;
  tc_discount_type?: 'percentage' | 'fixed_amount' | null;
  tc_discount_value?: number | null;
  tc_image_url?: string;
  tc_terms_conditions?: string;
  tc_valid_from: string;
  tc_valid_until: string;
  tc_usage_limit?: number | null;
  tc_used_count: number;
  tc_share_reward_amount: number;
  tc_status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired';
  tc_is_active: boolean;
  tc_created_at: string;
  tc_updated_at: string;
  tc_launch_date?: string;
  tc_launch_now: boolean;
  tc_website_url?: string;
  company_info?: {
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

const toLocalISODate = (date: Date) => date.toLocaleDateString('en-CA');

const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const normalizeDateToIso = (value?: string | null) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).toISOString();
  }
  return new Date(value).toISOString();
};

const CouponManagement: React.FC = () => {
  const { admin } = useAdminAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [showCouponDetails, setShowCouponDetails] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showDailyTasks, setShowDailyTasks] = useState(false);
  const [dailyTasksDate, setDailyTasksDate] = useState(new Date().toLocaleDateString('en-CA'));
  const notification = useNotification();

  const [newCoupon, setNewCoupon] = useState({
    title: '',
    description: '',
    coupon_code: '',
    discount_type: '',
    discount_value: '',
    image_url: '',
    terms_conditions: '',
    valid_from: toLocalISODate(new Date()),
    valid_until: toLocalISODate(addDays(new Date(), 30)),
    usage_limit: '',
    share_reward_amount: 0.5,
    company_id: '',
    is_active: true,
    launch_date: '',
    launch_now: false,
    website_url: ''
  });

  useEffect(() => {
    loadCoupons();
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const requestPromise = inFlightCouponCompaniesRequest ?? adminApi.post<Company[]>('admin-get-companies');
      inFlightCouponCompaniesRequest = requestPromise;

      const data = await requestPromise;
      const verified = (data || []).filter((c) => c.tc_verification_status === 'verified');
      setCompanies(verified);
    } catch (error) {
      notification.showError('Load Failed', 'Failed to load companies');
    } finally {
      inFlightCouponCompaniesRequest = null;
    }
  };

  const loadCoupons = async () => {
    try {
      setLoading(true);

      const requestPromise = inFlightCouponsRequest ?? adminApi.post<any[]>('admin-get-coupons');
      inFlightCouponsRequest = requestPromise;

      const data = await requestPromise;

      // ✅ Fixed: all Coupon interface fields are now correctly mapped from RPC response
      const formattedCoupons = (data || []).map((row: any) => ({
        tc_id: row.tc_id,
        tc_created_by: row.tc_created_by ?? null,
        tc_company_id: row.tc_company_id,
        tc_title: row.tc_title ?? '',
        tc_description: row.tc_description,
        tc_coupon_code: row.tc_coupon_code ?? null,
        tc_discount_type: row.tc_discount_type ?? null,
        tc_discount_value: row.tc_discount_value ?? null,
        tc_image_url: row.tc_image_url,
        tc_terms_conditions: row.tc_terms_conditions,
        tc_valid_from: row.tc_valid_from ?? '',
        tc_valid_until: row.tc_valid_until ?? '',
        tc_usage_limit: row.tc_usage_limit ?? null,
        tc_used_count: row.tc_used_count ?? 0,
        tc_share_reward_amount: row.tc_share_reward_amount ?? 0,
        tc_status: row.tc_status,
        tc_is_active: row.tc_is_active ?? false,
        tc_launch_now: row.tc_launch_now ?? false,
        tc_launch_date: row.tc_launch_date,
        tc_website_url: row.tc_website_url,
        tc_created_at: row.tc_created_at,
        tc_updated_at: row.tc_updated_at,
        company_info: row.company_data ? {
          name: row.company_data.tc_company_name,
          email: row.company_data.tc_official_email
        } : undefined
      }));

      setCoupons(formattedCoupons);
    } catch (error) {
      notification.showError('Load Failed', 'Failed to load coupon data');
    } finally {
      inFlightCouponsRequest = null;
      setLoading(false);
    }
  };

  const handleCouponUpdated = (updatedCoupon: Coupon) => {
    setCoupons(prev =>
        prev.map(c => c.tc_id === updatedCoupon.tc_id ? updatedCoupon : c)
    );
    setSelectedCoupon(updatedCoupon);
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!admin?.id) {
      notification.showError('Error', 'Admin not authenticated');
      return;
    }

    try {
      await adminApi.post('admin-save-coupon', {
        companyId: newCoupon.company_id || null,
        title: newCoupon.title,
        description: newCoupon.description,
        couponCode: newCoupon.coupon_code || null,
        discountType: newCoupon.discount_type || null,
        discountValue: newCoupon.discount_value === '' ? null : Number(newCoupon.discount_value),
        imageUrl: newCoupon.image_url,
        termsConditions: newCoupon.terms_conditions,
        validFrom: normalizeDateToIso(newCoupon.valid_from),
        validUntil: normalizeDateToIso(newCoupon.valid_until),
        usageLimit: newCoupon.usage_limit === '' ? null : Number(newCoupon.usage_limit),
        shareRewardAmount: newCoupon.share_reward_amount,
        status: 'approved',
        isActive: newCoupon.is_active,
        launchDate: newCoupon.launch_date ? normalizeDateToIso(newCoupon.launch_date) : null,
        launchNow: newCoupon.launch_now,
        websiteUrl: newCoupon.website_url
      });

      notification.showSuccess('Coupon Created', 'Coupon has been created successfully');
      setShowCreateModal(false);
      resetNewCoupon();
      loadCoupons();
    } catch (error) {
      notification.showError('Creation Failed', 'Failed to create coupon');
    }
  };

  const handleUpdateCoupon = async (couponId: string, updates: Partial<Coupon>): Promise<boolean> => {
    try {
      await adminApi.post('admin-save-coupon', {
        id: couponId,
        companyId: updates.tc_company_id || null,
        title: updates.tc_title,
        description: updates.tc_description,
        couponCode: updates.tc_coupon_code || null,
        discountType: updates.tc_discount_type || null,
        discountValue: updates.tc_discount_value ?? null,
        imageUrl: updates.tc_image_url,
        termsConditions: updates.tc_terms_conditions,
        validFrom: updates.tc_valid_from,
        validUntil: updates.tc_valid_until,
        usageLimit: updates.tc_usage_limit ?? null,
        shareRewardAmount: updates.tc_share_reward_amount,
        status: updates.tc_status,
        isActive: updates.tc_is_active,
        launchDate: updates.tc_launch_date,
        launchNow: updates.tc_launch_now,
        websiteUrl: updates.tc_website_url
      });

      notification.showSuccess('Coupon Updated', 'Coupon has been updated successfully');
      return true;
    } catch (error) {
      notification.showError('Update Failed', 'Failed to update coupon');
      return false;
    }
  };

  const handleApproveCoupon = async (couponId: string) => {
    try {
      await adminApi.post('admin-update-coupon-status', {
        couponId,
        status: 'approved'
      });
      notification.showSuccess('Coupon Approved', 'Coupon has been approved and is now active');
      loadCoupons();
    } catch { notification.showError('Approval Failed', 'Failed to approve coupon'); }
  };

  const handleDeclineCoupon = async (couponId: string) => {
    try {
      await adminApi.post('admin-update-coupon-status', {
        couponId,
        status: 'declined'
      });
      notification.showSuccess('Coupon Declined', 'Coupon has been declined');
      loadCoupons();
    } catch { notification.showError('Decline Failed', 'Failed to decline coupon'); }
  };

  const handleCancelCoupon = async (couponId: string) => {
    if (!confirm('Are you sure you want to cancel this coupon?')) return;
    try {
      await adminApi.post('admin-update-coupon-status', {
        couponId,
        status: 'cancelled',
        isActive: false
      });
      notification.showSuccess('Coupon Cancelled', 'Coupon has been cancelled');
      loadCoupons();
    } catch { notification.showError('Cancellation Failed', 'Failed to cancel coupon'); }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm('Are you sure you want to delete this coupon? This action cannot be undone.')) return;
    try {
      await adminApi.post('admin-delete-coupon', { couponId });
      notification.showSuccess('Coupon Deleted', 'Coupon has been deleted successfully');
      loadCoupons();
    } catch { notification.showError('Deletion Failed', 'Failed to delete coupon'); }
  };

  const handleLaunchNow = async (couponId: string) => {
    try {
      await adminApi.post('admin-launch-coupon', { couponId });
      notification.showSuccess('Coupon Launched', 'Coupon has been launched immediately');
      loadCoupons();
    } catch { notification.showError('Launch Failed', 'Failed to launch coupon'); }
  };

  const resetNewCoupon = () => {
    setNewCoupon({
      title: '', description: '', coupon_code: '',
      discount_type: '', discount_value: '',
      image_url: '', terms_conditions: '',
      valid_from: toLocalISODate(new Date()),
      valid_until: toLocalISODate(addDays(new Date(), 30)),
      usage_limit: '', share_reward_amount: 0.5,
      company_id: '', is_active: true,
      launch_date: '', launch_now: false, website_url: ''
    });
  };

  const generateCouponCode = () => {
    const code = 'COUP' + Math.random().toString(36).substr(2, 8).toUpperCase();
    setNewCoupon(prev => ({ ...prev, coupon_code: code }));
  };

  const getDailyTasksCoupons = () => {
    const selectedDate = new Date(dailyTasksDate);
    const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999)).toISOString();
    return coupons.filter(coupon => {
      if (!coupon.tc_launch_date || !coupon.tc_launch_now) return false;
      const couponLaunchDate = new Date(coupon.tc_launch_date);
      return couponLaunchDate >= new Date(startOfDay) && couponLaunchDate <= new Date(endOfDay) && coupon.tc_status === 'approved' && coupon.tc_is_active;
    });
  };

  // ✅ Fixed: null guards on all string fields before calling .toLowerCase()
  const filteredCoupons = showDailyTasks
      ? getDailyTasksCoupons()
      : coupons.filter(coupon => {
        const matchesSearch =
            (coupon.tc_title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (coupon.tc_coupon_code ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (coupon.company_info?.name ?? '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || coupon.tc_status === statusFilter;
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
    const totalShares = coupons.reduce((sum, c) => sum + (c.tc_used_count ?? 0), 0);
    const scheduled = coupons.filter(c => c.tc_launch_date && !c.tc_launch_now).length;
    const launched = coupons.filter(c => c.tc_launch_now).length;
    return { total, pending, approved, active, totalShares, scheduled, launched };
  };

  const stats = getCouponStats();

  if (loading) {
    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded"></div>)}
            </div>
          </div>
        </div>
    );
  }

  if (showCouponDetails && selectedCoupon) {
    return (
        <CouponDetails
            coupon={selectedCoupon}
            onBack={() => { setShowCouponDetails(false); setSelectedCoupon(null); setEditMode(false); }}
            onUpdate={loadCoupons}
            onCouponUpdated={handleCouponUpdated}
            editMode={editMode}
            setEditMode={setEditMode}
            companies={companies}
            onUpdateCoupon={handleUpdateCoupon}
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
              <div className="text-sm text-gray-500">Total: {coupons.length} coupons</div>
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
          <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mb-6">
            <div className="text-center"><div className="text-2xl font-bold text-orange-600">{stats.total}</div><div className="text-sm text-gray-600">Total Coupons</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-yellow-600">{stats.pending}</div><div className="text-sm text-gray-600">Pending</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-green-600">{stats.approved}</div><div className="text-sm text-gray-600">Approved</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-blue-600">{stats.active}</div><div className="text-sm text-gray-600">Active</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-indigo-600">{stats.scheduled}</div><div className="text-sm text-gray-600">Scheduled</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-teal-600">{stats.launched}</div><div className="text-sm text-gray-600">Launched</div></div>
          </div>

          {/* Daily Tasks Toggle */}
          <div className="flex items-center mb-4 p-4 bg-gray-50 rounded-lg">
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input type="checkbox" className="sr-only" checked={showDailyTasks} onChange={() => setShowDailyTasks(!showDailyTasks)} />
                <div className={`block w-14 h-8 rounded-full ${showDailyTasks ? 'bg-orange-600' : 'bg-gray-600'}`}></div>
                <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition transform ${showDailyTasks ? 'translate-x-6' : ''}`}></div>
              </div>
              <div className="ml-3 text-gray-700 font-medium flex items-center">
                <Rocket className="h-5 w-5 mr-2" />
                Show Daily Tasks
              </div>
            </label>
            {showDailyTasks && (
                <div className="ml-6">
                  <input
                      type="date" value={dailyTasksDate}
                      onChange={(e) => setDailyTasksDate(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
            )}
          </div>

          {/* Search and Filters */}
          {!showDailyTasks && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text" value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="Search by title, code, or company..."
                    />
                  </div>
                </div>
                <div>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="declined">Declined</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div>
                  <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                    <option value="all">All Companies</option>
                    <option value="admin">Admin Created</option>
                    {companies.map(company => <option key={company.tc_id} value={company.tc_id}>{company.tc_company_name}</option>)}
                  </select>
                </div>
              </div>
          )}
        </div>

        {/* Coupons List */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Coupon</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reward</th>
              {showDailyTasks && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              {!showDailyTasks && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Launch Date</th>}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valid From</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valid Until</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
            {filteredCoupons.map((coupon) => (
                <tr key={coupon.tc_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {coupon.tc_image_url ? (
                            <img src={coupon.tc_image_url} alt={coupon.tc_title} className="h-10 w-10 rounded-lg object-cover" />
                        ) : (
                            <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center">
                              <Gift className="h-5 w-5 text-white" />
                            </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{coupon.tc_title}</div>
                        <div className="text-sm text-gray-500 font-mono">{coupon.tc_coupon_code || 'No code'}</div>
                        <div className="text-xs text-gray-400">
                          {coupon.company_info?.name || 'Admin Created'}
                          {coupon.tc_company_id && <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">Company</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {coupon.tc_discount_type
                        ? coupon.tc_discount_type === 'percentage'
                          ? (coupon.tc_discount_value != null ? `${coupon.tc_discount_value}%` : '—%')
                          : (coupon.tc_discount_value != null ? `$${coupon.tc_discount_value}` : '$—')
                        : 'No discount'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {coupon.tc_discount_type === 'percentage'
                        ? 'Percentage'
                        : coupon.tc_discount_type === 'fixed_amount'
                          ? 'Fixed Amount'
                          : 'Not specified'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{coupon.tc_used_count} / {coupon.tc_usage_limit ?? 'Unlimited'}</div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                          className="bg-orange-600 h-2 rounded-full"
                          style={{ width: `${(coupon.tc_usage_limit != null && coupon.tc_usage_limit > 0) ? Math.min((coupon.tc_used_count / coupon.tc_usage_limit) * 100, 100) : 0}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{coupon.tc_share_reward_amount} USDT</div>
                    <div className="text-sm text-gray-500">per share</div>
                  </td>
                  {showDailyTasks && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        {coupon.tc_website_url ? (
                            <a href={coupon.tc_website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm underline">Visit Website</a>
                        ) : <span className="text-gray-400 text-sm">No website</span>}
                      </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        coupon.tc_status === 'approved' ? 'bg-green-100 text-green-800' :
                            coupon.tc_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                coupon.tc_status === 'declined' ? 'bg-red-100 text-red-800' :
                                    coupon.tc_status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                                        'bg-purple-100 text-purple-800'
                    }`}>
                      {coupon.tc_status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                      {coupon.tc_status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                      {coupon.tc_status === 'declined' && <XCircle className="h-3 w-3 mr-1" />}
                      {coupon.tc_status.charAt(0).toUpperCase() + coupon.tc_status.slice(1)}
                    </span>
                    {coupon.tc_launch_now && (
                        <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                          <Rocket className="h-3 w-3 mr-1" />Launched
                        </span>
                    )}
                  </td>
                  {!showDailyTasks && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {coupon.tc_launch_date ? (
                            <div className="flex items-center"><Calendar className="h-4 w-4 mr-1" />{new Date(coupon.tc_launch_date).toLocaleDateString()}</div>
                        ) : <span className="text-gray-400">Not scheduled</span>}
                      </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {coupon.tc_valid_from ? (
                        <div className="flex items-center"><Calendar className="h-4 w-4 mr-1" />{new Date(coupon.tc_valid_from).toLocaleDateString()}</div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {coupon.tc_valid_until ? (
                        <div className="flex items-center"><Calendar className="h-4 w-4 mr-1" />{new Date(coupon.tc_valid_until).toLocaleDateString()}</div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button onClick={() => { setSelectedCoupon(coupon); setShowCouponDetails(true); }} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50" title="View Details"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setSelectedCoupon(coupon); setShowCouponDetails(true); setEditMode(true); }} className="text-indigo-600 hover:text-indigo-800 p-1 rounded hover:bg-indigo-50" title="Edit"><Edit className="h-4 w-4" /></button>
                      {coupon.tc_status === 'pending' && (
                          <>
                            <button onClick={() => handleApproveCoupon(coupon.tc_id)} className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50" title="Approve"><CheckCircle className="h-4 w-4" /></button>
                            <button onClick={() => handleDeclineCoupon(coupon.tc_id)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50" title="Decline"><XCircle className="h-4 w-4" /></button>
                          </>
                      )}
                      {coupon.tc_status === 'approved' && !coupon.tc_launch_now && (
                          <button onClick={() => handleLaunchNow(coupon.tc_id)} className="text-teal-600 hover:text-teal-800 p-1 rounded hover:bg-teal-50" title="Launch Now"><Play className="h-4 w-4" /></button>
                      )}
                      {coupon.tc_status === 'approved' && (
                          <button onClick={() => handleCancelCoupon(coupon.tc_id)} className="text-yellow-600 hover:text-yellow-800 p-1 rounded hover:bg-yellow-50" title="Cancel"><X className="h-4 w-4" /></button>
                      )}
                      <button onClick={() => handleDeleteCoupon(coupon.tc_id)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50" title="Delete"><Trash2 className="h-4 w-4" /></button>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {showDailyTasks ? 'No coupons scheduled for this date' : 'No coupons found'}
              </h3>
              <p className="text-gray-600 mb-4">
                {!showDailyTasks && (searchTerm || statusFilter !== 'all') ? 'Try adjusting your search criteria' : 'No coupons have been created yet'}
              </p>
              <button onClick={() => setShowCreateModal(true)} className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors">
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
                  <button onClick={() => { setShowCreateModal(false); resetNewCoupon(); }} className="text-gray-400 hover:text-gray-600"><X className="h-6 w-6" /></button>
                </div>
                <form onSubmit={handleCreateCoupon} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Coupon Title *</label>
                      <input type="text" required value={newCoupon.title} onChange={(e) => setNewCoupon(prev => ({ ...prev, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="e.g., Summer Sale 50% Off" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Coupon Code</label>
                      <div className="flex space-x-2">
                        <input type="text" value={newCoupon.coupon_code} onChange={(e) => setNewCoupon(prev => ({ ...prev, coupon_code: e.target.value.toUpperCase() }))} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="Optional coupon code" />
                        <button type="button" onClick={generateCouponCode} className="bg-gray-600 text-white px-3 py-2 rounded-lg hover:bg-gray-700 transition-colors">Generate</button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea value={newCoupon.description} onChange={(e) => setNewCoupon(prev => ({ ...prev, description: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="Add details (new lines or “-” bullets show as bullet points to customers)..." />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
                      <select value={newCoupon.discount_type} onChange={(e) => setNewCoupon(prev => ({ ...prev, discount_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                        <option value="">Not specified</option>
                        <option value="percentage">Percentage</option>
                        <option value="fixed_amount">Fixed Amount</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Discount Value</label>
                      <input type="number" min="0" step="0.01" value={newCoupon.discount_value} onChange={(e) => setNewCoupon(prev => ({ ...prev, discount_value: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="Optional value" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Share Reward (USDT) *</label>
                      <input type="number" required min="0" step="0.01" value={newCoupon.share_reward_amount} onChange={(e) => setNewCoupon(prev => ({ ...prev, share_reward_amount: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="0.50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Valid From *</label>
                      <input type="date" required value={newCoupon.valid_from} onChange={(e) => setNewCoupon(prev => ({ ...prev, valid_from: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Valid Until *</label>
                      <input type="date" required value={newCoupon.valid_until} onChange={(e) => setNewCoupon(prev => ({ ...prev, valid_until: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Launch Date</label>
                      <input type="date" value={newCoupon.launch_date} onChange={(e) => setNewCoupon(prev => ({ ...prev, launch_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
                      <p className="text-xs text-gray-500 mt-1">Schedule this coupon for a specific date</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                      <select value={newCoupon.company_id} onChange={(e) => setNewCoupon(prev => ({ ...prev, company_id: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent">
                        <option value="">Admin Created</option>
                        {companies.map(company => <option key={company.tc_id} value={company.tc_id}>{company.tc_company_name} ({company.tc_official_email})</option>)}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Leave empty to create this coupon directly under admin.</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Usage Limit</label>
                    <input type="number" min="1" value={newCoupon.usage_limit} onChange={(e) => setNewCoupon(prev => ({ ...prev, usage_limit: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="Optional. Defaults to 1000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Image URL</label>
                    <input type="url" value={newCoupon.image_url} onChange={(e) => setNewCoupon(prev => ({ ...prev, image_url: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="https://example.com/coupon-image.jpg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Website URL</label>
                    <input type="url" value={newCoupon.website_url || ''} onChange={(e) => setNewCoupon(prev => ({ ...prev, website_url: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="https://example.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Terms & Conditions</label>
                    <textarea value={newCoupon.terms_conditions} onChange={(e) => setNewCoupon(prev => ({ ...prev, terms_conditions: e.target.value }))} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" placeholder="Enter terms and conditions..." />
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <input type="checkbox" id="is_active" checked={newCoupon.is_active} onChange={(e) => setNewCoupon(prev => ({ ...prev, is_active: e.target.checked }))} className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded" />
                      <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">Coupon is active</label>
                    </div>
                    <div className="flex items-center">
                      <input type="checkbox" id="launch_now" checked={newCoupon.launch_now} onChange={(e) => setNewCoupon(prev => ({ ...prev, launch_now: e.target.checked }))} className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded" />
                      <label htmlFor="launch_now" className="ml-2 block text-sm text-gray-700">Launch immediately</label>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button type="button" onClick={() => { setShowCreateModal(false); resetNewCoupon(); }} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center space-x-2">
                      <Save className="h-4 w-4" /><span>Create Coupon</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}
      </div>
  );
};

// ─────────────────────────────────────────────
// Coupon Details Component
// ─────────────────────────────────────────────
const CouponDetails: React.FC<{
  coupon: Coupon;
  onBack: () => void;
  onUpdate: () => void;
  onCouponUpdated: (updated: Coupon) => void;
  editMode: boolean;
  setEditMode: (mode: boolean) => void;
  companies: Company[];
  onUpdateCoupon: (couponId: string, updates: Partial<Coupon>) => Promise<boolean>;
}> = ({ coupon: initialCoupon, onBack, onUpdate, onCouponUpdated, editMode, setEditMode, companies, onUpdateCoupon }) => {

  const [coupon, setCoupon] = useState<Coupon>(initialCoupon);
  const [editedCoupon, setEditedCoupon] = useState<Coupon>(initialCoupon);
  const [saving, setSaving] = useState(false);
  const notification = useNotification();

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
        tc_title: editedCoupon.tc_title,
        tc_description: editedCoupon.tc_description,
        tc_coupon_code: editedCoupon.tc_coupon_code,
        tc_discount_type: editedCoupon.tc_discount_type,
        tc_discount_value: editedCoupon.tc_discount_value,
        tc_image_url: editedCoupon.tc_image_url,
        tc_terms_conditions: editedCoupon.tc_terms_conditions,
        tc_valid_from: normalizeDateToIso(editedCoupon.tc_valid_from),
        tc_valid_until: normalizeDateToIso(editedCoupon.tc_valid_until),
        tc_usage_limit: editedCoupon.tc_usage_limit,
        tc_share_reward_amount: editedCoupon.tc_share_reward_amount,
        tc_is_active: editedCoupon.tc_is_active,
        tc_launch_date: normalizeDateToIso(editedCoupon.tc_launch_date),
        tc_launch_now: editedCoupon.tc_launch_now,
        tc_website_url: editedCoupon.tc_website_url,
        tc_company_id: editedCoupon.tc_company_id,
        tc_status: editedCoupon.tc_status
      };

      const success = await onUpdateCoupon(coupon.tc_id, updates);

      if (success) {
        const matchedCompany = companies.find(c => c.tc_id === editedCoupon.tc_company_id);
        const updatedCoupon: Coupon = {
          ...coupon,
          ...editedCoupon,
          company_info: matchedCompany
              ? { name: matchedCompany.tc_company_name, email: matchedCompany.tc_official_email }
              : editedCoupon.tc_company_id ? coupon.company_info : undefined
        };

        setCoupon(updatedCoupon);
        onCouponUpdated(updatedCoupon);
        setEditMode(false);
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to save coupon:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedCoupon(coupon);
    setEditMode(false);
  };

  const renderDescriptionWithBullets = (description?: string | null) => {
    if (!description) return <p className="text-gray-500">—</p>;

    const items = description
      .split(/\r?\n+/)
      .map((item) => item.replace(/^[\s\-*•\d.]+/, '').trim())
      .filter(Boolean);

    if (items.length <= 1) {
      return <p className="whitespace-pre-line text-gray-700">{description}</p>;
    }

    return (
      <ul className="list-disc space-y-1 pl-5 text-gray-700">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    );
  };

  const formatDateForInput = (dateString: string) => {
    if (!dateString) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
    return new Date(dateString).toLocaleDateString('en-CA');
  };

  const displayCoupon = editMode ? editedCoupon : coupon;
  const statusBadgeClass =
    displayCoupon.tc_status === 'approved'
      ? 'bg-green-100 text-green-800'
      : displayCoupon.tc_status === 'pending'
        ? 'bg-yellow-100 text-yellow-800'
        : displayCoupon.tc_status === 'declined'
          ? 'bg-red-100 text-red-800'
          : 'bg-gray-100 text-gray-800';

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent';

  return (
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={onBack} className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Coupons</span>
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-900">{editMode ? 'Edit Coupon' : coupon.tc_title}</h3>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass}`}>
                    {displayCoupon.tc_status.charAt(0).toUpperCase() + displayCoupon.tc_status.slice(1)}
                  </span>
                  {!editMode && (
                    <span className="text-xs text-gray-500">
                      {coupon.company_info?.name || 'Admin Created'}
                    </span>
                  )}
                </div>
                <p className="text-gray-600">{editMode ? 'Update coupon details' : 'View and manage this coupon'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!editMode && displayCoupon.tc_website_url && (
                <a
                  href={displayCoupon.tc_website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open Website</span>
                </a>
              )}
              {editMode ? (
                <>
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  <span>Edit Coupon</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Preview */}
            <div className="lg:col-span-1">
              <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-6 rounded-xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center overflow-hidden">
                      {displayCoupon.tc_image_url ? (
                        <img src={displayCoupon.tc_image_url} alt={displayCoupon.tc_title} className="h-full w-full object-cover" />
                      ) : (
                        <Gift className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-xl font-bold leading-tight">{displayCoupon.tc_title}</h4>
                      <p className="text-orange-100 text-sm">
                        {displayCoupon.tc_company_id ? (coupon.company_info?.name || 'Company') : 'Admin Created'}
                      </p>
                    </div>
                  </div>
                  <span className="bg-white text-orange-600 px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap">
                    {displayCoupon.tc_discount_type === 'percentage'
                      ? `${displayCoupon.tc_discount_value ?? '—'}% OFF`
                      : displayCoupon.tc_discount_type === 'fixed_amount'
                        ? `$${displayCoupon.tc_discount_value ?? '—'} OFF`
                        : 'No discount'}
                  </span>
                </div>

                <div className="mt-4 text-orange-50 text-sm">
                  {renderDescriptionWithBullets(displayCoupon.tc_description)}
                </div>

                <div className="mt-5 bg-white/20 backdrop-blur-sm rounded-lg p-3">
                  <p className="text-xs font-medium text-orange-50">Coupon Code</p>
                  <p className="mt-1 text-xl font-bold font-mono">
                    {displayCoupon.tc_coupon_code || 'No code required'}
                  </p>
                </div>

                {(displayCoupon.tc_valid_until || displayCoupon.tc_valid_from) && (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-orange-50">
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-90">
                        <Calendar className="h-4 w-4" />
                        Valid From
                      </div>
                      <div className="mt-1 font-medium">
                        {displayCoupon.tc_valid_from ? new Date(displayCoupon.tc_valid_from).toLocaleDateString() : '—'}
                      </div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-90">
                        <Calendar className="h-4 w-4" />
                        Valid Until
                      </div>
                      <div className="mt-1 font-medium">
                        {displayCoupon.tc_valid_until ? new Date(displayCoupon.tc_valid_until).toLocaleDateString() : '—'}
                      </div>
                    </div>
                  </div>
                )}

                {displayCoupon.tc_website_url && (
                  <a
                    href={displayCoupon.tc_website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 bg-white text-orange-600 px-4 py-2 rounded-lg font-medium hover:bg-orange-50 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Visit Website</span>
                  </a>
                )}
              </div>
            </div>

            {/* Details / Edit Form */}
            <div className="lg:col-span-2 space-y-6">
              {!editMode ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h4 className="font-medium text-gray-900 mb-4">Basics</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Company</span>
                          <span className="font-medium text-gray-900">{coupon.company_info?.name || 'Admin Created'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Reward</span>
                          <span className="font-medium text-gray-900">{displayCoupon.tc_share_reward_amount} USDT</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Discount</span>
                          <span className="font-medium text-gray-900">
                            {displayCoupon.tc_discount_type
                              ? displayCoupon.tc_discount_type === 'percentage'
                                ? `${displayCoupon.tc_discount_value ?? '—'}%`
                                : `$${displayCoupon.tc_discount_value ?? '—'}`
                              : 'Not specified'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Active</span>
                          <span className="font-medium text-gray-900">{displayCoupon.tc_is_active ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Launch Now</span>
                          <span className="font-medium text-gray-900">{displayCoupon.tc_launch_now ? 'Yes' : 'No'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                      <h4 className="font-medium text-gray-900 mb-4">Usage</h4>
                      <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Used</span>
                          <span className="font-medium text-gray-900">
                            {displayCoupon.tc_used_count} / {displayCoupon.tc_usage_limit ?? 'Unlimited'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-orange-600 h-2 rounded-full"
                            style={{
                              width: `${(displayCoupon.tc_usage_limit != null && displayCoupon.tc_usage_limit > 0)
                                ? Math.min((displayCoupon.tc_used_count / displayCoupon.tc_usage_limit) * 100, 100)
                                : 0}%`
                            }}
                          ></div>
                        </div>
                        {displayCoupon.tc_launch_date && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600">Launch Date</span>
                            <span className="font-medium text-gray-900">{new Date(displayCoupon.tc_launch_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-4">Terms & Conditions</h4>
                    <div className="text-sm text-gray-700 whitespace-pre-line">
                      {displayCoupon.tc_terms_conditions || '—'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-4">Edit Details</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                      <input
                        type="text"
                        value={editedCoupon.tc_title}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_title: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <select
                        value={editedCoupon.tc_status}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_status: e.target.value as any })}
                        className={inputClass}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="declined">Declined</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                      <select
                        value={editedCoupon.tc_company_id || ''}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_company_id: e.target.value || undefined })}
                        className={inputClass}
                      >
                        <option value="">Admin Created</option>
                        {companies.map((company) => (
                          <option key={company.tc_id} value={company.tc_id}>
                            {company.tc_company_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Coupon Code</label>
                      <input
                        type="text"
                        value={editedCoupon.tc_coupon_code || ''}
                        onChange={(e) =>
                          setEditedCoupon({ ...editedCoupon, tc_coupon_code: e.target.value.toUpperCase() || null })
                        }
                        className={inputClass}
                        placeholder="Optional coupon code"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Discount Type</label>
                      <select
                        value={editedCoupon.tc_discount_type || ''}
                        onChange={(e) =>
                          setEditedCoupon({
                            ...editedCoupon,
                            tc_discount_type: (e.target.value || null) as 'percentage' | 'fixed_amount' | null,
                          })
                        }
                        className={inputClass}
                      >
                        <option value="">Not specified</option>
                        <option value="percentage">Percentage</option>
                        <option value="fixed_amount">Fixed Amount</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Discount Value</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editedCoupon.tc_discount_value ?? ''}
                        onChange={(e) =>
                          setEditedCoupon({
                            ...editedCoupon,
                            tc_discount_value: e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                          })
                        }
                        className={inputClass}
                        placeholder="Optional value"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Share Reward (USDT)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editedCoupon.tc_share_reward_amount}
                        onChange={(e) =>
                          setEditedCoupon({ ...editedCoupon, tc_share_reward_amount: parseFloat(e.target.value) || 0 })
                        }
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Usage Limit</label>
                      <input
                        type="number"
                        min="1"
                        value={editedCoupon.tc_usage_limit ?? ''}
                        onChange={(e) =>
                          setEditedCoupon({
                            ...editedCoupon,
                            tc_usage_limit: e.target.value === '' ? null : parseInt(e.target.value) || 0,
                          })
                        }
                        className={inputClass}
                        placeholder="Optional. Defaults to 1000"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Valid From</label>
                      <input
                        type="date"
                        value={formatDateForInput(editedCoupon.tc_valid_from)}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_valid_from: e.target.value })}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Valid Until</label>
                      <input
                        type="date"
                        value={formatDateForInput(editedCoupon.tc_valid_until)}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_valid_until: e.target.value })}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Launch Date</label>
                      <input
                        type="date"
                        value={formatDateForInput(editedCoupon.tc_launch_date || '')}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_launch_date: e.target.value })}
                        className={inputClass}
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave empty if not scheduled</p>
                    </div>

                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={editedCoupon.tc_is_active}
                          onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_is_active: e.target.checked })}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        Active
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={editedCoupon.tc_launch_now}
                          onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_launch_now: e.target.checked })}
                          className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                        />
                        Launch now
                      </label>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Website URL</label>
                      <input
                        type="url"
                        value={editedCoupon.tc_website_url || ''}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_website_url: e.target.value })}
                        className={inputClass}
                        placeholder="https://example.com"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Image URL</label>
                      <input
                        type="url"
                        value={editedCoupon.tc_image_url || ''}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_image_url: e.target.value })}
                        className={inputClass}
                        placeholder="https://example.com/image.jpg"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                      <textarea
                        value={editedCoupon.tc_description || ''}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_description: e.target.value })}
                        rows={4}
                        className={inputClass}
                        placeholder="Add details (new lines or “-” bullets show as bullet points to customers)..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Terms & Conditions</label>
                      <textarea
                        value={editedCoupon.tc_terms_conditions || ''}
                        onChange={(e) => setEditedCoupon({ ...editedCoupon, tc_terms_conditions: e.target.value })}
                        rows={4}
                        className={inputClass}
                        placeholder="Enter terms and conditions..."
                      />
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

export default CouponManagement;
