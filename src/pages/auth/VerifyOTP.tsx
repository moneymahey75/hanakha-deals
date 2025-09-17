import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../components/ui/NotificationProvider';
import { sendOTP, verifyOTP as verifyOTPAPI } from '../../lib/supabase';
import { Smartphone, RefreshCw, Mail, CheckCircle2 } from 'lucide-react';

const VerifyOTP: React.FC = () => {
  const { user, fetchUserData } = useAuth();
  const notification = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(0); // Start at 0, no timer initially
  const [canResend, setCanResend] = useState(true); // Initially true to show Send OTP button
  const [isResending, setIsResending] = useState(false);
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
  const [isInitializing, setIsInitializing] = useState(true);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [lastOTPSendTime, setLastOTPSendTime] = useState<number>(0);
  const [otpSendAttempts, setOtpSendAttempts] = useState<number>(0);

  // Initialize refs array
  useEffect(() => {
    otpRefs.current = otpRefs.current.slice(0, 6);
  }, []);

  useEffect(() => {
    // Get data from navigation state or user context
    const state = location.state as any;

    console.log('🔍 VerifyOTP component initialized with state:', state);

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

      // Set default OTP type based on settings and available contact info
      if (state.verificationSettings?.mobileRequired && state.mobile) {
        setOtpType('mobile');
      } else if (state.verificationSettings?.emailRequired && state.email) {
        setOtpType('email');
      } else if (state.verificationSettings?.eitherRequired) {
        // For either verification, prefer mobile if available, otherwise email
        if (state.mobile) {
          setOtpType('mobile');
        } else if (state.email) {
          setOtpType('email');
        } else {
          setOtpType('email'); // fallback
        }
      } else {
        // Default fallback
        setOtpType('email');
      }

      console.log('📋 Verification settings loaded:', {
        emailRequired: state.verificationSettings?.emailRequired,
        mobileRequired: state.verificationSettings?.mobileRequired,
        eitherRequired: state.verificationSettings?.eitherRequired,
        selectedType: state.verificationSettings?.mobileRequired && state.mobile ? 'mobile' : 'email'
      });
    } else if (user) {
      setCurrentUserId(user.id);
      setContactInfo({
        email: user.email || '',
        mobile: ''
      });
    }

    setIsInitializing(false);
  }, [location.state, user]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else if (resendTimer === 0 && !canResend) {
      setCanResend(true);
    }
  }, [resendTimer, canResend]);

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

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').trim();

    // Only process if pasted data contains exactly 6 digits
    if (/^\d{6}$/.test(pastedData)) {
      const newOtp = pastedData.split('').slice(0, 6);
      setOtp(newOtp as any);

      // Focus on the last input after pasting
      setTimeout(() => {
        otpRefs.current[5]?.focus();
      }, 10);
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

    // Validate OTP input
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      setError('Please enter the complete 6-digit OTP');
      return;
    }

    if (!/^\d{6}$/.test(otpString)) {
      setError('OTP must contain only numbers');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      console.log('🔍 Submitting OTP verification:', { otpString, otpType, userId: currentUserId });

      const result = await verifyOTPAPI(currentUserId, otpString, otpType);

      if (!result.success) {
        throw new Error(result.error || 'OTP verification failed');
      }

      console.log('✅ OTP verification successful');
      notification.showSuccess('Verification Successful', `${otpType === 'email' ? 'Email' : 'Mobile'} verified successfully!`);

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
        notification.showSuccess('Account Verified', 'Your account has been fully verified!');
        // Redirect to subscription plans
        navigate('/subscription-plans', { state: { requiresSubscription: true } });
      } else {
        // More verifications needed - reset OTP and focus
        setOtp(['', '', '', '', '', '']);
        setError('');

        // Switch to next required verification type
        const nextType = getNextVerificationType(newCompletedVerifications);
        if (nextType) {
          notification.showInfo('Next Step', `Please verify your ${nextType} address to complete registration`);
          setOtpType(nextType);
          setCanResend(true); // Enable Send OTP button for the next type
          setResendTimer(0); // Reset timer
        }
      }

    } catch (err: any) {
      console.error('❌ OTP verification failed:', err);

      let errorMessage = 'Invalid OTP. Please try again.';

      if (err?.message) {
        if (err.message.includes('timeout')) {
          errorMessage = 'Verification timed out. Please try again.';
        } else if (err.message.includes('expired')) {
          errorMessage = 'OTP has expired. Please request a new code.';
        } else if (err.message.includes('attempts')) {
          errorMessage = 'Too many failed attempts. Please request a new OTP.';
        } else if (err.message.includes('Invalid')) {
          errorMessage = 'Invalid OTP code. Please check and try again.';
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      notification.showError('Verification Failed', errorMessage);

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


  const handleSendOTP = async () => {
    // Prevent rapid successive requests
    const now = Date.now();
    if (now - lastOTPSendTime < 5000) { // 5 second cooldown
      setError('Please wait a moment before requesting another OTP');
      return;
    }

    // Limit OTP send attempts
    if (otpSendAttempts >= 5) {
      setError('Too many OTP requests. Please try again later.');
      return;
    }

    if (!currentUserId || !contactInfo[otpType]) {
      console.error('Missing user ID or contact info:', { currentUserId, contactInfo, otpType });
      setError('Missing user information. Please try registering again.');
      return;
    }

    try {
      console.log('📤 Sending OTP:', { userId: currentUserId, contactInfo: contactInfo[otpType], otpType });
      setLastOTPSendTime(now);
      setOtpSendAttempts(prev => prev + 1);

      setError(''); // Clear any previous errors

      const result = await sendOTP(currentUserId, contactInfo[otpType], otpType);

      if (!result.success) {
        console.error('OTP send failed:', result.error);
        throw new Error(result.error || 'Failed to send OTP');
      }

      console.log('✅ OTP sent successfully:', result);

      // Show success message
      const contactDisplay = otpType === 'mobile'
          ? contactInfo[otpType]
          : contactInfo[otpType].replace(/(.{3}).*(@.*)/, '$1***$2');

      notification.showSuccess('OTP Sent', `Verification code sent to ${contactDisplay}`);

      // Start the 30-second timer and disable resend button
      setResendTimer(30);
      setCanResend(false);

      // Show debug info in development
      if (result.debug_info) {
        console.log('🔧 Development OTP Info:', result.debug_info);
        if (otpType === 'mobile') {
          notification.showInfo('Development Mode', `Use OTP: ${result.debug_info.otp_code} (Mobile OTP simulated)`);
        }
      }

    } catch (error: any) {
      console.error('Failed to send OTP:', error);
      const errorMessage = error?.message || 'Failed to send OTP. Please try again.';
      setError(errorMessage);

      // Don't show notification error for mobile in development mode
      if (!(otpType === 'mobile' && errorMessage.includes('simulated'))) {
        notification.showError('Send Failed', errorMessage);
      }
    }
  };

  const handleResend = async () => {
    if (!currentUserId || !contactInfo[otpType] || isSubmitting || isResending) {
      setError('User information not found. Please try registering again.');
      return;
    }

    setIsResending(true);
    setError('');
    setOtp(['', '', '', '', '', '']); // Clear previous OTP

    // Focus on first input
    setTimeout(() => {
      otpRefs.current[0]?.focus();
    }, 100);

    try {
      await handleSendOTP();
    } catch (error) {
      console.error('Resend failed:', error);
    } finally {
      setIsResending(false);
    }
  };

  const handleOtpTypeChange = (newType: 'email' | 'mobile') => {
    console.log('🔄 Switching OTP type from', otpType, 'to', newType);

    // Check if the new type is allowed and has contact info
    const isAllowed = verificationSettings.eitherRequired ||
        (newType === 'email' && verificationSettings.emailRequired) ||
        (newType === 'mobile' && verificationSettings.mobileRequired);

    const hasContactInfo = contactInfo[newType] && contactInfo[newType].trim() !== '';
    const isAlreadyVerified = completedVerifications[newType];

    if (isAllowed && hasContactInfo && !isAlreadyVerified) {
      setOtpType(newType);
      setOtp(['', '', '', '', '', '']);
      setError('');
      setOtpSendAttempts(0); // Reset attempts when switching type
      setResendTimer(0); // Reset timer
      setCanResend(true); // Enable Send OTP button for new type

      notification.showInfo('Verification Type Changed', `Switched to ${newType} verification`);
    } else if (isAlreadyVerified) {
      notification.showInfo('Already Verified', `Your ${newType} is already verified`);
    } else if (!hasContactInfo) {
      setError(`No ${newType} address provided for verification`);
      notification.showError('Missing Information', `No ${newType} address available for verification`);
    } else {
      setError(`${newType} verification is not enabled`);
      notification.showError('Not Available', `${newType} verification is not enabled`);
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
    if (verificationSettings.eitherRequired) {
      return `Choose your preferred verification method. We'll send a 6-digit code to verify your account.`;
    }
    return `Enter the 6-digit verification code sent to `;
  };

  const showTypeSelector = () => {
    return verificationSettings.eitherRequired &&
        contactInfo.email && contactInfo.email.trim() !== '' &&
        contactInfo.mobile && contactInfo.mobile.trim() !== '';
  };

  const canSwitchType = (type: 'email' | 'mobile') => {
    // Allow switching if:
    // 1. Either verification is enabled, OR
    // 2. Both email and mobile verification are required (sequential verification)
    if (verificationSettings.eitherRequired ||
        (verificationSettings.emailRequired && verificationSettings.mobileRequired)) {
      return contactInfo[type] &&
          contactInfo[type].trim() !== '' &&
          !completedVerifications[type];
    }
    return false;
  };

  // Show type selector for either verification OR when both are required
  const showAdvancedTypeSelector = () => {
    return (verificationSettings.eitherRequired ||
            (verificationSettings.emailRequired && verificationSettings.mobileRequired)) &&
        contactInfo.email && contactInfo.email.trim() !== '' &&
        contactInfo.mobile && contactInfo.mobile.trim() !== '';
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
                {contactInfo[otpType] && (
                    <span className="font-semibold text-indigo-600 block mt-1">
                    {contactInfo[otpType]}
                  </span>
                )}
              </p>
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
            {showAdvancedTypeSelector() && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    {verificationSettings.eitherRequired ? 'Choose verification method:' : 'Switch verification method:'}
                  </h4>
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
                      <span>Mobile ({contactInfo.mobile?.replace(/(.{3}).*(.{4})/, '$1***$2')})</span>
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
                      <span>Email ({contactInfo.email?.replace(/(.{3}).*(@.*)/, '$1***$2')})</span>
                      {completedVerifications.email && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </button>
                  </div>
                </div>
            )}

            {/* Progress indicator for either verification */}
            {verificationSettings.eitherRequired && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-700 mb-2">Verification Progress</h4>
                  <p className="text-sm text-blue-600">
                    You can verify either your email or mobile number to proceed.
                  </p>
                  <div className="mt-2 flex items-center space-x-4">
                    <div className={`flex items-center space-x-1 ${completedVerifications.email ? 'text-green-600' : 'text-gray-400'}`}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Email</span>
                    </div>
                    <div className={`flex items-center space-x-1 ${completedVerifications.mobile ? 'text-green-600' : 'text-gray-400'}`}>
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Mobile</span>
                    </div>
                  </div>
                </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
            )}

            {/* Send OTP button - only show if OTP hasn't been sent yet */}
            {canResend && resendTimer === 0 && (
                <div className="mb-6 text-center">
                  <button
                      onClick={handleSendOTP}
                      disabled={isSubmitting || isResending}
                      className={`w-full py-3 px-4 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 ${
                          otpType === 'mobile'
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                  >
                    {isResending ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>Sending OTP...</span>
                        </>
                    ) : (
                        <>
                          <Mail className="h-5 w-5" />
                          <span>Send OTP</span>
                        </>
                    )}
                  </button>
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
                          onPaste={index === 0 ? handlePaste : undefined} // Only handle paste on first input
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          className="w-12 h-12 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          maxLength={1}
                          disabled={isSubmitting || resendTimer === 0}
                      />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Tip: You can paste the entire 6-digit code into any field
                </p>
              </div>

              <button
                  type="submit"
                  disabled={isSubmitting || otp.join('').length !== 6 || resendTimer === 0}
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
                {resendTimer > 0 ? 'Resend OTP in' : "Didn't receive the code?"}
              </p>
              {resendTimer > 0 ? (
                  <p className="text-sm text-gray-500">
                    {resendTimer} seconds
                  </p>
              ) : canResend ? (
                  <button
                      onClick={handleResend}
                      disabled={isSubmitting || isResending}
                      className="inline-flex items-center space-x-2 text-indigo-600 hover:text-indigo-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
                    <span>{isResending ? 'Sending...' : 'Resend OTP'}</span>
                  </button>
              ) : null}

              {otpSendAttempts > 0 && (
                  <p className="text-xs text-gray-400 mt-2">
                    Attempts: {otpSendAttempts}/5
                  </p>
              )}

              {/* Switch verification method */}
              {showAdvancedTypeSelector() && !showTypeSelector() && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">
                      {verificationSettings.eitherRequired
                          ? `Having trouble with ${otpType}?`
                          : `Need to verify ${otpType === 'mobile' ? 'email' : 'mobile'} too?`
                      }
                    </p>
                    <button
                        type="button"
                        onClick={() => handleOtpTypeChange(otpType === 'mobile' ? 'email' : 'mobile')}
                        disabled={!canSwitchType(otpType === 'mobile' ? 'email' : 'mobile')}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {verificationSettings.eitherRequired
                          ? `Switch to ${otpType === 'mobile' ? 'Email' : 'Mobile'} verification`
                          : `Verify ${otpType === 'mobile' ? 'Email' : 'Mobile'} instead`
                      }
                    </button>
                  </div>
              )}

              {/* Help text */}
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-500">
                  Having trouble? Check your spam folder{showAdvancedTypeSelector() ? ' or try switching verification method above' : ''}.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};

export default VerifyOTP;