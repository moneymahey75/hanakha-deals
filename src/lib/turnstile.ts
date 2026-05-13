import { supabase } from './supabase';

type SiteMode = 'live' | 'development' | undefined;

interface VerifyTurnstileOptions {
  token: string | null;
  siteMode: SiteMode;
  action: string;
}

export const verifyTurnstileToken = async ({ token, siteMode, action }: VerifyTurnstileOptions) => {
  if (!token) {
    throw new Error('Please complete the security verification');
  }

  if ((siteMode || 'live') === 'development') {
    if (token.startsWith('mock-turnstile-token-') || token.startsWith('mock-recaptcha-token-')) {
      return true;
    }
    throw new Error('Invalid development verification token');
  }

  const { data, error } = await supabase.functions.invoke('verify-turnstile', {
    body: { token, action },
  });

  if (error) {
    throw new Error(error.message || 'Security verification failed');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Security verification failed');
  }

  return true;
};
