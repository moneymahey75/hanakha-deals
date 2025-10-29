import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../../contexts/AdminContext';
import { Eye, EyeOff, Building, Mail, Globe, FileText, Users, Lock, Info, CheckCircle, XCircle } from 'lucide-react';
import ReCaptcha from '../../components/ui/ReCaptcha';

interface PasswordValidation {
  isValid: boolean;
  errors: string[];
  requirements: {
    minLength: boolean;
    maxLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
    noCommon: boolean;
    noSequences: boolean;
    noRepeats: boolean;
    minUniqueChars: boolean;
  };
}

const CompanyRegister: React.FC = () => {
  const { register } = useAuth();
  const { settings } = useAdmin();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    brandName: '',
    businessType: '',
    businessCategory: '',
    registrationNumber: '',
    gstin: '',
    websiteUrl: '',
    email: '',
    affiliateCode: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showPasswordTooltip, setShowPasswordTooltip] = useState(false);

  // Password validation state
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidation>({
    isValid: false,
    errors: [],
    requirements: {
      minLength: false,
      maxLength: false,
      hasUppercase: false,
      hasLowercase: false,
      hasNumber: false,
      hasSpecialChar: false,
      noCommon: false,
      noSequences: false,
      noRepeats: false,
      minUniqueChars: false
    }
  });

  const passwordTimeout = useRef<NodeJS.Timeout>();
  const tooltipTimeout = useRef<NodeJS.Timeout>();

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

  // Debounced password validation
  useEffect(() => {
    if (passwordTimeout.current) {
      clearTimeout(passwordTimeout.current);
    }

    if (formData.password) {
      passwordTimeout.current = setTimeout(() => {
        validatePassword(formData.password);
      }, 200);
    } else {
      setPasswordValidation({
        isValid: false,
        errors: [],
        requirements: {
          minLength: false,
          maxLength: false,
          hasUppercase: false,
          hasLowercase: false,
          hasNumber: false,
          hasSpecialChar: false,
          noCommon: false,
          noSequences: false,
          noRepeats: false,
          minUniqueChars: false
        }
      });
    }

    return () => {
      if (passwordTimeout.current) {
        clearTimeout(passwordTimeout.current);
      }
    };
  }, [formData.password]);

  // Password validation function
  const validatePassword = useCallback((password: string) => {
    if (!password) {
      setPasswordValidation({
        isValid: false,
        errors: [],
        requirements: {
          minLength: false,
          maxLength: false,
          hasUppercase: false,
          hasLowercase: false,
          hasNumber: false,
          hasSpecialChar: false,
          noCommon: false,
          noSequences: false,
          noRepeats: false,
          minUniqueChars: false
        }
      });
      return;
    }

    const errors: string[] = [];
    const requirements = {
      minLength: password.length >= settings.passwordMinLength,
      maxLength: password.length <= settings.passwordMaxLength,
      hasUppercase: settings.passwordRequireUppercase ? /[A-Z]/.test(password) : true,
      hasLowercase: settings.passwordRequireLowercase ? /[a-z]/.test(password) : true,
      hasNumber: settings.passwordRequireNumbers ? /\d/.test(password) : true,
      hasSpecialChar: settings.passwordRequireSpecialChars ?
          new RegExp(`[${settings.passwordAllowedSpecialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`).test(password) : true,
      noCommon: settings.passwordPreventCommon ? !isCommonPassword(password) : true,
      noSequences: settings.passwordPreventSequences ? !hasSequences(password) : true,
      noRepeats: settings.passwordPreventRepeats ? !hasRepeatedChars(password, settings.passwordMaxConsecutive) : true,
      minUniqueChars: getUniqueCharsCount(password) >= settings.passwordMinUniqueChars
    };

    // Check individual requirements and add errors
    if (!requirements.minLength) {
      errors.push(`Password must be at least ${settings.passwordMinLength} characters`);
    }

    if (!requirements.maxLength) {
      errors.push(`Password must not exceed ${settings.passwordMaxLength} characters`);
    }

    if (settings.passwordRequireUppercase && !requirements.hasUppercase) {
      errors.push('Password must contain at least one uppercase letter (A-Z)');
    }

    if (settings.passwordRequireLowercase && !requirements.hasLowercase) {
      errors.push('Password must contain at least one lowercase letter (a-z)');
    }

    if (settings.passwordRequireNumbers && !requirements.hasNumber) {
      errors.push('Password must contain at least one number (0-9)');
    }

    if (settings.passwordRequireSpecialChars && !requirements.hasSpecialChar) {
      errors.push(`Password must contain at least one special character: ${settings.passwordAllowedSpecialChars}`);
    }

    if (settings.passwordPreventCommon && !requirements.noCommon) {
      errors.push('Password is too common. Please choose a stronger password');
    }

    if (settings.passwordPreventSequences && !requirements.noSequences) {
      errors.push('Password contains sequential characters (abc, 123, etc.)');
    }

    if (settings.passwordPreventRepeats && !requirements.noRepeats) {
      errors.push(`Password contains more than ${settings.passwordMaxConsecutive} consecutive identical characters`);
    }

    if (!requirements.minUniqueChars) {
      errors.push(`Password must contain at least ${settings.passwordMinUniqueChars} unique characters`);
    }

    setPasswordValidation({
      isValid: errors.length === 0,
      errors,
      requirements
    });
  }, [settings]);

  // Helper functions for password validation
  const isCommonPassword = (password: string): boolean => {
    const commonPasswords = [
      'password', '123456', 'password123', 'qwerty', 'letmein', 'welcome',
      'admin', '12345678', '123456789', '12345', '1234567', '1234567890',
      'abc123', 'password1', '1234', 'test', 'guest', 'passw0rd',
      'company', 'business', 'admin123', 'company123'
    ];
    return commonPasswords.includes(password.toLowerCase());
  };

  const hasSequences = (password: string): boolean => {
    // Check for sequential characters (abc, 123, etc.)
    const sequences = [
      'abc', 'bcd', 'cde', 'def', 'efg', 'fgh', 'ghi', 'hij', 'ijk', 'jkl',
      'klm', 'lmn', 'mno', 'nop', 'opq', 'pqr', 'qrs', 'rst', 'stu', 'tuv',
      'uvw', 'vwx', 'wxy', 'xyz',
      '012', '123', '234', '345', '456', '567', '678', '789', '890',
      'qwe', 'wer', 'ert', 'rty', 'tyu', 'yui', 'uio', 'iop', 'asd',
      'sdf', 'dfg', 'fgh', 'ghj', 'hjk', 'jkl', 'zxc', 'xcv', 'cvb', 'vbn', 'bnm'
    ];

    const lowerPassword = password.toLowerCase();
    return sequences.some(seq => lowerPassword.includes(seq));
  };

  const hasRepeatedChars = (password: string, maxConsecutive: number): boolean => {
    let currentChar = '';
    let currentCount = 0;

    for (let i = 0; i < password.length; i++) {
      if (password[i] === currentChar) {
        currentCount++;
        if (currentCount > maxConsecutive) {
          return true;
        }
      } else {
        currentChar = password[i];
        currentCount = 1;
      }
    }
    return false;
  };

  const getUniqueCharsCount = (password: string): number => {
    const uniqueChars = new Set(password);
    return uniqueChars.size;
  };

  const handlePasswordTooltip = useCallback((show: boolean) => {
    if (tooltipTimeout.current) {
      clearTimeout(tooltipTimeout.current);
    }

    if (show) {
      setShowPasswordTooltip(true);
    } else {
      tooltipTimeout.current = setTimeout(() => {
        setShowPasswordTooltip(false);
      }, 300);
    }
  }, []);

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

    if (!passwordValidation.isValid && formData.password) {
      setError('Please fix password validation errors');
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
      console.log('📝 Calling register function with company data:', {
        email: formData.email,
        companyName: formData.companyName,
        registrationNumber: formData.registrationNumber
      });

      await register(formData, 'company');

      console.log('✅ Company registration successful, redirecting to dashboard...');
      navigate('/company/dashboard');
    } catch (err) {
      console.error('❌ Company registration error in component:', err);
      // Error is now handled by notification system
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
              <p className="mt-2 text-gray-600">Join our business network and grow together</p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="companyName"
                        name="companyName"
                        type="text"
                        required
                        value={formData.companyName}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Enter company name"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="brandName" className="block text-sm font-medium text-gray-700 mb-2">
                    Brand Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="brandName"
                        name="brandName"
                        type="text"
                        value={formData.brandName}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Enter brand name"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="businessType" className="block text-sm font-medium text-gray-700 mb-2">
                    Business Type
                  </label>
                  <select
                      id="businessType"
                      name="businessType"
                      value={formData.businessType}
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
                  <label htmlFor="businessCategory" className="block text-sm font-medium text-gray-700 mb-2">
                    Business Category
                  </label>
                  <select
                      id="businessCategory"
                      name="businessCategory"
                      value={formData.businessCategory}
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
                  <label htmlFor="registrationNumber" className="block text-sm font-medium text-gray-700 mb-2">
                    Company Registration Number *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FileText className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="registrationNumber"
                        name="registrationNumber"
                        type="text"
                        required
                        value={formData.registrationNumber}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Enter registration number"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="gstin" className="block text-sm font-medium text-gray-700 mb-2">
                    GSTIN *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FileText className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="gstin"
                        name="gstin"
                        type="text"
                        required
                        value={formData.gstin}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="Enter GSTIN"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-700 mb-2">
                    Website URL
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Globe className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="websiteUrl"
                        name="websiteUrl"
                        type="url"
                        value={formData.websiteUrl}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="https://www.example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Official Email Address *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="company@example.com"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="affiliateCode" className="block text-sm font-medium text-gray-700 mb-2">
                  Affiliate Code / Referral ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                      id="affiliateCode"
                      name="affiliateCode"
                      type="text"
                      value={formData.affiliateCode}
                      onChange={handleChange}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Enter affiliate code (optional)"
                  />
                </div>
              </div>

              {/* Enhanced Password Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center mb-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Enter Password *
                    </label>
                    <div
                        className="relative ml-2"
                        onMouseEnter={() => handlePasswordTooltip(true)}
                        onMouseLeave={() => handlePasswordTooltip(false)}
                    >
                      <Info className="h-4 w-4 text-gray-400 cursor-help" />
                      {showPasswordTooltip && (
                          <div className="absolute z-10 w-80 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg bottom-full mb-2 left-1/2 transform -translate-x-1/2">
                            <div className="font-medium mb-1">Password Requirements:</div>
                            <ul className="space-y-1">
                              <li>• {settings.passwordMinLength}-{settings.passwordMaxLength} characters</li>
                              {settings.passwordRequireUppercase && <li>• At least one uppercase letter (A-Z)</li>}
                              {settings.passwordRequireLowercase && <li>• At least one lowercase letter (a-z)</li>}
                              {settings.passwordRequireNumbers && <li>• At least one number (0-9)</li>}
                              {settings.passwordRequireSpecialChars && (
                                  <li>• At least one special character: {settings.passwordAllowedSpecialChars}</li>
                              )}
                              {settings.passwordPreventCommon && <li>• Cannot be a common password</li>}
                              {settings.passwordPreventSequences && <li>• Cannot contain sequences (abc, 123)</li>}
                              {settings.passwordPreventRepeats && (
                                  <li>• Max {settings.passwordMaxConsecutive} consecutive identical characters</li>
                              )}
                              <li>• At least {settings.passwordMinUniqueChars} unique characters</li>
                            </ul>
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={formData.password}
                        onChange={handleChange}
                        className={`block w-full pl-10 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                            formData.password ?
                                (passwordValidation.isValid ? 'border-green-300' : 'border-red-300') :
                                'border-gray-300'
                        }`}
                        placeholder="Choose a strong password"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  {/* Password validation feedback */}
                  {formData.password && (
                      <div className="mt-3 bg-gray-50 rounded-lg p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div className={`flex items-center ${passwordValidation.requirements.minLength ? 'text-green-600' : 'text-red-600'}`}>
                            {passwordValidation.requirements.minLength ? (
                                <CheckCircle className="h-3 w-3 mr-2" />
                            ) : (
                                <XCircle className="h-3 w-3 mr-2" />
                            )}
                            {settings.passwordMinLength}+ characters
                          </div>

                          <div className={`flex items-center ${passwordValidation.requirements.maxLength ? 'text-green-600' : 'text-red-600'}`}>
                            {passwordValidation.requirements.maxLength ? (
                                <CheckCircle className="h-3 w-3 mr-2" />
                            ) : (
                                <XCircle className="h-3 w-3 mr-2" />
                            )}
                            Max {settings.passwordMaxLength} characters
                          </div>

                          {settings.passwordRequireUppercase && (
                              <div className={`flex items-center ${passwordValidation.requirements.hasUppercase ? 'text-green-600' : 'text-red-600'}`}>
                                {passwordValidation.requirements.hasUppercase ? (
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                ) : (
                                    <XCircle className="h-3 w-3 mr-2" />
                                )}
                                Uppercase letter
                              </div>
                          )}

                          {settings.passwordRequireLowercase && (
                              <div className={`flex items-center ${passwordValidation.requirements.hasLowercase ? 'text-green-600' : 'text-red-600'}`}>
                                {passwordValidation.requirements.hasLowercase ? (
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                ) : (
                                    <XCircle className="h-3 w-3 mr-2" />
                                )}
                                Lowercase letter
                              </div>
                          )}

                          {settings.passwordRequireNumbers && (
                              <div className={`flex items-center ${passwordValidation.requirements.hasNumber ? 'text-green-600' : 'text-red-600'}`}>
                                {passwordValidation.requirements.hasNumber ? (
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                ) : (
                                    <XCircle className="h-3 w-3 mr-2" />
                                )}
                                Number
                              </div>
                          )}

                          {settings.passwordRequireSpecialChars && (
                              <div className={`flex items-center ${passwordValidation.requirements.hasSpecialChar ? 'text-green-600' : 'text-red-600'}`}>
                                {passwordValidation.requirements.hasSpecialChar ? (
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                ) : (
                                    <XCircle className="h-3 w-3 mr-2" />
                                )}
                                Special character
                              </div>
                          )}

                          {settings.passwordPreventCommon && (
                              <div className={`flex items-center ${passwordValidation.requirements.noCommon ? 'text-green-600' : 'text-red-600'}`}>
                                {passwordValidation.requirements.noCommon ? (
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                ) : (
                                    <XCircle className="h-3 w-3 mr-2" />
                                )}
                                Not common
                              </div>
                          )}

                          {settings.passwordPreventSequences && (
                              <div className={`flex items-center ${passwordValidation.requirements.noSequences ? 'text-green-600' : 'text-red-600'}`}>
                                {passwordValidation.requirements.noSequences ? (
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                ) : (
                                    <XCircle className="h-3 w-3 mr-2" />
                                )}
                                No sequences
                              </div>
                          )}

                          {settings.passwordPreventRepeats && (
                              <div className={`flex items-center ${passwordValidation.requirements.noRepeats ? 'text-green-600' : 'text-red-600'}`}>
                                {passwordValidation.requirements.noRepeats ? (
                                    <CheckCircle className="h-3 w-3 mr-2" />
                                ) : (
                                    <XCircle className="h-3 w-3 mr-2" />
                                )}
                                Max {settings.passwordMaxConsecutive} repeats
                              </div>
                          )}

                          <div className={`flex items-center ${passwordValidation.requirements.minUniqueChars ? 'text-green-600' : 'text-red-600'}`}>
                            {passwordValidation.requirements.minUniqueChars ? (
                                <CheckCircle className="h-3 w-3 mr-2" />
                            ) : (
                                <XCircle className="h-3 w-3 mr-2" />
                            )}
                            {settings.passwordMinUniqueChars}+ unique chars
                          </div>
                        </div>

                        {/* Password strength indicator */}
                        <div className="mt-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Password strength:</span>
                            <span className={
                              passwordValidation.isValid ? 'text-green-600 font-medium' :
                                  formData.password.length > 0 ? 'text-yellow-600' : 'text-gray-500'
                            }>
                          {passwordValidation.isValid ? 'Strong' :
                              formData.password.length > 0 ? 'Weak' : 'None'}
                        </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all duration-300 ${
                                    passwordValidation.isValid ? 'bg-green-500 w-full' :
                                        formData.password.length > 0 ? 'bg-yellow-500 w-1/2' : 'bg-gray-300 w-0'
                                }`}
                            ></div>
                          </div>
                        </div>
                      </div>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className={`block w-full pl-10 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                            formData.confirmPassword ?
                                (formData.password === formData.confirmPassword ? 'border-green-300' : 'border-red-300') :
                                'border-gray-300'
                        }`}
                        placeholder="Confirm your password"
                    />
                    <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                      <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                  )}
                  {formData.confirmPassword && formData.password === formData.confirmPassword && (
                      <p className="text-xs text-green-600 mt-1">Passwords match ✓</p>
                  )}
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
                  disabled={isSubmitting || !recaptchaToken || !passwordValidation.isValid}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Creating Account...</span>
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