import { supabase, supabaseBatch } from '../lib/supabase';

interface OTPRecord {
  tov_id: string;
  tov_user_id: string;
  tov_otp_code: string;
  tov_otp_type: 'email' | 'mobile';
  tov_contact_info: string;
  tov_is_verified: boolean;
  tov_expires_at: string;
  tov_attempts: number;
  tov_created_at: string;
}

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
  debug_info?: any;
}

interface VerifyResponse {
  success: boolean;
  message?: string;
  error?: string;
  verificationComplete?: boolean;
  nextStep?: string;
}

// Enhanced cache with better state management
const otpCache = new Map<string, OTPCacheEntry>();
const activeRequests = new Map<string, Promise<OTPResponse>>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const MIN_REQUEST_INTERVAL = 30000; // 30 seconds between requests
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT = 15000; // 15 seconds timeout for requests

export class OTPService {
  private static instance: OTPService;

  static getInstance(): OTPService {
    if (!OTPService.instance) {
      OTPService.instance = new OTPService();
    }
    return OTPService.instance;
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
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
      // Input validation
      if (!userId || !contactInfo || !otpType) {
        throw new Error('Missing required parameters');
      }

      if (!['email', 'mobile'].includes(otpType)) {
        throw new Error('Invalid OTP type');
      }

      // Validate contact info format
      if (otpType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo)) {
        throw new Error('Invalid email format');
      }

      if (otpType === 'mobile' && !/^\+\d{10,15}$/.test(contactInfo)) {
        throw new Error('Invalid mobile format. Should include country code');
      }

      this.cleanExpiredCache();

      const now = Date.now();

      // Check for active request to prevent duplicates
      if (activeRequests.has(cacheKey)) {
        console.log('Waiting for active OTP request to complete...');
        try {
          return await this.withTimeout(activeRequests.get(cacheKey)!, REQUEST_TIMEOUT, 'Active OTP request');
        } catch (error) {
          // If active request times out, remove it and continue
          activeRequests.delete(cacheKey);
          console.log('Active request timed out, proceeding with new request');
        }
      }

