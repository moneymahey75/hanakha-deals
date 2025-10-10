import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAdmin } from '../../contexts/AdminContext';
import { checkSponsorshipNumberExists, supabase } from '../../lib/supabase';
import { Eye, EyeOff, User, Mail, Phone, Users, ChevronDown, CheckCircle, XCircle, Info } from 'lucide-react';
import ReCaptcha from '../../components/ui/ReCaptcha';

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

interface FormData {
  firstName: string;
  lastName: string;
  userName: string;
  email: string;
  mobile: string;
  mobileCountryCode: string;
  parentAccount: string;
  gender: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

interface UsernameValidation {
  isValid: boolean;
  errors: string[];
  suggestions: string[];
}

// Function to check if username already exists in tbl_user_profiles
const checkUsernameExists = async (username: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
        .from('tbl_user_profiles')
        .select('tup_username')
        .eq('tup_username', username.toLowerCase())
        .single();

    if (error) {
      // If no record found, it's not a duplicate
      if (error.code === 'PGRST116') {
        return false;
      }
      console.error('Error checking username:', error);
      return false;
    }

    // If data exists, username is taken
    return !!data;
  } catch (error) {
    console.error('Error checking username uniqueness:', error);
    return false;
  }
};

const CustomerRegister: React.FC = () => {
  const { register } = useAuth();
  const { settings } = useAdmin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    userName: '',
    email: '',
    mobile: '',
    mobileCountryCode: '+91',
    parentAccount: '',
    gender: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  });

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [showUsernameTooltip, setShowUsernameTooltip] = useState(false);

  // Referral validation state
  const [validatingReferral, setValidatingReferral] = useState(false);
  const [referralValid, setReferralValid] = useState<boolean | null>(null);

  // Username validation state
  const [usernameValidation, setUsernameValidation] = useState<UsernameValidation>({
    isValid: false,
    errors: [],
    suggestions: []
  });
  const [validatingUsername, setValidatingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Refs for preventing duplicate operations
  const referralInitialized = useRef(false);
  const validationTimeout = useRef<NodeJS.Timeout>();
  const usernameTimeout = useRef<NodeJS.Timeout>();
  const tooltipTimeout = useRef<NodeJS.Timeout>();

  // Initialize referral code from URL once
  useEffect(() => {
    if (referralInitialized.current) return;

    const referralCode = searchParams.get('ref');
    if (referralCode) {
      referralInitialized.current = true;
      setFormData(prev => ({
        ...prev,
        parentAccount: referralCode
      }));
      // Validate referral code
      validateReferralCode(referralCode);
    }
  }, [searchParams]);

  // Debounced referral validation
  useEffect(() => {
    if (validationTimeout.current) {
      clearTimeout(validationTimeout.current);
    }

    if (formData.parentAccount && !referralInitialized.current) {
      validationTimeout.current = setTimeout(() => {
        validateReferralCode(formData.parentAccount);
      }, 500);
    }

    return () => {
      if (validationTimeout.current) {
        clearTimeout(validationTimeout.current);
      }
    };
  }, [formData.parentAccount]);

  // Debounced username validation
  useEffect(() => {
    if (usernameTimeout.current) {
      clearTimeout(usernameTimeout.current);
    }

    if (formData.userName.trim()) {
      usernameTimeout.current = setTimeout(() => {
        validateUsername(formData.userName);
      }, 300);
    } else {
      setUsernameValidation({
        isValid: false,
        errors: [],
        suggestions: []
      });
      setUsernameAvailable(null);
    }

    return () => {
      if (usernameTimeout.current) {
        clearTimeout(usernameTimeout.current);
      }
    };
  }, [formData.userName]);

  const validateReferralCode = useCallback(async (referralCode: string) => {
    if (!referralCode.trim()) {
      setReferralValid(null);
      return;
    }

    setValidatingReferral(true);
    try {
      const isValid = await checkSponsorshipNumberExists(referralCode);
      setReferralValid(isValid);
    } catch (error) {
      setReferralValid(false);
    } finally {
      setValidatingReferral(false);
    }
  }, []);

  // Username validation function
  const validateUsername = useCallback(async (username: string) => {
    if (!username.trim()) {
      setUsernameValidation({
        isValid: false,
        errors: [],
        suggestions: []
      });
      setUsernameAvailable(null);
      return;
    }

    setValidatingUsername(true);
    setUsernameAvailable(null);

    try {
      const errors: string[] = [];
      const suggestions: string[] = [];

      // Length validation
      if (username.length < settings.usernameMinLength) {
        errors.push(`Username must be at least ${settings.usernameMinLength} characters long`);
      }

      if (username.length > settings.usernameMaxLength) {
        errors.push(`Username must not exceed ${settings.usernameMaxLength} characters`);
      }

      // Space validation
      if (!settings.usernameAllowSpaces && /\s/.test(username)) {
        errors.push('Username cannot contain spaces');
      }

      // Start with letter validation
      if (settings.usernameMustStartWithLetter && !/^[a-zA-Z]/.test(username)) {
        errors.push('Username must start with a letter');
      }

      // Number validation
      if (!settings.usernameAllowNumbers && /\d/.test(username)) {
        errors.push('Username cannot contain numbers');
      }

      // Special characters validation
      if (!settings.usernameAllowSpecialChars && /[^a-zA-Z0-9]/.test(username)) {
        errors.push('Username cannot contain special characters');
      } else if (settings.usernameAllowSpecialChars && settings.usernameAllowedSpecialChars) {
        // Create regex pattern for allowed characters
        const allowedCharsPattern = new RegExp(`^[a-zA-Z0-9${settings.usernameAllowedSpecialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+$`);
        if (!allowedCharsPattern.test(username)) {
          errors.push(`Username can only contain letters, numbers, and these special characters: ${settings.usernameAllowedSpecialChars}`);
        }
      }

      // Lowercase conversion suggestion
      if (settings.usernameForceLowerCase && username !== username.toLowerCase()) {
        suggestions.push(`Username will be converted to lowercase: ${username.toLowerCase()}`);
      }

      // Check username uniqueness if no other errors
      if (settings.usernameUniqueRequired && errors.length === 0) {
        try {
          const exists = await checkUsernameExists(username);
          if (exists) {
            errors.push('Username is already taken');
            suggestions.push('Try adding numbers or underscores to make it unique');
            setUsernameAvailable(false);
          } else {
            setUsernameAvailable(true);
          }
        } catch (error) {
          console.error('Error checking username uniqueness:', error);
          errors.push('Unable to check username availability');
          setUsernameAvailable(null);
        }
      } else if (!settings.usernameUniqueRequired) {
        setUsernameAvailable(true); // If uniqueness not required, consider it available
      }

      // Generate suggestions for invalid usernames
      if (errors.length > 0 && settings.usernameUniqueRequired) {
        let suggestion = username;

        // Remove spaces if not allowed
        if (!settings.usernameAllowSpaces) {
          suggestion = suggestion.replace(/\s/g, '');
        }

        // Remove numbers if not allowed
        if (!settings.usernameAllowNumbers) {
          suggestion = suggestion.replace(/\d/g, '');
        }

        // Remove special characters if not allowed
        if (!settings.usernameAllowSpecialChars) {
          suggestion = suggestion.replace(/[^a-zA-Z0-9]/g, '');
        } else if (settings.usernameAllowedSpecialChars) {
          // Remove disallowed special characters
          const allowedChars = `a-zA-Z0-9${settings.usernameAllowedSpecialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
          suggestion = suggestion.replace(new RegExp(`[^${allowedChars}]`, 'g'), '');
        }

        // Convert to lowercase if forced
        if (settings.usernameForceLowerCase) {
          suggestion = suggestion.toLowerCase();
        }

        // Ensure starts with letter if required
        if (settings.usernameMustStartWithLetter && !/^[a-zA-Z]/.test(suggestion)) {
          suggestion = 'user' + suggestion;
        }

        // Ensure minimum length
        if (suggestion.length < settings.usernameMinLength) {
          const charsNeeded = settings.usernameMinLength - suggestion.length;
          suggestion = suggestion + '_' + Math.random().toString(36).substr(2, charsNeeded - 1);
        }

        // Ensure maximum length
        if (suggestion.length > settings.usernameMaxLength) {
          suggestion = suggestion.substring(0, settings.usernameMaxLength);
        }

        if (suggestion !== username && suggestion.length >= settings.usernameMinLength) {
          suggestions.push(`Try: ${suggestion}`);
        }
      }

      setUsernameValidation({
        isValid: errors.length === 0,
        errors,
        suggestions
      });

    } catch (error) {
      setUsernameValidation({
        isValid: false,
        errors: ['Error validating username'],
        suggestions: []
      });
      setUsernameAvailable(null);
    } finally {
      setValidatingUsername(false);
    }
  }, [settings]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    // Mobile number validation
    if (name === 'mobile') {
      if (value === '' || (/^\d*$/.test(value) && value.length <= 10)) {
        setFormData(prev => ({ ...prev, [name]: value }));
      }
      return;
    }

    // Username validation - prevent spaces if not allowed
    if (name === 'userName' && !settings.usernameAllowSpaces) {
      const sanitizedValue = value.replace(/\s/g, '');
      setFormData(prev => ({
        ...prev,
        [name]: sanitizedValue
      }));
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));

    // Reset referral validation when parent account changes manually
    if (name === 'parentAccount' && !referralInitialized.current) {
      setReferralValid(null);
    }
  }, [settings.usernameAllowSpaces]);

  const handleCountryCodeSelect = useCallback((code: string) => {
    setFormData(prev => ({ ...prev, mobileCountryCode: code }));
    setShowCountryDropdown(false);
  }, []);

  const handleUsernameTooltip = useCallback((show: boolean) => {
    if (tooltipTimeout.current) {
      clearTimeout(tooltipTimeout.current);
    }

    if (show) {
      setShowUsernameTooltip(true);
    } else {
      tooltipTimeout.current = setTimeout(() => {
        setShowUsernameTooltip(false);
      }, 300);
    }
  }, []);

  const validateForm = useCallback((): string | null => {
    if (!recaptchaToken) {
      return 'Please complete the reCAPTCHA verification';
    }

    if (!usernameValidation.isValid && formData.userName.trim()) {
      return 'Please fix username validation errors';
    }

    if (settings.usernameUniqueRequired && usernameAvailable === false) {
      return 'Username is already taken. Please choose a different one.';
    }

    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }

    if (!formData.acceptTerms) {
      return 'Please accept the terms and conditions';
    }

    if (settings.referralMandatory && !formData.parentAccount) {
      return 'Referral account is mandatory';
    }

    if (formData.mobile && !/^\d{10}$/.test(formData.mobile)) {
      return 'Mobile number must be exactly 10 digits';
    }

    // Check if either email or mobile is provided when either verification is required
    if (settings.eitherVerificationRequired) {
      if (!formData.email && !formData.mobile) {
        return 'Either email or mobile number is required for verification';
      }
    }

    // Check if email is provided when email verification is required
    if (settings.emailVerificationRequired && !formData.email) {
      return 'Email address is required for verification';
    }

    // Check if mobile is provided when mobile verification is required
    if (settings.mobileVerificationRequired && !formData.mobile) {
      return 'Mobile number is required for verification';
    }

    return null;
  }, [formData, settings, recaptchaToken, usernameValidation, usernameAvailable]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Validate username
    if (!usernameValidation.isValid) {
      setError('Please fix username validation errors before submitting');
      return;
    }

    // Final username availability check before submission
    if (settings.usernameUniqueRequired) {
      try {
        const finalCheck = await checkUsernameExists(formData.userName);
        if (finalCheck) {
          setError('Username is no longer available. Please choose a different one.');
          setUsernameAvailable(false);
          return;
        }
      } catch (error) {
        setError('Unable to verify username availability. Please try again.');
        return;
      }
    }

    // Validate referral code if provided
    if (formData.parentAccount) {
      try {
        const isValidReferral = await checkSponsorshipNumberExists(formData.parentAccount);
        if (!isValidReferral) {
          setError('Invalid referral code. Please check and try again.');
          return;
        }
      } catch (referralError) {
        setError('Unable to validate referral code at this time. Please try again.' + referralError);
        return;
      }
    } else if(settings.referralMandatory) {
      setError('Referral code is required');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const fullMobile = formData.mobileCountryCode + formData.mobile;

      // Apply username transformations based on settings
      let finalUsername = formData.userName;
      if (settings.usernameForceLowerCase) {
        finalUsername = finalUsername.toLowerCase();
      }

      const userId = await register({
        ...formData,
        userName: finalUsername,
        mobile: fullMobile
      }, 'customer');

      // Determine verification requirements
      const needsVerification = settings.emailVerificationRequired ||
          settings.mobileVerificationRequired ||
          settings.eitherVerificationRequired;

      if (needsVerification) {
        navigate('/verify-otp', {
          state: {
            userId,
            email: formData.email,
            mobile: fullMobile,
            verificationSettings: {
              emailRequired: settings.emailVerificationRequired,
              mobileRequired: settings.mobileVerificationRequired,
              eitherRequired: settings.eitherVerificationRequired
            },
            fromRegistration: true
          }
        });
      } else {
        navigate('/subscription-plans');
      }
    } catch (err) {
      // Error handling is done by notification system in AuthContext
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, settings, recaptchaToken, isSubmitting, validateForm, usernameValidation, usernameAvailable, register, navigate]);

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

              {/* Enhanced Username Field with Tooltip */}
              <div>
                <div className="flex items-center mb-2">
                  <label htmlFor="userName" className="block text-sm font-medium text-gray-700">
                    Username *
                  </label>
                  <div
                      className="relative ml-2"
                      onMouseEnter={() => handleUsernameTooltip(true)}
                      onMouseLeave={() => handleUsernameTooltip(false)}
                  >
                    <Info className="h-4 w-4 text-gray-400 cursor-help" />
                    {showUsernameTooltip && (
                        <div className="absolute z-10 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg bottom-full mb-2 left-1/2 transform -translate-x-1/2">
                          <div className="font-medium mb-1">Username Requirements:</div>
                          <ul className="space-y-1">
                            <li>• {settings.usernameMinLength}-{settings.usernameMaxLength} characters</li>
                            {!settings.usernameAllowSpaces && <li>• No spaces allowed</li>}
                            {settings.usernameMustStartWithLetter && <li>• Must start with a letter</li>}
                            {!settings.usernameAllowNumbers && <li>• No numbers allowed</li>}
                            {!settings.usernameAllowSpecialChars ? (
                                <li>• No special characters allowed</li>
                            ) : (
                                <li>• Allowed: {settings.usernameAllowedSpecialChars || 'none'}</li>
                            )}
                            {settings.usernameForceLowerCase && <li>• Will be converted to lowercase</li>}
                            {settings.usernameUniqueRequired && <li>• Must be unique</li>}
                          </ul>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                    )}
                  </div>
                </div>

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
                      className={`block w-full pl-10 pr-10 py-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          formData.userName ?
                              (usernameValidation.isValid && usernameAvailable !== false ? 'border-green-300' : 'border-red-300') :
                              'border-gray-300'
                      }`}
                      placeholder="Choose a username"
                      maxLength={settings.usernameMaxLength}
                  />

                  {/* Single clear/status button */}
                  {formData.userName && (
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, userName: '' }));
                              setUsernameValidation({
                                isValid: false,
                                errors: [],
                                suggestions: []
                              });
                              setUsernameAvailable(null);
                            }}
                            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                            title="Clear username"
                        >
                          {validatingUsername ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                          ) : usernameValidation.isValid && usernameAvailable !== false ? (
                              <CheckCircle className="h-5 w-5 text-green-500 hover:text-green-600" />
                          ) : (
                              <XCircle className="h-5 w-5 text-red-500 hover:text-red-600" />
                          )}
                        </button>
                      </div>
                  )}
                </div>

                {/* Username validation feedback */}
                {formData.userName && (
                    <div className="mt-2">
                      {usernameValidation.errors.length > 0 && (
                          <div className="space-y-1">
                            {usernameValidation.errors.map((error, index) => (
                                <p key={index} className="text-xs text-red-600 flex items-center">
                                  <XCircle className="h-3 w-3 mr-1" />
                                  {error}
                                </p>
                            ))}
                          </div>
                      )}

                      {usernameValidation.suggestions.length > 0 && (
                          <div className="space-y-1 mt-2">
                            {usernameValidation.suggestions.map((suggestion, index) => (
                                <p key={index} className="text-xs text-blue-600 flex items-center">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  {suggestion}
                                </p>
                            ))}
                          </div>
                      )}

                      {usernameValidation.isValid && usernameAvailable === true && (
                          <p className="text-xs text-green-600 flex items-center">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Username is valid and available
                          </p>
                      )}

                      {usernameValidation.isValid && usernameAvailable === false && (
                          <p className="text-xs text-red-600 flex items-center">
                            <XCircle className="h-3 w-3 mr-1" />
                            Username is already taken
                          </p>
                      )}

                      {usernameValidation.isValid && usernameAvailable === null && settings.usernameUniqueRequired && (
                          <p className="text-xs text-yellow-600 flex items-center">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-600 mr-1"></div>
                            Checking availability...
                          </p>
                      )}

                      {/* Character count */}
                      <p className={`text-xs mt-1 ${
                          formData.userName.length > settings.usernameMaxLength ? 'text-red-600' :
                              formData.userName.length < settings.usernameMinLength ? 'text-yellow-600' :
                                  'text-gray-500'
                      }`}>
                        {formData.userName.length} / {settings.usernameMaxLength} characters
                        {formData.userName.length < settings.usernameMinLength &&
                            ` (minimum ${settings.usernameMinLength} required)`}
                      </p>
                    </div>
                )}
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
                  disabled={isSubmitting || !recaptchaToken || !usernameValidation.isValid}
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