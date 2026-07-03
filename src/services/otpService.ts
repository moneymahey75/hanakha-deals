import { supabase } from '../lib/supabase';

interface OTPCacheEntry {
  otp: string;
  expires: number;
  attempts: number;
  status: 'pending' | 'sent' | 'verified' | 'expired';
  lastSentAt: number;
}

interface OTPResponse {
  success: boolean;
  message?: string;
  error?: string;
  otpId?: string;
  expiresAt?: string;
  expires_at?: string;
}

interface VerifyResponse {
  success: boolean;
  message?: string;
  error?: string;
  verificationComplete?: boolean;
  nextStep?: string;
}

const otpCache = new Map<string, OTPCacheEntry>();
const activeRequests = new Map<string, Promise<OTPResponse>>();
const CACHE_DURATION = 10 * 60 * 1000;
const MIN_REQUEST_INTERVAL = 30000;
const REQUEST_TIMEOUT = 15000;
const SEND_OPERATION_TIMEOUT = 15000;

export class OTPService {
  private static instance: OTPService;

  static getInstance(): OTPService {
    if (!OTPService.instance) {
      OTPService.instance = new OTPService();
    }
    return OTPService.instance;
  }

  private getCacheKey(userId: string, otpType: string): string {
    return `${userId}-${otpType}`;
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of otpCache.entries()) {
      if (now > value.expires) {
        otpCache.delete(key);
        activeRequests.delete(key);
      }
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  async sendOTP(userId: string, contactInfo: string, otpType: 'email' | 'mobile'): Promise<OTPResponse> {
    const cacheKey = this.getCacheKey(userId, otpType);

    try {
      if (!userId || !contactInfo || !otpType) {
        throw new Error('Missing required parameters');
      }

      if (!['email', 'mobile'].includes(otpType)) {
        throw new Error('Invalid OTP type');
      }

      if (otpType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo)) {
        throw new Error('Invalid email format');
      }

      if (otpType === 'mobile' && !/^\+\d{10,15}$/.test(contactInfo)) {
        throw new Error('Invalid mobile format. Should include country code');
      }

      this.cleanExpiredCache();
      const now = Date.now();

      if (activeRequests.has(cacheKey)) {
        try {
          return await this.withTimeout(activeRequests.get(cacheKey)!, REQUEST_TIMEOUT, 'Active OTP request');
        } catch {
          activeRequests.delete(cacheKey);
        }
      }

      const cachedOTP = otpCache.get(cacheKey);
      if (cachedOTP) {
        const timeSinceLastSent = now - cachedOTP.lastSentAt;

        if (cachedOTP.status === 'sent' && now < cachedOTP.expires) {
          if (timeSinceLastSent < MIN_REQUEST_INTERVAL) {
            const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastSent) / 1000);

            return {
              success: true,
              message: `OTP already sent to ${contactInfo}. Please wait ${waitTime} seconds before requesting again.`
            };
          }
        }

        if (now >= cachedOTP.expires || timeSinceLastSent >= MIN_REQUEST_INTERVAL) {
          otpCache.delete(cacheKey);
        } else if (cachedOTP.status === 'sent') {
          const remainingTime = Math.ceil((cachedOTP.expires - now) / 1000);
          return {
            success: true,
            message: `OTP already sent to ${contactInfo}. Valid for ${remainingTime} seconds.`
          };
        }
      }

      const requestPromise = this.executeOTPSend(userId, contactInfo, otpType, cacheKey)
        .finally(() => {
          activeRequests.delete(cacheKey);
        });

