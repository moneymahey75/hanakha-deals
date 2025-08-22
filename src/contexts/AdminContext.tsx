import React, { createContext, useContext, useState } from 'react';

interface GeneralSettings {
  siteName: string;
  logoUrl: string;
  dateFormat: string;
  timezone: string;
  emailVerificationRequired: boolean;
  mobileVerificationRequired: boolean;
  referralMandatory: boolean;
  defaultParentAccount: string;
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
  smsGateway: SMSGateway;
  emailSMTP: EmailSMTP;
  subscriptionPlans: SubscriptionPlan[];
  updateSettings: (settings: Partial<GeneralSettings>) => void;
  updateSMSGateway: (gateway: SMSGateway) => void;
  updateEmailSMTP: (smtp: EmailSMTP) => void;
  updateSubscriptionPlans: (plans: SubscriptionPlan[]) => void;
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
  const [settings, setSettings] = useState<GeneralSettings>({
    siteName: 'HanakhaDeals',
    logoUrl: 'https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop',
    dateFormat: 'DD/MM/YYYY',
    timezone: 'UTC',
    emailVerificationRequired: true,
    mobileVerificationRequired: true,
    referralMandatory: false,
    defaultParentAccount: 'admin-default'
  });

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
      tsp_name: 'Basic Plan',
      tsp_price: 50,
      tsp_duration_days: 30,
      tsp_features: ['MLM Tree Access', 'Basic Dashboard', 'Email Support'],
      tsp_is_active: true
    },
    {
      id: '2',
      tsp_name: 'Premium Plan',
      tsp_price: 100,
      tsp_duration_days: 30,
      tsp_features: ['MLM Tree Access', 'Advanced Dashboard', 'Priority Support', 'Analytics'],
      tsp_is_active: true
    },
    {
      id: '3',
      tsp_name: 'Enterprise Plan',
      tsp_price: 200,
      tsp_duration_days: 30,
      tsp_features: ['MLM Tree Access', 'Advanced Dashboard', 'Priority Support', 'Analytics', 'Custom Branding', 'API Access'],
      tsp_is_active: true
    }
  ]);

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

  const value = {
    settings,
    smsGateway,
    emailSMTP,
    subscriptionPlans,
    updateSettings,
    updateSMSGateway,
    updateEmailSMTP,
    updateSubscriptionPlans
  };

  return (
      <AdminContext.Provider value={value}>
        {children}
      </AdminContext.Provider>
  );
};