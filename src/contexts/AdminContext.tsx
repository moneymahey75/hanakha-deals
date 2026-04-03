import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { adminApi } from '../lib/adminApi';

let inFlightAdminSettingsRequest: Promise<any[]> | null = null;

interface GeneralSettings {
  siteName: string;
  logoUrl: string;
  dateFormat: string;
  timezone: string;
  emailVerificationRequired: boolean;
  mobileVerificationRequired: boolean;
  eitherVerificationRequired: boolean;
  referralMandatory: boolean;
  jobSeekerVideoUrl?: string;
  jobProviderVideoUrl?: string;
  paymentMode?: boolean;
  usdtAddress?: string;
  subscriptionContractAddress?: string;
  investmentContractAddress?: string;
  subscriptionWalletAddress?: string;
  investmentWalletAddress?: string;
  adminPaymentWallet?: string;
  paymentWalletsEnabled?: {
    trust_wallet: boolean;
    metamask: boolean;
    safepal: boolean;
  };
  withdrawalMinAmount: number;
  withdrawalStepAmount: number;
  withdrawalCommissionPercent: number;
  withdrawalAutoTransfer: boolean;
  withdrawalProcessingDays: number;
  // Username validation settings
  usernameMinLength: number;
  usernameMaxLength: number;
  usernameAllowSpaces: boolean;
  usernameAllowSpecialChars: boolean;
  usernameAllowedSpecialChars: string;
  usernameForceLowerCase: boolean;
  usernameUniqueRequired: boolean;
  usernameAllowNumbers: boolean;
  usernameMustStartWithLetter: boolean;

  // Password validation settings
  passwordMinLength: number;
  passwordMaxLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSpecialChars: boolean;
  passwordAllowedSpecialChars: string;
  passwordPreventCommon: boolean;
  passwordPreventSequences: boolean;
  passwordPreventRepeats: boolean;
  passwordMaxConsecutive: number;
  passwordMinUniqueChars: number;
  passwordExpiryDays: number;
  passwordHistoryCount: number;
}

interface SMSGateway {
  provider: string;
  apiKey: string;
  apiSecret: string;
  senderId: string;
}

interface EmailSMTP {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  duration: number;
  features: string[];
  isActive: boolean;
}