      activeRequests.set(cacheKey, requestPromise);
      return await this.withTimeout(requestPromise, REQUEST_TIMEOUT, 'OTP send operation');

    } catch (error: any) {
      activeRequests.delete(cacheKey);
      return {
        success: false,
        error: error.message || 'Failed to send OTP'
      };
    }
  }

  private async executeOTPSend(
    userId: string,
    contactInfo: string,
    otpType: 'email' | 'mobile',
    cacheKey: string
  ): Promise<OTPResponse> {
    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    const now = Date.now();

    try {
      const sendResult = await this.withTimeout(
        this.requestServerOTP(userId, contactInfo, otpType),
        SEND_OPERATION_TIMEOUT,
        'OTP send'
      );

      otpCache.set(cacheKey, {
        otp: '',
        expires: sendResult.expires_at ? new Date(sendResult.expires_at).getTime() : expiresAt.getTime(),
        attempts: 0,
        status: 'sent',
        lastSentAt: now
      });

      return {
        success: true,
        message: sendResult.message || `OTP sent to ${contactInfo}`,
        expiresAt: sendResult.expires_at || expiresAt.toISOString()
      };

    } catch (error) {
      otpCache.set(cacheKey, {
        otp: '',
        expires: Date.now() + 30000,
        attempts: 0,
        status: 'expired',
        lastSentAt: now
      });

      throw error;
    }
  }

  async verifyOTP(userId: string, otpCode: string, otpType: 'email' | 'mobile'): Promise<VerifyResponse> {
    try {
      if (!userId || !otpCode || !otpType) {
        throw new Error('Missing required parameters');
      }

      if (!/^\d{6}$/.test(otpCode)) {
        throw new Error('Invalid OTP format. Must be 6 digits');
      }

      this.cleanExpiredCache();
      const cacheKey = this.getCacheKey(userId, otpType);
      const cachedOTP = otpCache.get(cacheKey);
      const result = await this.requestServerOTPVerification(userId, otpCode, otpType);

      if (result.success && cachedOTP) {
        otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
      }

      return result;

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Verification failed'
      };
    }
  }

  private async getAccessToken(errorMessage: string): Promise<string> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error(errorMessage);
    }
    return accessToken;
  }

  private async requestServerOTP(userId: string, contactInfo: string, otpType: 'email' | 'mobile'): Promise<OTPResponse> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const accessToken = await this.getAccessToken('Please login again to request OTP.');

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            user_id: userId,
            contact_info: contactInfo,
            otp_type: otpType
          }),
          signal: controller.signal
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          const errorMessage = result.error ||
            result.message ||
            `HTTP ${response.status}`;
          throw new Error(errorMessage);
        }

        return result as OTPResponse;
      } finally {
        clearTimeout(timeoutId);
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('OTP sending timed out. Please try again.');
      }
      throw error;
    }
  }

  private async requestServerOTPVerification(userId: string, otpCode: string, otpType: 'email' | 'mobile'): Promise<VerifyResponse> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const accessToken = await this.getAccessToken('Please login again to verify OTP.');

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/verify-otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            user_id: userId,
            otp_code: otpCode,
            otp_type: otpType
          }),
          signal: controller.signal
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          const errorMessage = result.error || result.message || `HTTP ${response.status}`;
          throw new Error(errorMessage);
        }

        return {
          success: true,
          message: result.message,
          verificationComplete: Boolean(result.verification_complete),
          nextStep: result.next_step
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('OTP verification timed out. Please try again.');
      }
      throw error;
    }
  }

  clearCache(userId: string, otpType: 'email' | 'mobile'): void {
    const cacheKey = this.getCacheKey(userId, otpType);
    otpCache.delete(cacheKey);
    activeRequests.delete(cacheKey);
  }

  getCacheStatus(userId: string, otpType: 'email' | 'mobile'): OTPCacheEntry | null {
    const cacheKey = this.getCacheKey(userId, otpType);
    return otpCache.get(cacheKey) || null;
  }

  clearAllCache(): void {
    otpCache.clear();
    activeRequests.clear();
  }

  clearTestOTPCache(): void {
  }

  canResendOTP(userId: string, otpType: 'email' | 'mobile'): { canSend: boolean; waitTime: number } {
    this.cleanExpiredCache();
    const cacheKey = this.getCacheKey(userId, otpType);
    const cachedOTP = otpCache.get(cacheKey);

    if (!cachedOTP) {
      return { canSend: true, waitTime: 0 };
    }

    const now = Date.now();
    const timeSinceLastSent = now - cachedOTP.lastSentAt;
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL - timeSinceLastSent);

    return {
      canSend: timeSinceLastSent >= MIN_REQUEST_INTERVAL || now >= cachedOTP.expires,
      waitTime: Math.ceil(waitTime / 1000)
    };
  }
}

export const otpService = OTPService.getInstance();

export const verifyOTPAPI = async (userId: string, otpCode: string, otpType: 'email' | 'mobile') => {
  return await otpService.verifyOTP(userId, otpCode, otpType);
};