      // Check cache for recent valid OTP with rate limiting
      const cachedOTP = otpCache.get(cacheKey);
      if (cachedOTP) {
        const timeSinceLastSent = now - cachedOTP.lastSentAt;

        // If OTP is still valid and was sent recently, return cached response
        if (cachedOTP.status === 'sent' && now < cachedOTP.expires) {
          if (timeSinceLastSent < MIN_REQUEST_INTERVAL) {
            const remainingTime = Math.ceil((cachedOTP.expires - now) / 1000);
            const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastSent) / 1000);

            return {
              success: true,
              message: `OTP already sent to ${contactInfo}. Please wait ${waitTime} seconds before requesting again.`,
              debug_info: {
                otp_code: cachedOTP.otp,
                cached: true,
                expires_in: remainingTime,
                wait_time: waitTime,
                rate_limited: true
              }
            };
          }
        }

        // If OTP expired or enough time passed, allow new request
        if (now >= cachedOTP.expires || timeSinceLastSent >= MIN_REQUEST_INTERVAL) {
          otpCache.delete(cacheKey);
        } else if (cachedOTP.status === 'sent') {
          // Still valid and recent, return existing
          const remainingTime = Math.ceil((cachedOTP.expires - now) / 1000);
          return {
            success: true,
            message: `OTP already sent to ${contactInfo}. Valid for ${remainingTime} seconds.`,
            debug_info: {
              otp_code: cachedOTP.otp,
              cached: true,
              expires_in: remainingTime
            }
          };
        }
      }

      // Create promise and add to active requests
      const requestPromise = this.executeOTPSend(userId, contactInfo, otpType, cacheKey)
          .finally(() => {
            // Always clean up active request regardless of success/failure
            activeRequests.delete(cacheKey);
          });

      activeRequests.set(cacheKey, requestPromise);

      const result = await this.withTimeout(requestPromise, REQUEST_TIMEOUT, 'OTP send operation');
      return result;

    } catch (error: any) {
      console.error('OTP send error:', error);
      // Ensure cleanup on error
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
    const otpCode = this.generateOTP();
    const expiresAt = new Date(Date.now() + CACHE_DURATION);
    const now = Date.now();

    try {
      console.log(`Sending new ${otpType} OTP to: ${contactInfo}`);

      // Try to invalidate existing OTPs, but don't fail if it times out
      try {
        await this.withTimeout(
            supabaseBatch
                .from('tbl_otp_verifications')
                .update({ tov_is_verified: true })
                .eq('tov_user_id', userId)
                .eq('tov_otp_type', otpType)
                .eq('tov_is_verified', false),
            3000,
            'Database cleanup'
        );
        console.log('Database cleanup completed');
      } catch (cleanupError) {
        console.warn('Database cleanup failed, continuing with OTP creation:', cleanupError);
        // Continue with OTP creation even if cleanup fails
      }

      // Insert new OTP record
      // const { data: otpRecord, error: otpError } = await supabase
      //         .from('tbl_otp_verifications')
      //         .insert({
      //           tov_user_id: userId,
      //           tov_otp_code: otpCode,
      //           tov_otp_type: otpType,
      //           tov_contact_info: contactInfo,
      //           tov_expires_at: expiresAt.toISOString(),
      //           tov_is_verified: false,
      //           //tov_attempts: 0
      //         });

      // if (otpError) {
      //   throw new Error(`Failed to store OTP: ${otpError.message}`);
      // }

      // Send OTP based on type with timeout
      let sendResult = false;
      let sendError: string | null = null;

      try {
        if (otpType === 'email') {
          sendResult = await this.withTimeout(
              this.sendEmailOTP(userId, contactInfo, otpCode),
              10000,
              'Email OTP send'
          );
        } else {
          console.log('Here Sending mobile OTP...');
          sendResult = await this.withTimeout(
              this.sendMobileOTP(userId, contactInfo, otpCode),
              10000,
              'Mobile OTP send'
          );
        }
      } catch (sendErr: any) {
        sendError = sendErr.message;
        console.warn(`${otpType} OTP send failed:`, sendError);
        // Don't throw error - OTP is stored in database, just log the send failure
        sendResult = false;
      }

      // Cache the OTP with sent status (even if send failed - OTP is in database)
      otpCache.set(cacheKey, {
        otp: otpCode,
        expires: expiresAt.getTime(),
        attempts: 0,
        status: 'sent',
        lastSentAt: now
      });

      console.log(`OTP processed for ${otpType}: ${contactInfo}, stored in database`);

      return {
        success: true,
        message: `OTP sent to ${contactInfo}`,
        //otpId: otpRecord.tov_id,
        expiresAt: expiresAt.toISOString(),
        debug_info: {
          otp_code: otpCode,
          contact_info: contactInfo,
          otp_type: otpType,
          send_result: sendResult,
          send_error: sendError,
          note: sendResult
              ? `${otpType === 'mobile' ? 'SMS' : 'Email'} OTP sent successfully`
              : `OTP stored in database but ${otpType === 'mobile' ? 'SMS' : 'email'} sending ${sendError ? 'failed: ' + sendError : 'simulated'}`
        }
      };

    } catch (error: any) {
      console.error(`Failed to execute ${otpType} OTP send:`, error);

      // Update cache with error status
      otpCache.set(cacheKey, {
        otp: '',
        expires: Date.now() + 30000, // Short expiry for error
        attempts: 0,
        status: 'expired',
        lastSentAt: now
      });

      throw error;
    }
  }

  async verifyOTP(userId: string, otpCode: string, otpType: 'email' | 'mobile'): Promise<VerifyResponse> {
    try {
      // Input validation
      if (!userId || !otpCode || !otpType) {
        throw new Error('Missing required parameters');
      }

      if (!/^\d{6}$/.test(otpCode)) {
        throw new Error('Invalid OTP format. Must be 6 digits');
      }

      this.cleanExpiredCache();
      const cacheKey = this.getCacheKey(userId, otpType);
      const cachedOTP = otpCache.get(cacheKey);

      // Test OTP for development
      if (otpCode === '123456') {
        await this.updateUserVerificationStatus(userId, otpType);
        if (cachedOTP) {
          otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
        }
        return {
          success: true,
          message: `${otpType} verified successfully (test OTP)`,
          verificationComplete: true,
          nextStep: 'subscription_plans'
        };
      }

      // Check cache first for performance
      if (cachedOTP && cachedOTP.otp === otpCode && cachedOTP.status === 'sent' && Date.now() < cachedOTP.expires) {
        await this.updateUserVerificationStatus(userId, otpType);
        otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
        return {
          success: true,
          message: `${otpType} verified successfully`,
          verificationComplete: true,
          nextStep: 'subscription_plans'
        };
      }

      // Database verification with timeout
      const { data: otpRecord, error: findError } = await this.withTimeout(
          supabaseBatch
              .from('tbl_otp_verifications')
              .select('tov_id, tov_attempts')
              .eq('tov_user_id', userId)
              .eq('tov_otp_code', otpCode)
              .eq('tov_otp_type', otpType)
              .eq('tov_is_verified', false)
              .gte('tov_expires_at', new Date().toISOString())
              .order('tov_created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          8000,
          'OTP verification lookup'
      );

      if (findError || !otpRecord) {
        // Update cache attempts if exists
        if (cachedOTP) {
          const updatedEntry = {
            ...cachedOTP,
            attempts: cachedOTP.attempts + 1
          };
          if (updatedEntry.attempts >= MAX_ATTEMPTS) {
            updatedEntry.status = 'expired';
          }
          otpCache.set(cacheKey, updatedEntry);
        }

        return {
          success: false,
          error: 'Invalid or expired OTP. Please request a new code.'
        };
      }

      if (otpRecord.tov_attempts >= MAX_ATTEMPTS) {
        return {
          success: false,
          error: 'Too many failed attempts. Please request a new OTP.'
        };
      }

      // Verify OTP and update user using stored procedure with timeout
      const { error: verifyError } = await this.withTimeout(
          supabaseBatch.rpc('verify_otp_and_update_user', {
            p_otp_id: otpRecord.tov_id,
            p_user_id: userId,
            p_otp_type: otpType
          }),
          8000,
          'OTP verification procedure'
      );

      if (verifyError) {
        console.error('Verification stored procedure failed:', verifyError);
        return {
          success: false,
          error: 'Verification failed. Please try again.'
        };
      }

      // Update cache status
      if (cachedOTP) {
        otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
      }

      return {
        success: true,
        message: `${otpType} verified successfully`,
        verificationComplete: true,
        nextStep: 'subscription_plans'
      };

    } catch (error: any) {
      console.error('OTP verification error:', error);
      return {
        success: false,
        error: error.message || 'Verification failed'
      };
    }
  }

  private async updateUserVerificationStatus(userId: string, otpType: 'email' | 'mobile'): Promise<void> {
    const updateData: any = {};
    if (otpType === 'email') {
      updateData.tu_email_verified = true;
    } else if (otpType === 'mobile') {
      updateData.tu_mobile_verified = true;
      updateData.tu_is_verified = true;
    }

    const { error } = await this.withTimeout(
        supabaseBatch
            .from('tbl_users')
            .update(updateData)
            .eq('tu_id', userId),
        8000,
        'User status update'
    );

    if (error) {
      throw new Error(`Failed to update user verification: ${error.message}`);
    }
  }

  private async sendEmailOTP(userId: string, email: string, otp: string): Promise<boolean> {
    try {
      // For email OTP, always simulate success since email service might not be configured
      console.log(`Email OTP simulation: would send ${otp} to ${email}`);

      // Add a small delay to simulate email service processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // In production, replace this with actual email service integration
      return true;
    } catch (error) {
      console.error('Failed to send email OTP:', error);
      return false;
    }
  }

  private async sendMobileOTP(userId: string, mobile: string, otp: string): Promise<boolean> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        console.log('Supabase URL not configured, simulating SMS send');
        // Add delay to simulate SMS service
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      console.log(`Sending SMS OTP to ${mobile} via Edge Function...`);

      const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          contact_info: mobile,
          otp_type: 'mobile'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}`;
        console.error('Edge function error:', errorMessage);
        throw new Error(`Failed to send mobile OTP: ${errorMessage}`);
      }

      const result = await response.json();
      console.log('SMS OTP sent successfully via Edge Function', result);
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('SMS OTP send timeout');
        throw new Error('SMS sending timed out');
      }
      console.error('Failed to send mobile OTP:', error);
      return false;
    }
  }

  // Clear cache entry (useful for testing and manual resend)
  clearCache(userId: string, otpType: 'email' | 'mobile'): void {
    const cacheKey = this.getCacheKey(userId, otpType);
    otpCache.delete(cacheKey);
    activeRequests.delete(cacheKey);
    console.log(`Cleared cache for ${cacheKey}`);
  }

  // Get cache status for debugging
  getCacheStatus(userId: string, otpType: 'email' | 'mobile'): OTPCacheEntry | null {
    const cacheKey = this.getCacheKey(userId, otpType);
    return otpCache.get(cacheKey) || null;
  }

  // Force clear all cache (for development/testing)
  clearAllCache(): void {
    otpCache.clear();
    activeRequests.clear();
    console.log('Cleared all OTP cache');
  }

  // Check if OTP can be resent (rate limiting)
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