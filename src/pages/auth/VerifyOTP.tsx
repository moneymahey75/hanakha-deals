import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { sendOTP, verifyOTP as verifyOTPAPI } from '../../lib/supabase';
import { Smartphone, RefreshCw, Mail, CheckCircle2 } from 'lucide-react';

const VerifyOTP: React.FC = () => {
  const { user, fetchUserData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [otpType, setOtpType] = useState<'email' | 'mobile'>('mobile');
  const [contactInfo, setContactInfo] = useState({ email: '', mobile: '' });
  const [verificationSettings, setVerificationSettings] = useState({
    emailRequired: false,
    mobileRequired: false,
    eitherRequired: false
  });
  const [completedVerifications, setCompletedVerifications] = useState({
    email: false,
    mobile: false
  });
  const [currentUserId, setCurrentUserId] = useState('');
  const [hasSentInitialOTP, setHasSentInitialOTP] = useState(false);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Initialize refs array
  useEffect(() => {
    otpRefs.current = otpRefs.current.slice(0, 6);
  }, []);

  useEffect(() => {
    // Get data from navigation state or user context
    const state = location.state as any;

    if (state) {
      setCurrentUserId(state.userId || user?.id || '');
      setContactInfo({
        email: state.email || user?.email || '',
        mobile: state.mobile || ''
      });
      setVerificationSettings(state.verificationSettings || {
        emailRequired: false,
        mobileRequired: false,
        eitherRequired: false
      });

      // Set default OTP type based on settings
      if (state.verificationSettings?.mobileRequired && (state.mobile || user?.mobile)) {
        setOtpType('mobile');
      } else if (state.verificationSettings?.emailRequired && (state.email || user?.email)) {
        setOtpType('email');
      } else if (state.verificationSettings?.eitherRequired) {
        // For either verification, default to mobile if available, otherwise email
        setOtpType((state.mobile || user?.mobile) ? 'mobile' : 'email');
      }
    } else if (user) {
      setCurrentUserId(user.id);
      setContactInfo({
        email: user.email || '',
        mobile: user.mobile || ''
      });
    }
  }, [location.state, user]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  // Send initial OTP only if coming from registration and hasn't been sent yet
  useEffect(() => {
    const state = location.state as any;
    if (state?.fromRegistration && currentUserId && contactInfo[otpType] && !hasSentInitialOTP) {
      handleSendOTP();
      setHasSentInitialOTP(true);
    }
  }, [currentUserId, otpType, contactInfo, location.state, hasSentInitialOTP]);

  // Reset OTP when type changes
  useEffect(() => {
    setOtp(['', '', '', '', '', '']);
    setError('');

    // Focus on first input after a delay
    const timer = setTimeout(() => {
      otpRefs.current[0]?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, [otpType]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);

      // Auto-focus next input using refs
      if (value && index < 5) {
        setTimeout(() => {
          otpRefs.current[index + 1]?.focus();
        }, 10);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = otpRefs.current[index - 1];
      prevInput?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent multiple submissions
    if (isSubmitting) return;

    setError('');
    setIsSubmitting(true);

    const otpString = otp.join('');
    if (otpString.length !== 6) {
      setError('Please enter the complete 6-digit OTP');
      setIsSubmitting(false);
      return;
    }

    try {
      console.log('🔍 Submitting OTP verification:', { otpString, otpType, userId: currentUserId });
      const result = await verifyOTPAPI(currentUserId, otpString, otpType);

      if (!result.success) {
        setError(result.error || 'OTP verification failed');
        setIsSubmitting(false);

        // Clear OTP fields on error to allow retry
        setOtp(['', '', '', '', '', '']);

        // Focus on first OTP input
        setTimeout(() => {
          otpRefs.current[0]?.focus();
        }, 100);
        return;
      }

      console.log('✅ OTP verification successful');

      // Update completed verifications
      const newCompletedVerifications = {
        ...completedVerifications,
        [otpType]: true
      };
      setCompletedVerifications(newCompletedVerifications);

      // Check if all required verifications are completed
      const allRequiredCompleted = checkAllVerificationsCompleted(newCompletedVerifications);

      if (allRequiredCompleted) {
        console.log('🎉 All required verifications completed, updating user data...');
        // Refresh user data to reflect verification status
        if (user) {
          await fetchUserData(user.id);
        }
        // Redirect to subscription plans
        navigate('/subscription-plans', { state: { requiresSubscription: true } });
      } else {
        // More verifications needed - reset OTP and focus
        setOtp(['', '', '', '', '', '']);
        setError('');

        // Switch to next required verification type
        const nextType = getNextVerificationType(newCompletedVerifications);
        if (nextType) {
          setOtpType(nextType);

          // Send OTP for the next type after a brief delay
          setTimeout(() => {
            if (contactInfo[nextType]) {
              handleSendOTP();
            }
          }, 300);
        }
      }

    } catch (err: any) {
      console.error('❌ OTP verification failed:', err);
      setError(err?.message || 'Invalid OTP. Please try again.');

      // Clear OTP fields on error to allow retry
      setOtp(['', '', '', '', '', '']);

      // Focus on first OTP input
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 100);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getNextVerificationType = (completed: typeof completedVerifications) => {
    if (verificationSettings.emailRequired && !completed.email) {
      return 'email';
    } else if (verificationSettings.mobileRequired && !completed.mobile) {
      return 'mobile';
    }
    return null;
  };

  const checkAllVerificationsCompleted = (completed: typeof completedVerifications) => {
    if (verificationSettings.eitherRequired) {
      // For either verification, just need one completed
      return completed.email || completed.mobile;
    }

    if (verificationSettings.emailRequired && verificationSettings.mobileRequired) {
      // Both required
      return completed.email && completed.mobile;
    }

    if (verificationSettings.emailRequired) {
      return completed.email;
    }

    if (verificationSettings.mobileRequired) {
      return completed.mobile;
    }

    return true; // No verification required
  };

  const switchToNextVerificationType = () => {
    if (verificationSettings.emailRequired && !completedVerifications.email) {
      setOtpType('email');
    } else if (verificationSettings.mobileRequired && !completedVerifications.mobile) {
      setOtpType('mobile');
    }
  };

  const handleSendOTP = async () => {
    if (!currentUserId || !contactInfo[otpType]) {
      console.error('Missing user ID or contact info:', { currentUserId, contactInfo, otpType });
      return;
    }

    try {
      console.log('📤 Sending OTP:', { userId: currentUserId, contactInfo: contactInfo[otpType], otpType });
      const result = await sendOTP(currentUserId, contactInfo[otpType], otpType);

      if (!result.success) {
        console.error('OTP send failed:', result.error);
        throw new Error(result.error || 'Failed to send OTP');
      }

      console.log('✅ OTP sent successfully:', result);
    } catch (error: any) {
      console.error('Failed to send OTP:', error);
      setError('Failed to send OTP. Please try again.');
    }
  };

  const handleResend = async () => {
    if (!currentUserId || !contactInfo[otpType] || isSubmitting) {
      setError('User information not found. Please try registering again.');
      return;
    }

    setResendTimer(30);
    setCanResend(false);
    setError('');
    setOtp(['', '', '', '', '', '']); // Clear previous OTP

    // Focus on first input
    setTimeout(() => {
      otpRefs.current[0]?.focus();
    }, 100);

    await handleSendOTP();
  };

  const handleOtpTypeChange = (newType: 'email' | 'mobile') => {
    if (verificationSettings.eitherRequired ||
        (newType === 'email' && verificationSettings.emailRequired) ||
        (newType === 'mobile' && verificationSettings.mobileRequired)) {
      setOtpType(newType);
      setOtp(['', '', '', '', '', '']);
      setError('');
      // Send OTP for the new type
      setTimeout(() => {
        if (contactInfo[newType]) {
          handleSendOTP();
        }
      }, 100);
    }
  };

  // Don't render if no user ID or contact info
  if (!currentUserId || (!contactInfo.email && !contactInfo.mobile)) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Verification Required</h2>
              <p className="text-gray-600 mb-4">
                Please complete registration first or login to continue verification.
              </p>
              <button
                  onClick={() => navigate('/customer/register')}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Go to Registration
              </button>
            </div>
          </div>
        </div>
    );
  }

  const getVerificationTitle = () => {
    if (verificationSettings.eitherRequired) {
      return 'Choose Verification Method';
    } else if (verificationSettings.emailRequired && verificationSettings.mobileRequired) {
      if (completedVerifications.email && !completedVerifications.mobile) {
        return 'Verify Mobile Number';
      } else if (completedVerifications.mobile && !completedVerifications.email) {
        return 'Verify Email Address';
      } else if (otpType === 'email') {
        return 'Verify Email Address';
      } else {
        return 'Verify Mobile Number';
      }
    } else if (verificationSettings.emailRequired) {
      return 'Verify Email Address';
    } else if (verificationSettings.mobileRequired) {
      return 'Verify Mobile Number';
    }
    return 'Verify Account';
  };

  const getVerificationDescription = () => {
    const currentContact = contactInfo[otpType];
    if (verificationSettings.eitherRequired) {
      return `Choose your preferred verification method. We'll send a 6-digit code to verify your account.`;
    }
    return `We've sent a 6-digit verification code to `;
  };

  const showTypeSelector = () => {
    return verificationSettings.eitherRequired && contactInfo.email && contactInfo.mobile;
  };

  const canSwitchType = (type: 'email' | 'mobile') => {
    if (verificationSettings.eitherRequired) {
      return contactInfo[type] && !completedVerifications[type];
    }
    return false;
  };

  return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-xl">
            <div className="text-center mb-8">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                  otpType === 'mobile' ? 'bg-indigo-100' : 'bg-green-100'
              }`}>
                {otpType === 'mobile' ? (
                    <Smartphone className={`h-8 w-8 ${otpType === 'mobile' ? 'text-indigo-600' : 'text-green-600'}`} />
                ) : (
                    <Mail className="h-8 w-8 text-green-600" />
                )}
              </div>
              <h2 className="text-3xl font-bold text-gray-900">
                {getVerificationTitle()}
              </h2>
              <p className="mt-2 text-gray-600">
                {getVerificationDescription()}
              </p>
              {contactInfo[otpType] && (
                  <p className="font-semibold text-indigo-600">
                    {contactInfo[otpType]}
                  </p>
              )}
            </div>

            {/* Verification Progress */}
            {(verificationSettings.emailRequired && verificationSettings.mobileRequired) && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Verification Progress:</h4>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          completedVerifications.email ? 'bg-green-500' : 'bg-gray-300'
                      }`}>
                        {completedVerifications.email && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-sm ${
                          completedVerifications.email ? 'text-green-600 font-medium' : 'text-gray-600'
                      }`}>
                    Email Verification {completedVerifications.email ? '✓' : ''}
                  </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          completedVerifications.mobile ? 'bg-green-500' : 'bg-gray-300'
                      }`}>
                        {completedVerifications.mobile && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-sm ${
                          completedVerifications.mobile ? 'text-green-600 font-medium' : 'text-gray-600'
                      }`}>
                    Mobile Verification {completedVerifications.mobile ? '✓' : ''}
                  </span>
                    </div>
                  </div>
                </div>
            )}

            {/* OTP Type Selector */}
            {showTypeSelector() && (
                <div className="mb-6">
                  <div className="flex space-x-4 justify-center">
                    <button
                        type="button"
                        onClick={() => handleOtpTypeChange('mobile')}
                        disabled={!canSwitchType('mobile')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            otpType === 'mobile'
                                ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-300'
                                : canSwitchType('mobile')
                                    ? 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
                                    : 'bg-gray-50 text-gray-400 border-2 border-gray-100 cursor-not-allowed'
                        }`}
                    >
                      <Smartphone className="h-4 w-4" />
                      <span>Mobile</span>
                      {completedVerifications.mobile && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleOtpTypeChange('email')}
                        disabled={!canSwitchType('email')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                            otpType === 'email'
                                ? 'bg-green-100 text-green-700 border-2 border-green-300'
                                : canSwitchType('email')
                                    ? 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200'
                                    : 'bg-gray-50 text-gray-400 border-2 border-gray-100 cursor-not-allowed'
                        }`}
                    >
                      <Mail className="h-4 w-4" />
                      <span>Email</span>
                      {completedVerifications.email && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </button>
                  </div>
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-4 text-center">
                  Enter Verification Code
                </label>
                <div className="flex justify-center space-x-3">
                  {otp.map((digit, index) => (
                      <input
                          key={index}
                          id={`otp-${index}`}
                          ref={(el) => (otpRefs.current[index] = el)}
                          type="text"
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          className="w-12 h-12 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          maxLength={1}
                          disabled={isSubmitting}
                      />
                  ))}
                </div>
              </div>

              <button
                  type="submit"
                  disabled={isSubmitting || otp.join('').length !== 6}
                  className={`w-full py-3 px-4 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 text-white ${
                      otpType === 'mobile'
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : 'bg-green-600 hover:bg-green-700'
                  } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Verifying...</span>
                    </>
                ) : (
                    <span>Verify OTP</span>
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 mb-4">
                Didn't receive the code?
              </p>
              {canResend ? (
                  <button
                      onClick={handleResend}
                      disabled={isSubmitting}
                      className="inline-flex items-center space-x-2 text-indigo-600 hover:text-indigo-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span>Resend OTP</span>
                  </button>
              ) : (
                  <p className="text-sm text-gray-500">
                    Resend OTP in {resendTimer} seconds
                  </p>
              )}
            </div>
          </div>
        </div>
      </div>
  );
};

export default VerifyOTP;