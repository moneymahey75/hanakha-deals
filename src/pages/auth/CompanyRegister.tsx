import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Eye, EyeOff, Building, Mail, Globe, FileText, Users } from 'lucide-react';
import ReCaptcha from '../../components/ui/ReCaptcha';

const CompanyRegister: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    tc_company_name: '',
    tc_brand_name: '',
    tc_business_type: '',
    tc_business_category: '',
    tc_registration_number: '',
    tc_gstin: '',
    tc_website_url: '',
    tc_official_email: '',
    tc_affiliate_code: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  const businessTypes = [
    'Private Limited Company',
    'Public Limited Company',
    'Partnership',
    'LLP',
    'Sole Proprietorship',
    'Trust',
    'Society',
    'Other'
  ];

  const businessCategories = [
    'Technology',
    'Healthcare',
    'Finance',
    'Education',
    'Retail',
    'Manufacturing',
    'Services',
    'Agriculture',
    'Real Estate',
    'Other'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    console.log('🚀 Starting company registration process...');

    if (!recaptchaToken) {
      setError('Please complete the reCAPTCHA verification');
      setIsSubmitting(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsSubmitting(false);
      return;
    }

    if (!formData.acceptTerms) {
      setError('Please accept the terms and conditions');
      setIsSubmitting(false);
      return;
    }

    try {
      console.log('📝 Registering company with data:', {
        tc_company_name: formData.tc_company_name,
        tc_official_email: formData.tc_official_email
      });
      
      // First, register the user using AuthContext
      console.log('👤 Registering user:', formData.tc_official_email);
      const { user: registeredUser, error: registerError } = await register({
        email: formData.tc_official_email,
        password: formData.password,
        user_type: 'company'
      }, 'company');

      if (registerError) {
        throw new Error(registerError.message);
      }

      console.log('✅ User registered successfully with ID:', registeredUser.id);

      // Then, create the company record in tbl_companies with user ID
      console.log('🏢 Creating company record for user ID:', registeredUser.id);
      const { data: companyData, error: companyError } = await supabase
        .from('tbl_companies')
        .insert([
          {
            tc_company_name: formData.tc_company_name,
            tc_brand_name: formData.tc_brand_name,
            tc_business_type: formData.tc_business_type,
            tc_business_category: formData.tc_business_category,
            tc_registration_number: formData.tc_registration_number,
            tc_gstin: formData.tc_gstin,
            tc_website_url: formData.tc_website_url,
            tc_official_email: formData.tc_official_email,
            tc_affiliate_code: formData.tc_affiliate_code,
            tc_verification_status: 'pending',
            tc_user_id: registeredUser.id // Link to the user who created the company
          }
        ])
        .select();

      if (companyError) {
        console.error('❌ Company creation error:', companyError);
        
        // If company creation fails, we might want to delete the user account
        // to maintain data consistency (optional)
        try {
          await supabase.auth.admin.deleteUser(registeredUser.id);
          console.log('🧹 Cleaned up user account due to company creation failure');
        } catch (deleteError) {
          console.error('Failed to clean up user account:', deleteError);
        }
        
        throw new Error(companyError.message);
      }

      console.log('✅ Company registration successful:', companyData);
      
      // Redirect to company dashboard
      navigate('/company/dashboard', { 
        state: { message: 'Company registration successful!' } 
      });
    } catch (err) {
      console.error('❌ Company registration error:', err);
      setError(err.message || 'An error occurred during registration');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white p-8 rounded-2xl shadow-xl">
          <div className="text-center mb-8">
            <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Company Registration</h2>
            <p className="mt-2 text-gray-600">Register your company account</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="tc_company_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="tc_company_name"
                    name="tc_company_name"
                    type="text"
                    required
                    value={formData.tc_company_name}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter company name"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="tc_brand_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Brand Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="tc_brand_name"
                    name="tc_brand_name"
                    type="text"
                    value={formData.tc_brand_name}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter brand name"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="tc_business_type" className="block text-sm font-medium text-gray-700 mb-2">
                  Business Type
                </label>
                <select
                  id="tc_business_type"
                  name="tc_business_type"
                  value={formData.tc_business_type}
                  onChange={handleChange}
                  className="block w-full py-3 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select business type</option>
                  {businessTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="tc_business_category" className="block text-sm font-medium text-gray-700 mb-2">
                  Business Category
                </label>
                <select
                  id="tc_business_category"
                  name="tc_business_category"
                  value={formData.tc_business_category}
                  onChange={handleChange}
                  className="block w-full py-3 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select business category</option>
                  {businessCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="tc_registration_number" className="block text-sm font-medium text-gray-700 mb-2">
                  Company Registration Number *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="tc_registration_number"
                    name="tc_registration_number"
                    type="text"
                    required
                    value={formData.tc_registration_number}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter registration number"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="tc_gstin" className="block text-sm font-medium text-gray-700 mb-2">
                  GSTIN *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="tc_gstin"
                    name="tc_gstin"
                    type="text"
                    required
                    value={formData.tc_gstin}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter GSTIN"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="tc_website_url" className="block text-sm font-medium text-gray-700 mb-2">
                  Website URL
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Globe className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="tc_website_url"
                    name="tc_website_url"
                    type="url"
                    value={formData.tc_website_url}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="https://www.example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="tc_official_email" className="block text-sm font-medium text-gray-700 mb-2">
                  Official Email Address *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="tc_official_email"
                    name="tc_official_email"
                    type="email"
                    required
                    value={formData.tc_official_email}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="company@example.com"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="tc_affiliate_code" className="block text-sm font-medium text-gray-700 mb-2">
                Affiliate Code / Referral ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Users className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="tc_affiliate_code"
                  name="tc_affiliate_code"
                  type="text"
                  value={formData.tc_affiliate_code}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter affiliate code (optional)"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Password *
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full py-3 px-4 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Choose a strong password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="block w-full py-3 px-4 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="acceptTerms"
                name="acceptTerms"
                type="checkbox"
                checked={formData.acceptTerms}
                onChange={handleChange}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <label htmlFor="acceptTerms" className="ml-2 block text-sm text-gray-700">
                I accept the{' '}
                <Link to="#" className="text-green-600 hover:text-green-500">
                  Terms and Conditions
                </Link>
              </label>
            </div>

            <ReCaptcha onVerify={setRecaptchaToken} />

            <button
              type="submit"
              disabled={isSubmitting || !recaptchaToken}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Creating Company Account...</span>
                </>
              ) : (
                <span>Create Company Account</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              Already have a company account?{' '}
              <Link to="/company/login" className="text-green-600 hover:text-green-500 font-medium">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyRegister;