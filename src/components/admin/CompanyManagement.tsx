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
  const notification = useNotification();

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading companies from database...');

      const { data, error } = await supabase
        .from('tbl_companies')
        .select(`
          *,
          tbl_users!inner(tu_email, tu_is_active)
        `)
        .order('tc_created_at', { ascending: false });

      if (error) {
        console.error('❌ Failed to load companies:', error);
        throw error;
      }

      const formattedCompanies = (data || []).map(company => ({
        ...company,
        user_info: {
          email: company.tbl_users?.tu_email || '',
          is_active: company.tbl_users?.tu_is_active || false
        }
      }));

      setCompanies(formattedCompanies);
      console.log('✅ Companies loaded:', formattedCompanies.length);
    } catch (error) {
      console.error('Failed to load companies:', error);
      notification.showError('Load Failed', 'Failed to load company data');
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
          <div className="text-sm text-gray-500">
            Total: {companies.length} companies
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
              : 'No companies have registered yet'
            }
          </p>
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