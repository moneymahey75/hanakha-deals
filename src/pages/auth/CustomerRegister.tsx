import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../../contexts/AdminContext';
import { sendOTP, checkSponsorshipNumberExists } from '../../lib/supabase';
import { Eye, EyeOff, User, Mail, Phone, Users, ChevronDown } from 'lucide-react';
import ReCaptcha from '../../components/ui/ReCaptcha';

// Country codes data
const countryCodes = [
  { code: '+91', country: 'India', flag: '🇮🇳' },
  { code: '+972', country: 'Israel', flag: '🇮🇱' },
  { code: '+1', country: 'United States', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+86', country: 'China', flag: '🇨🇳' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+81', country: 'Japan', flag: '🇯🇵' },
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+34', country: 'Spain', flag: '🇪🇸' },
  { code: '+39', country: 'Italy', flag: '🇮🇹' },
  { code: '+55', country: 'Brazil', flag: '🇧🇷' },
  { code: '+7', country: 'Russia', flag: '🇷🇺' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

const CustomerRegister: React.FC = () => {
  const { register } = useAuth();
  const { settings } = useAdmin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    userName: '',
    email: '',
    mobile: '',
    mobileCountryCode: '+91', // Default to India
    parentAccount: '',
    gender: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [validatingReferral, setValidatingReferral] = useState(false);
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // Extract referral code from URL query parameter
  useEffect(() => {
    const referralCode = searchParams.get('ref');
    if (referralCode) {
      console.log('🔗 Referral code detected in URL:', referralCode);
      setFormData(prev => ({
        ...prev,
        parentAccount: referralCode
      }));

      // Automatically validate the referral code
      validateReferralCode(referralCode);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    console.log('🚀 Starting customer registration process...');

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

    if (settings.referralMandatory && !formData.parentAccount) {
      setError('Referral account is mandatory');
      setIsSubmitting(false);
      return;
    }

    // Validate mobile number format (10 digits)
    if (formData.mobile && !/^\d{10}$/.test(formData.mobile)) {
      setError('Mobile number must be exactly 10 digits');
      setIsSubmitting(false);
      return;
    }

    // Validate referral code if provided
    if (formData.parentAccount) {
      console.log('🔍 Validating referral code:', formData.parentAccount);
      try {
        const isValidReferral = await checkSponsorshipNumberExists(formData.parentAccount);
        if (!isValidReferral) {
          setError('Invalid referral code. Please check and try again.');
          setIsSubmitting(false);
          return;
        }
        console.log('✅ Referral code is valid');
      } catch (referralError) {
        console.error('❌ Failed to validate referral code:', referralError);
        setError('Unable to validate referral code at this time. Please try again.');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      console.log('📝 Calling register function with data:', {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        userName: formData.userName,
        mobile: formData.mobileCountryCode + formData.mobile // Combine country code and mobile number
      });

      const userId = await register({
        ...formData,
        mobile: formData.mobileCountryCode + formData.mobile // Combine for registration
      }, 'customer');

      console.log('✅ Registration successful, checking verification requirements...');
      console.log('📋 Current verification settings:', {
        emailVerificationRequired: settings.emailVerificationRequired,
        mobileVerificationRequired: settings.mobileVerificationRequired,
        eitherVerificationRequired: settings.eitherVerificationRequired
      });

      // Determine if any verification is required
      const needsVerification = settings.emailVerificationRequired ||
          settings.mobileVerificationRequired ||
          settings.eitherVerificationRequired;

      if (needsVerification) {
        console.log('🔐 Verification required, redirecting to OTP page...');

        // Send OTP based on verification settings
        try {
          let otpSent = false;
          
          if (settings.emailVerificationRequired) {
            console.log('📧 Sending email OTP...');
            try {
              await sendOTP(userId, userData.email, 'email');
              otpSent = true;
            } catch (emailOtpError) {
              console.warn('⚠️ Email OTP failed:', emailOtpError);
            }
            console.log('✅ Email OTP sent successfully');
          }

          if (settings.mobileVerificationRequired) {
            console.log('📱 Sending mobile OTP...');
            try {
              // Use the combined mobile number with country code for OTP
              await sendOTP(userId, formData.mobileCountryCode + formData.mobile, 'mobile');
              otpSent = true;
            } catch (mobileOtpError) {
              console.warn('⚠️ Mobile OTP failed:', mobileOtpError);
            }
            console.log('✅ Mobile OTP sent successfully');
          }

          if (settings.eitherVerificationRequired) {
            // For "either verification", we'll send both but user only needs to verify one
            console.log('🔄 Either verification enabled - sending both OTPs');
            try {
              await sendOTP(userId, userData.email, 'email');
              otpSent = true;
            } catch (emailOtpError) {
              console.warn('⚠️ Email OTP failed for either verification:', emailOtpError);
            }
            
            try {
              await sendOTP(userId, formData.mobileCountryCode + formData.mobile, 'mobile');
              otpSent = true;
            } catch (mobileOtpError) {
              console.warn('⚠️ Mobile OTP failed for either verification:', mobileOtpError);
            }
          }
          
          if (!otpSent) {
            console.warn('⚠️ No OTP was sent successfully, but continuing to verification page');
          }
        } catch (otpError) {
          console.warn('⚠️ Failed to send OTP, but registration was successful:', otpError);
          // Don't fail registration if OTP sending fails
        }

        // Redirect to verification page with settings context
        navigate('/verify-otp', {
          state: {
            userId,
            email: formData.email,
            mobile: formData.mobileCountryCode + formData.mobile, // Pass combined mobile number
            verificationSettings: {
              emailRequired: settings.emailVerificationRequired,
              mobileRequired: settings.mobileVerificationRequired,
              eitherRequired: settings.eitherVerificationRequired
            },
            fromRegistration: true
          }
        });
      } else {
        console.log('💳 No verification required, redirecting to subscription plans...');
        navigate('/subscription-plans');
      }
    } catch (err) {
      console.error('❌ Registration error in component:', err);
      // Error is now handled by notification system
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    // For mobile number, validate it's only digits and limit to 10 characters
    if (name === 'mobile') {
      if (value === '' || (/^\d*$/.test(value) && value.length <= 10)) {
        setFormData(prev => ({
          ...prev,
          [name]: value
        }));
      }
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));

    // Reset referral validation when parent account changes
    if (name === 'parentAccount') {
      setReferralValid(null);
    }
  };

  const handleCountryCodeSelect = (code: string) => {
    setFormData(prev => ({
      ...prev,
      mobileCountryCode: code
    }));
    setShowCountryDropdown(false);
  };

  // Function to validate referral code
  const validateReferralCode = async (referralCode: string) => {
    if (!referralCode.trim()) {
      setReferralValid(null);
      return;
    }

    setValidatingReferral(true);
    try {
      const isValid = await checkSponsorshipNumberExists(referralCode);
      setReferralValid(isValid);
    } catch (error) {
      console.error('Failed to validate referral code:', error);
      setReferralValid(false);
    } finally {
      setValidatingReferral(false);
    }
  };

  // Debounced referral validation
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.parentAccount) {
        validateReferralCode(formData.parentAccount);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.parentAccount]);

  // Get selected country details
  const selectedCountry = countryCodes.find(country => country.code === formData.mobileCountryCode);

  return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white p-8 rounded-2xl shadow-xl">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900">Customer Registration</h2>
              <p className="mt-2 text-gray-600">Join our MLM network and start earning</p>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="First name"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        required
                        value={formData.lastName}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Last name"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
                  Username *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                      id="userName"
                      name="userName"
                      type="text"
                      required
                      value={formData.userName}
                      onChange={handleChange}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Choose a username"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address {settings.emailVerificationRequired || settings.eitherVerificationRequired ? '*' : ''}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        required={settings.emailVerificationRequired || settings.eitherVerificationRequired}
                        value={formData.email}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="mobile" className="block text-sm font-medium text-gray-700 mb-2">
                    Mobile Number {settings.mobileVerificationRequired || settings.eitherVerificationRequired ? '*' : ''}
                  </label>
                  <div className="flex space-x-2">
                    {/* Country Code Dropdown */}
                    <div className="relative">
                      <button
                          type="button"
                          onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                          className="flex items-center space-x-1 pl-3 pr-2 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white h-full"
                      >
                        <span>{selectedCountry?.flag}</span>
                        <span>{selectedCountry?.code}</span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </button>

                      {showCountryDropdown && (
                          <div className="absolute z-10 mt-1 w-48 max-h-60 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                            {countryCodes.map((country) => (
                                <div
                                    key={country.code}
                                    onClick={() => handleCountryCodeSelect(country.code)}
                                    className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer"
                                >
                                  <span className="mr-2">{country.flag}</span>
                                  <span className="flex-1">{country.country}</span>
                                  <span className="text-gray-500">{country.code}</span>
                                </div>
                            ))}
                          </div>
                      )}
                    </div>

                    {/* Mobile Number Input */}
                    <div className="flex-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                          id="mobile"
                          name="mobile"
                          type="tel"
                          required={settings.mobileVerificationRequired || settings.eitherVerificationRequired}
                          value={formData.mobile}
                          onChange={handleChange}
                          className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder="1234567890"
                          maxLength={10}
                          pattern="[0-9]{10}"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Enter 10-digit mobile number</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="parentAccount" className="block text-sm font-medium text-gray-700 mb-2">
                    Parent A/C {settings.referralMandatory ? '*' : '(Optional)'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Users className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        id="parentAccount"
                        name="parentAccount"
                        type="text"
                        required={settings.referralMandatory}
                        value={formData.parentAccount}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Referral ID"
                    />
                    {/* Validation indicator */}
                    {formData.parentAccount && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                          {validatingReferral ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                          ) : referralValid === true ? (
                              <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center">
                                <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                          ) : referralValid === false ? (
                              <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                                <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </div>
                          ) : null}
                        </div>
                    )}
                  </div>
                  {formData.parentAccount && referralValid === false && (
                      <p className="text-xs text-red-600 mt-1">Invalid referral code</p>
                  )}
                  {formData.parentAccount && referralValid === true && (
                      <p className="text-xs text-green-600 mt-1">Valid referral code ✓</p>
                  )}
                </div>

                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                    Gender *
                  </label>
                  <select
                      id="gender"
                      name="gender"
                      required
                      value={formData.gender}
                      onChange={handleChange}
                      className="block w-full py-3 px-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    New Password *
                  </label>
                  <div className="relative">
                    <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={formData.password}
                        onChange={handleChange}
                        className="block w-full py-3 px-4 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                        className="block w-full py-3 px-4 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="acceptTerms" className="ml-2 block text-sm text-gray-700">
                  I accept the{' '}
                  <Link to="#" className="text-indigo-600 hover:text-indigo-500">
                    Terms and Conditions
                  </Link>
                </label>
              </div>

              <ReCaptcha onVerify={setRecaptchaToken} />

              <button
                  type="submit"
                  disabled={isSubmitting || !recaptchaToken}
                  className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Creating Account...</span>
                    </>
                ) : (
                    <span>Create Account</span>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-600">
                Already have an account?{' '}
                <Link to="/customer/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
                  Sign in here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
  );
};

export default CustomerRegister;