interface AdminContextType {
  settings: GeneralSettings;
  smsSettings: SMSGateway;
  emailSettings: EmailSMTP;
  subscriptionPlans: SubscriptionPlan[];
  loading: boolean;
  updateSettings: (settings: Partial<GeneralSettings>) => void;
  updateSMSSettings: (gateway: SMSGateway) => void;
  updateEmailSettings: (smtp: EmailSMTP) => void;
  updateSubscriptionPlans: (plans: SubscriptionPlan[]) => void;
  refreshSettings: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);

  // Default settings as fallback
  const defaultSettings: GeneralSettings = {
    siteName: 'ShopClick',
    logoUrl: '/shopclick_logo.png',
    dateFormat: 'DD/MM/YYYY',
    timezone: 'UTC',
    emailVerificationRequired: true,
    mobileVerificationRequired: true,
    eitherVerificationRequired: true,
    referralMandatory: false,
    jobSeekerVideoUrl: '',
    jobProviderVideoUrl: '',
    paymentMode: false,
    usdtAddress: '',
    subscriptionContractAddress: '',
    investmentContractAddress: '',
    subscriptionWalletAddress: '',
    investmentWalletAddress: '',
    adminPaymentWallet: '',
    paymentWalletsEnabled: {
      trust_wallet: true,
      metamask: true,
      safepal: true
    },
    withdrawalMinAmount: 10,
    withdrawalStepAmount: 10,
    withdrawalCommissionPercent: 0.5,
    withdrawalAutoTransfer: false,
    withdrawalProcessingDays: 5,
    // Username validation default settings
    usernameMinLength: 8,
    usernameMaxLength: 30,
    usernameAllowSpaces: false,
    usernameAllowSpecialChars: true,
    usernameAllowedSpecialChars: '._-',
    usernameForceLowerCase: true,
    usernameUniqueRequired: true,
    usernameAllowNumbers: true,
    usernameMustStartWithLetter: true,
    // Password validation default settings
    passwordMinLength: 8,
    passwordMaxLength: 128,
    passwordRequireUppercase: true,
    passwordRequireLowercase: true,
    passwordRequireNumbers: true,
    passwordRequireSpecialChars: true,
    passwordAllowedSpecialChars: '!@#$%^&*()_+-=[]{};:\'"|,.<>?/~`',
    passwordPreventCommon: true,
    passwordPreventSequences: true,
    passwordPreventRepeats: true,
    passwordMaxConsecutive: 3,
    passwordMinUniqueChars: 5,
    passwordExpiryDays: 90,
    passwordHistoryCount: 5
  };

  const [settings, setSettings] = useState<GeneralSettings>(defaultSettings);
  const [hasLoadedSettings, setHasLoadedSettings] = useState(false);

  const [smsGateway, setSMSGateway] = useState<SMSGateway>({
    provider: 'Twilio (via Supabase)',
    apiKey: '',
    apiSecret: '',
    senderId: 'MLM-PLATFORM'
  });

  const [emailSMTP, setEmailSMTP] = useState<EmailSMTP>({
    host: 'Resend.com (via Supabase)',
    port: 587,
    username: '',
    password: '',
    encryption: 'TLS'
  });

  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([
    {
      id: '1',
      name: 'Basic Plan',
      price: 50,
      duration: 30,
      features: ['MLM Tree Access', 'Basic Dashboard', 'Email Support'],
      isActive: true
    },
    {
      id: '2',
      name: 'Premium Plan',
      price: 100,
      duration: 30,
      features: ['MLM Tree Access', 'Advanced Dashboard', 'Priority Support', 'Analytics'],
      isActive: true
    },
    {
      id: '3',
      name: 'Enterprise Plan',
      price: 200,
      duration: 30,
      features: ['MLM Tree Access', 'Advanced Dashboard', 'Priority Support', 'Analytics', 'Custom Branding', 'API Access'],
      isActive: true
    }
  ]);

  // Function to load settings from database
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);

      // Add timeout and better error handling
      const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const fetchPromise = inFlightAdminSettingsRequest ?? adminApi.post<any[]>('admin-get-settings', {});
      inFlightAdminSettingsRequest = fetchPromise;
      const settingsData = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (settingsData && settingsData.length > 0) {
        const loadedSettings: Partial<GeneralSettings> = {};

        settingsData.forEach((setting) => {
          try {
            let value;

            // Try to parse as JSON first
            try {
              value = JSON.parse(setting.tss_setting_value);
            } catch (parseError) {
              // If parsing fails, use the raw string value
              value = setting.tss_setting_value;
            }

            switch (setting.tss_setting_key) {
              case 'site_name':
                loadedSettings.siteName = value;
                break;
              case 'logo_url':
                loadedSettings.logoUrl = value;
                break;
              case 'date_format':
                loadedSettings.dateFormat = value;
                break;
              case 'timezone':
                loadedSettings.timezone = value;
                break;
              case 'email_verification_required':
                loadedSettings.emailVerificationRequired = value;
                break;
              case 'mobile_verification_required':
                loadedSettings.mobileVerificationRequired = value;
                break;
              case 'either_verification_required':
                loadedSettings.eitherVerificationRequired = value;
                break;
              case 'referral_mandatory':
                loadedSettings.referralMandatory = value;
                break;
              case 'job_seeker_video_url':
                loadedSettings.jobSeekerVideoUrl = value;
                break;
              case 'job_provider_video_url':
                loadedSettings.jobProviderVideoUrl = value;
                break;
              case 'payment_mode':
                loadedSettings.paymentMode = value;
                break;
              case 'usdt_address':
                loadedSettings.usdtAddress = value;
                break;
              case 'subscription_contract_address':
                loadedSettings.subscriptionContractAddress = value;
                break;
              case 'investment_contract_address':
                loadedSettings.investmentContractAddress = value;
                break;
              case 'subscription_wallet_address':
                loadedSettings.subscriptionWalletAddress = value;
                break;
              case 'investment_wallet_address':
                loadedSettings.investmentWalletAddress = value;
                break;
              case 'admin_payment_wallet':
                loadedSettings.adminPaymentWallet = value;
                break;
              case 'payment_wallets_enabled':
                loadedSettings.paymentWalletsEnabled = value;
                break;
              case 'withdrawal_min_amount':
                loadedSettings.withdrawalMinAmount = Number(value);
                break;
              case 'withdrawal_step_amount':
                loadedSettings.withdrawalStepAmount = Number(value);
                break;
              case 'withdrawal_commission_percent':
                loadedSettings.withdrawalCommissionPercent = Number(value);
                break;
              case 'withdrawal_auto_transfer':
                loadedSettings.withdrawalAutoTransfer = Boolean(value);
                break;
              case 'withdrawal_processing_days':
                loadedSettings.withdrawalProcessingDays = Number(value);
                break;

                // Username validation settings
              case 'username_min_length':
                loadedSettings.usernameMinLength = parseInt(value) || defaultSettings.usernameMinLength;
                break;
              case 'username_max_length':
                loadedSettings.usernameMaxLength = parseInt(value) || defaultSettings.usernameMaxLength;
                break;
              case 'username_allow_spaces':
                loadedSettings.usernameAllowSpaces = Boolean(value);
                break;
              case 'username_allow_special_chars':
                loadedSettings.usernameAllowSpecialChars = Boolean(value);
                break;
              case 'username_allowed_special_chars':
                loadedSettings.usernameAllowedSpecialChars = value || defaultSettings.usernameAllowedSpecialChars;
                break;
              case 'username_force_lower_case':
                loadedSettings.usernameForceLowerCase = Boolean(value);
                break;
              case 'username_unique_required':
                loadedSettings.usernameUniqueRequired = Boolean(value);
                break;
              case 'username_allow_numbers':
                loadedSettings.usernameAllowNumbers = Boolean(value);
                break;
              case 'username_must_start_with_letter':
                loadedSettings.usernameMustStartWithLetter = Boolean(value);
                break;

                // Password validation settings
              case 'password_min_length':
                loadedSettings.passwordMinLength = parseInt(value) || defaultSettings.passwordMinLength;
                break;
              case 'password_max_length':
                loadedSettings.passwordMaxLength = parseInt(value) || defaultSettings.passwordMaxLength;
                break;
              case 'password_require_uppercase':
                loadedSettings.passwordRequireUppercase = Boolean(value);
                break;
              case 'password_require_lowercase':
                loadedSettings.passwordRequireLowercase = Boolean(value);
                break;
              case 'password_require_numbers':
                loadedSettings.passwordRequireNumbers = Boolean(value);
                break;
              case 'password_require_special_chars':
                loadedSettings.passwordRequireSpecialChars = Boolean(value);
                break;
              case 'password_allowed_special_chars':
                loadedSettings.passwordAllowedSpecialChars = value || defaultSettings.passwordAllowedSpecialChars;
                break;
              case 'password_prevent_common':
                loadedSettings.passwordPreventCommon = Boolean(value);
                break;
              case 'password_prevent_sequences':
                loadedSettings.passwordPreventSequences = Boolean(value);
                break;
              case 'password_prevent_repeats':
                loadedSettings.passwordPreventRepeats = Boolean(value);
                break;
              case 'password_max_consecutive':
                loadedSettings.passwordMaxConsecutive = parseInt(value) || defaultSettings.passwordMaxConsecutive;
                break;
              case 'password_min_unique_chars':
                loadedSettings.passwordMinUniqueChars = parseInt(value) || defaultSettings.passwordMinUniqueChars;
                break;
              case 'password_expiry_days':
                loadedSettings.passwordExpiryDays = parseInt(value) || defaultSettings.passwordExpiryDays;
                break;
              case 'password_history_count':
                loadedSettings.passwordHistoryCount = parseInt(value) || defaultSettings.passwordHistoryCount;
                break;

                // SMS and SMTP settings
              case 'sms_gateway_provider':
                // Handle SMS settings if needed
                break;
              case 'sms_gateway_account_sid':
                // Handle SMS settings if needed
                break;
              case 'sms_gateway_auth_token':
                // Handle SMS settings if needed
                break;
              case 'sms_gateway_from_number':
                // Handle SMS settings if needed
                break;
              case 'smtp_host':
                // Handle SMTP settings if needed
                break;
              case 'smtp_username':
                // Handle SMTP settings if needed
                break;
              case 'smtp_password':
                // Handle SMTP settings if needed
                break;
              case 'smtp_encryption':
                // Handle SMTP settings if needed
                break;
            }
          } catch (error) {
            console.error(`Error processing setting ${setting.tss_setting_key}:`, error);
          }
        });

        // Merge loaded settings with defaults, ensuring all settings are set
        const mergedSettings = {
          ...defaultSettings,
          ...loadedSettings,
          // Ensure numeric values have proper fallbacks
          usernameMinLength: loadedSettings.usernameMinLength !== undefined ?
              loadedSettings.usernameMinLength : defaultSettings.usernameMinLength,
          usernameMaxLength: loadedSettings.usernameMaxLength !== undefined ?
              loadedSettings.usernameMaxLength : defaultSettings.usernameMaxLength,
          usernameAllowedSpecialChars: loadedSettings.usernameAllowedSpecialChars ||
              defaultSettings.usernameAllowedSpecialChars,
          // Password numeric values fallbacks
          passwordMinLength: loadedSettings.passwordMinLength !== undefined ?
              loadedSettings.passwordMinLength : defaultSettings.passwordMinLength,
          passwordMaxLength: loadedSettings.passwordMaxLength !== undefined ?
              loadedSettings.passwordMaxLength : defaultSettings.passwordMaxLength,
          passwordMaxConsecutive: loadedSettings.passwordMaxConsecutive !== undefined ?
              loadedSettings.passwordMaxConsecutive : defaultSettings.passwordMaxConsecutive,
          passwordMinUniqueChars: loadedSettings.passwordMinUniqueChars !== undefined ?
              loadedSettings.passwordMinUniqueChars : defaultSettings.passwordMinUniqueChars,
          passwordExpiryDays: loadedSettings.passwordExpiryDays !== undefined ?
              loadedSettings.passwordExpiryDays : defaultSettings.passwordExpiryDays,
          passwordHistoryCount: loadedSettings.passwordHistoryCount !== undefined ?
              loadedSettings.passwordHistoryCount : defaultSettings.passwordHistoryCount,
          passwordAllowedSpecialChars: loadedSettings.passwordAllowedSpecialChars ||
              defaultSettings.passwordAllowedSpecialChars,
          withdrawalMinAmount: Number.isFinite(loadedSettings.withdrawalMinAmount as number)
            ? (loadedSettings.withdrawalMinAmount as number)
            : defaultSettings.withdrawalMinAmount,
          withdrawalStepAmount: Number.isFinite(loadedSettings.withdrawalStepAmount as number)
            ? (loadedSettings.withdrawalStepAmount as number)
            : defaultSettings.withdrawalStepAmount,
          withdrawalCommissionPercent: Number.isFinite(loadedSettings.withdrawalCommissionPercent as number)
            ? (loadedSettings.withdrawalCommissionPercent as number)
            : defaultSettings.withdrawalCommissionPercent,
          withdrawalAutoTransfer: loadedSettings.withdrawalAutoTransfer !== undefined
            ? Boolean(loadedSettings.withdrawalAutoTransfer)
            : defaultSettings.withdrawalAutoTransfer,
          withdrawalProcessingDays: Number.isFinite(loadedSettings.withdrawalProcessingDays as number)
            ? (loadedSettings.withdrawalProcessingDays as number)
            : defaultSettings.withdrawalProcessingDays
        };

        setSettings(mergedSettings);
        setHasLoadedSettings(true);
      } else {
        console.log('No settings found in database');
        if (!hasLoadedSettings) {
          setSettings(defaultSettings);
        }
      }
    } catch (error) {
      console.warn('Database connection failed:', error);
      if (!hasLoadedSettings) {
        setSettings(defaultSettings);
      }
    } finally {
      inFlightAdminSettingsRequest = null;
      setLoading(false);
    }
  }, []);

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = (newSettings: Partial<GeneralSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const updateSMSGateway = (gateway: SMSGateway) => {
    setSMSGateway(gateway);
  };

  const updateEmailSMTP = (smtp: EmailSMTP) => {
    setEmailSMTP(smtp);
  };

  const updateSubscriptionPlans = (plans: SubscriptionPlan[]) => {
    setSubscriptionPlans(plans);
  };

  const refreshSettings = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  // Memoize the value object to prevent unnecessary re-renders of child components
  // This prevents a re-render loop when child components update their state
  const value = useMemo(() => ({
    settings,
    smsSettings: smsGateway,
    emailSettings: emailSMTP,
    subscriptionPlans,
    loading,
    updateSettings,
    updateSMSSettings: updateSMSGateway,
    updateEmailSettings: updateEmailSMTP,
    updateSubscriptionPlans,
    refreshSettings
  }), [settings, smsGateway, emailSMTP, subscriptionPlans, loading, updateSettings, updateSMSGateway, updateEmailSMTP, updateSubscriptionPlans, refreshSettings]);

  return (
      <AdminContext.Provider value={value}>
        {children}
      </AdminContext.Provider>
  );
};
