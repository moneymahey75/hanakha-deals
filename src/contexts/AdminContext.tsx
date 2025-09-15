import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface GeneralSettings {
  siteName: string;
  logoUrl: string;
  dateFormat: string;
  timezone: string;
  emailVerificationRequired: boolean;
  mobileVerificationRequired: boolean;
  eitherVerificationRequired: boolean;
  referralMandatory: boolean;
  defaultParentAccount: string;
  jobSeekerVideoUrl?: string;
  jobProviderVideoUrl?: string;
  paymentMode?: boolean;
  usdtAddress?: string;
  subscriptionContractAddress?: string;
  investmentContractAddress?: string;
  subscriptionWalletAddress?: string;
  investmentWalletAddress?: string;
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
  smsSettings: SMSGateway; // Renamed from smsGateway
  emailSettings: EmailSMTP; // Renamed from emailSMTP
  subscriptionPlans: SubscriptionPlan[];
  loading: boolean;
  updateSettings: (settings: Partial<GeneralSettings>) => void;
  updateSMSSettings: (gateway: SMSGateway) => void; // Renamed
  updateEmailSettings: (smtp: EmailSMTP) => void; // Renamed
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
    siteName: 'HanakhaDeals',
    logoUrl: 'https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
    dateFormat: 'DD/MM/YYYY',
    timezone: 'UTC',
    emailVerificationRequired: true,
    mobileVerificationRequired: true,
    eitherVerificationRequired: true,
    referralMandatory: false,
    defaultParentAccount: '',
    jobSeekerVideoUrl: '',
    jobProviderVideoUrl: '',
    paymentMode: false,
    usdtAddress: '',
    subscriptionContractAddress: '',
    investmentContractAddress: '',
    subscriptionWalletAddress: '',
    investmentWalletAddress: ''
  };

  const [settings, setSettings] = useState<GeneralSettings>(defaultSettings);

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
  const loadSettings = async () => {
    try {
      setLoading(true);

      const { data: settingsData, error } = await supabase
          .from('tbl_system_settings')
          .select('tss_setting_key, tss_setting_value');

      if (error) {
        console.error('Error loading settings:', error);
        return;
      }

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
              case 'default_parent_account':
                loadedSettings.defaultParentAccount = value;
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
                // Add cases for SMS and SMTP settings
              case 'sms_gateway_provider':
                // You might want to handle these differently
                break;
              case 'sms_gateway_account_sid':
                // You might want to handle these differently
                break;
              case 'sms_gateway_auth_token':
                // You might want to handle these differently
                break;
              case 'sms_gateway_from_number':
                // You might want to handle these differently
                break;
              case 'smtp_host':
                // You might want to handle these differently
                break;
              case 'smtp_username':
                // You might want to handle these differently
                break;
              case 'smtp_password':
                // You might want to handle these differently
                break;
              case 'smtp_encryption':
                // You might want to handle these differently
                break;
            }
          } catch (error) {
            console.error(`Error processing setting ${setting.tss_setting_key}:`, error);
          }
        });

        // Merge loaded settings with defaults
        setSettings(prev => ({ ...prev, ...loadedSettings }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

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

  const refreshSettings = async () => {
    await loadSettings();
  };

  const value = {
    settings,
    smsGateway,
    emailSMTP,
    subscriptionPlans,
    loading,
    updateSettings,
    updateSMSGateway,
    updateEmailSMTP,
    updateSubscriptionPlans,
    refreshSettings
  };

  return (
      <AdminContext.Provider value={value}>
        {children}
      </AdminContext.Provider>
  );
};