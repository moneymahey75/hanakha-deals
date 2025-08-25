import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import {
  Building,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Phone,
  Globe,
  FileText,
  Calendar,
  ArrowLeft,
  Save,
  X,
  AlertTriangle,
  User,
  Settings
} from 'lucide-react';

interface Company {
  tc_id: string;
  tc_user_id: string;
  tc_company_name: string;
  tc_brand_name?: string;
  tc_business_type?: string;
  tc_business_category?: string;
  tc_registration_number: string;
  tc_gstin: string;
  tc_website_url?: string;
  tc_official_email: string;
  tc_affiliate_code?: string;
  tc_verification_status: 'pending' | 'verified' | 'rejected';
  tc_created_at: string;
  tc_updated_at: string;
  user_info?: {
    email: string;
    is_active: boolean;
  };
}

const CompanyManagement: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [showCompanyDetails, setShowCompanyDetails] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const notification = useNotification();

  const [newCompany, setNewCompany] = useState({
    company_name: '',
    brand_name: '',
    business_type: '',
    business_category: '',
    registration_number: '',
    gstin: '',
    website_url: '',
    official_email: '',
    affiliate_code: '',
    verification_status: 'verified' as 'pending' | 'verified' | 'rejected',
    user_email: '',
    password: ''
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading companies from database...');

      const { data: companiesData, error } = await supabase
        .from('tbl_companies')
        .select(`
          *,
          tbl_users(tu_email, tu_is_active)
        `)
        .order('tc_created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to load companies:', error);
        // Don't throw error, just show empty state with error message
        setCompanies([]);
        notification.showError('Load Failed', `Failed to load company data: ${error.message}`);
        return;
      }

      console.log('📊 Raw companies data:', companiesData);

      const formattedCompanies = (companiesData || []).map(company => ({
        ...company,
        user_info: {
          email: company.tbl_users?.tu_email || company.tc_official_email || '',
          is_active: company.tbl_users?.tu_is_active ?? true
        }
      }));

      console.log('✅ Formatted companies:', formattedCompanies);
      setCompanies(formattedCompanies);
    } catch (error) {
      console.error('Failed to load companies:', error);
      setCompanies([]);
      notification.showError('Load Failed', `Unexpected error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCompany = async (companyId: string) => {
    try {
      const { error } = await supabase
        .from('tbl_companies')
        .update({ tc_verification_status: 'verified' })
        .eq('tc_id', companyId);

      if (error) throw error;

      notification.showSuccess('Company Approved', 'Company has been verified and approved');
      loadCompanies();
    } catch (error) {
      console.error('Failed to approve company:', error);
      notification.showError('Approval Failed', 'Failed to approve company');
    }
  };

  const handleRejectCompany = async (companyId: string) => {
    if (!confirm('Are you sure you want to reject this company registration?')) return;

    try {
      const { error } = await supabase
        .from('tbl_companies')
        .update({ tc_verification_status: 'rejected' })
        .eq('tc_id', companyId);

      if (error) throw error;

      notification.showSuccess('Company Rejected', 'Company registration has been rejected');
      loadCompanies();
    } catch (error) {
      console.error('Failed to reject company:', error);
      notification.showError('Rejection Failed', 'Failed to reject company');
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!confirm('Are you sure you want to delete this company? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('tbl_companies')
        .delete()
        .eq('tc_id', companyId);

      if (error) throw error;

      notification.showSuccess('Company Deleted', 'Company has been deleted successfully');
      loadCompanies();
    } catch (error) {
      console.error('Failed to delete company:', error);
      notification.showError('Deletion Failed', 'Failed to delete company');
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      console.log('🏢 Creating company account...');
      
      // Create user account via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newCompany.user_email,
        password: newCompany.password,
        options: {
          emailRedirectTo: undefined // Disable email confirmation for admin-created accounts
        }
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create user account');
      }

      console.log('✅ User account created:', authData.user.id);

      // Create user record in tbl_users
      const { error: userError } = await supabase
        .from('tbl_users')
        .insert({
          tu_id: authData.user.id,
          tu_email: newCompany.user_email,
          tu_user_type: 'company',
          tu_is_verified: true,
          tu_email_verified: true,
          tu_mobile_verified: true, // Admin-created accounts are pre-verified
          tu_is_active: true
        });

      if (userError) throw userError;
      console.log('✅ User record created in tbl_users');

      // Create company record
      const { error: companyError } = await supabase
        .from('tbl_companies')
        .insert({
          tc_user_id: authData.user.id,
          tc_company_name: newCompany.company_name,
          tc_brand_name: newCompany.brand_name,
          tc_business_type: newCompany.business_type,
          tc_business_category: newCompany.business_category,
          tc_registration_number: newCompany.registration_number,
          tc_gstin: newCompany.gstin,
          tc_website_url: newCompany.website_url,
          tc_official_email: newCompany.official_email,
          tc_affiliate_code: newCompany.affiliate_code,
          tc_verification_status: newCompany.verification_status
        });

      if (companyError) throw companyError;
      console.log('✅ Company record created in tbl_companies');

      notification.showSuccess('Company Created', 'Company account has been created successfully');
      setShowCreateModal(false);
      resetNewCompany();
      loadCompanies();
    } catch (error) {
      console.error('Failed to create company:', error);
      notification.showError('Creation Failed', `Failed to create company account: ${error.message}`);
    }
  };

  const resetNewCompany = () => {
    setNewCompany({
      company_name: '',
      brand_name: '',
      business_type: '',
      business_category: '',
      registration_number: '',
      gstin: '',
      website_url: '',
      official_email: '',
      affiliate_code: '',
      verification_status: 'verified',
      user_email: '',
      password: ''
    });
  };

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = 
      company.tc_company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.tc_official_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.tc_registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      company.tc_gstin.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && company.user_info?.is_active) ||
      (statusFilter === 'inactive' && !company.user_info?.is_active);

    const matchesVerification = 
      verificationFilter === 'all' || company.tc_verification_status === verificationFilter;

    return matchesSearch && matchesStatus && matchesVerification;
  });

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Companies</h3>
          <p className="text-gray-600">Please wait while we fetch company data...</p>
        </div>
      </div>
    );
  }

  // Add error state for when companies fail to load
  if (!loading && companies.length === 0 && !showCreateModal) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="text-center py-12">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Companies Found</h3>
          <p className="text-gray-600 mb-6">
            Either no companies are registered or there's a database connection issue.
          </p>
          <div className="space-y-3">
            <button
              onClick={loadCompanies}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 mx-auto"
            >
              <Eye className="h-4 w-4" />
              <span>Retry Loading</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Company</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showCompanyDetails && selectedCompany) {
    return (
      <CompanyDetails
        company={selectedCompany}
        onBack={() => {
          setShowCompanyDetails(false);
          setSelectedCompany(null);
          setEditMode(false);
        }}
        onUpdate={loadCompanies}
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
            <div className="bg-green-100 p-3 rounded-lg">
              <Building className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Company Management</h3>
              <p className="text-gray-600">Manage company registrations and verifications</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Total: {companies.length} companies
            </div>
            <button
              onClick={loadCompanies}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <Eye className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Company</span>
            </button>
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
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Search by company name, email, registration number..."
              />
            </div>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="all">All Verification</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Companies List */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Business Info
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Verification
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Registered
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCompanies.map((company) => (
              <tr key={company.tc_id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center">
                        <span className="text-white font-medium text-sm">
                          {company.tc_company_name.charAt(0)}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {company.tc_company_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {company.tc_brand_name}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{company.tc_official_email}</div>
                  <div className="text-sm text-gray-500">{company.user_info?.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{company.tc_business_type}</div>
                  <div className="text-sm text-gray-500">{company.tc_business_category}</div>
                  <div className="text-xs text-gray-400">GST: {company.tc_gstin}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    company.tc_verification_status === 'verified'
                      ? 'bg-green-100 text-green-800'
                      : company.tc_verification_status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {company.tc_verification_status === 'verified' && <CheckCircle className="h-3 w-3 mr-1" />}
                    {company.tc_verification_status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                    {company.tc_verification_status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                    {company.tc_verification_status.charAt(0).toUpperCase() + company.tc_verification_status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(company.tc_created_at).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setSelectedCompany(company);
                        setShowCompanyDetails(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {company.tc_verification_status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApproveCompany(company.tc_id)}
                          className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                          title="Approve"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleRejectCompany(company.tc_id)}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                          title="Reject"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteCompany(company.tc_id)}
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

      {filteredCompanies.length === 0 && (
        <div className="text-center py-12">
          <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No companies found</h3>
          <p className="text-gray-600">
            {searchTerm || statusFilter !== 'all' || verificationFilter !== 'all'
              ? 'Try adjusting your search criteria'
              : 'No companies have been registered yet'
            }
          </p>
          {!searchTerm && statusFilter === 'all' && verificationFilter === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              Create First Company
            </button>
          )}
        </div>
      )}

      {/* Create Company Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Create New Company</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetNewCompany();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="space-y-6">
              {/* Account Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 mb-3">Account Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Login Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={newCompany.user_email}
                      onChange={(e) => setNewCompany(prev => ({ ...prev, user_email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="login@company.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={newCompany.password}
                      onChange={(e) => setNewCompany(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Secure password"
                    />
                  </div>
                </div>
              </div>

              {/* Company Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCompany.company_name}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, company_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter company name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={newCompany.brand_name}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, brand_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter brand name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Business Type
                  </label>
                  <select
                    value={newCompany.business_type}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, business_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">Select business type</option>
                    <option value="Private Limited Company">Private Limited Company</option>
                    <option value="Public Limited Company">Public Limited Company</option>
                    <option value="Partnership">Partnership</option>
                    <option value="LLP">LLP</option>
                    <option value="Sole Proprietorship">Sole Proprietorship</option>
                    <option value="Trust">Trust</option>
                    <option value="Society">Society</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Business Category
                  </label>
                  <select
                    value={newCompany.business_category}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, business_category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="">Select business category</option>
                    <option value="Technology">Technology</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Finance">Finance</option>
                    <option value="Education">Education</option>
                    <option value="Retail">Retail</option>
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Services">Services</option>
                    <option value="Agriculture">Agriculture</option>
                    <option value="Real Estate">Real Estate</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Registration Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCompany.registration_number}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, registration_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Company registration number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GSTIN *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCompany.gstin}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, gstin: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="GST identification number"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={newCompany.website_url}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, website_url: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="https://www.company.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Official Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={newCompany.official_email}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, official_email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="contact@company.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Affiliate Code
                  </label>
                  <input
                    type="text"
                    value={newCompany.affiliate_code}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, affiliate_code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Optional affiliate code"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Status *
                  </label>
                  <select
                    value={newCompany.verification_status}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, verification_status: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetNewCompany();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>Create Company</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Company Details Component
const CompanyDetails: React.FC<{
  company: Company;
  onBack: () => void;
  onUpdate: () => void;
  editMode: boolean;
  setEditMode: (mode: boolean) => void;
}> = ({ company, onBack, onUpdate, editMode, setEditMode }) => {
  const [editData, setEditData] = useState({
    company_name: company.tc_company_name,
    brand_name: company.tc_brand_name || '',
    business_type: company.tc_business_type || '',
    business_category: company.tc_business_category || '',
    registration_number: company.tc_registration_number,
    gstin: company.tc_gstin,
    website_url: company.tc_website_url || '',
    official_email: company.tc_official_email,
    affiliate_code: company.tc_affiliate_code || '',
    verification_status: company.tc_verification_status
  });
  const notification = useNotification();

  const handleSaveEdit = async () => {
    try {
      const { error } = await supabase
        .from('tbl_companies')
        .update({
          tc_company_name: editData.company_name,
          tc_brand_name: editData.brand_name,
          tc_business_type: editData.business_type,
          tc_business_category: editData.business_category,
          tc_registration_number: editData.registration_number,
          tc_gstin: editData.gstin,
          tc_website_url: editData.website_url,
          tc_official_email: editData.official_email,
          tc_affiliate_code: editData.affiliate_code,
          tc_verification_status: editData.verification_status
        })
        .eq('tc_id', company.tc_id);

      if (error) throw error;

      notification.showSuccess('Company Updated', 'Company information has been updated successfully');
      setEditMode(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update company:', error);
      notification.showError('Update Failed', 'Failed to update company information');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Companies</span>
            </button>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {company.tc_company_name}
              </h3>
              <p className="text-gray-600">Company Details & Management</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {editMode ? (
              <div className="flex space-x-2">
                <button
                  onClick={handleSaveEdit}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Changes</span>
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
                >
                  <X className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Edit className="h-4 w-4" />
                <span>Edit Company</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Company Information */}
          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-4 flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Company Information
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Company Name</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editData.company_name}
                      onChange={(e) => setEditData(prev => ({ ...prev, company_name: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1">{company.tc_company_name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Brand Name</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editData.brand_name}
                      onChange={(e) => setEditData(prev => ({ ...prev, brand_name: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1">{company.tc_brand_name || 'Not provided'}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Business Type</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editData.business_type}
                      onChange={(e) => setEditData(prev => ({ ...prev, business_type: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1">{company.tc_business_type || 'Not specified'}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Business Category</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editData.business_category}
                      onChange={(e) => setEditData(prev => ({ ...prev, business_category: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1">{company.tc_business_category || 'Not specified'}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Legal & Contact Information */}
          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-4 flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Legal & Contact Information
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Registration Number</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editData.registration_number}
                      onChange={(e) => setEditData(prev => ({ ...prev, registration_number: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1 font-mono">{company.tc_registration_number}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">GSTIN</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editData.gstin}
                      onChange={(e) => setEditData(prev => ({ ...prev, gstin: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1 font-mono">{company.tc_gstin}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Website URL</label>
                  {editMode ? (
                    <input
                      type="url"
                      value={editData.website_url}
                      onChange={(e) => setEditData(prev => ({ ...prev, website_url: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1">
                      {company.tc_website_url ? (
                        <a href={company.tc_website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                          {company.tc_website_url}
                        </a>
                      ) : (
                        'Not provided'
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Official Email</label>
                  {editMode ? (
                    <input
                      type="email"
                      value={editData.official_email}
                      onChange={(e) => setEditData(prev => ({ ...prev, official_email: e.target.value }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 mt-1">{company.tc_official_email}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Verification Status</label>
                  {editMode ? (
                    <select
                      value={editData.verification_status}
                      onChange={(e) => setEditData(prev => ({ ...prev, verification_status: e.target.value as any }))}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="pending">Pending</option>
                      <option value="verified">Verified</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  ) : (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium mt-1 ${
                      company.tc_verification_status === 'verified'
                        ? 'bg-green-100 text-green-800'
                        : company.tc_verification_status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {company.tc_verification_status === 'verified' && <CheckCircle className="h-4 w-4 mr-1" />}
                      {company.tc_verification_status === 'pending' && <Clock className="h-4 w-4 mr-1" />}
                      {company.tc_verification_status === 'rejected' && <XCircle className="h-4 w-4 mr-1" />}
                      {company.tc_verification_status.charAt(0).toUpperCase() + company.tc_verification_status.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyManagement;