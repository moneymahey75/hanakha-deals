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
}

interface VerifyResponse {
  success: boolean;
  message?: string;
  error?: string;
  verificationComplete?: boolean;
  nextStep?: string;
}

interface TestOTPSettings {
  enabled: boolean;
  code: string;
}

// Enhanced cache with better state management
const otpCache = new Map<string, OTPCacheEntry>();
const activeRequests = new Map<string, Promise<OTPResponse>>();
const testOTPCache = { enabled: false, code: '123456', lastFetched: 0 };
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const MIN_REQUEST_INTERVAL = 30000; // 30 seconds between requests
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT = 15000; // 15 seconds timeout for requests
const SEND_OPERATION_TIMEOUT = 15000; // Keep per-channel send timeouts aligned with the overall request timeout
const TEST_OTP_CACHE_DURATION = 60000; // 1 minute cache for test OTP settings

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

  // Get test OTP settings from database with caching
  private async getTestOTPSettings(): Promise<TestOTPSettings> {
    const now = Date.now();
    
    // Use cached settings if not expired
    if (now - testOTPCache.lastFetched < TEST_OTP_CACHE_DURATION) {
      return { enabled: testOTPCache.enabled, code: testOTPCache.code };
    }

    try {
      const { data, error } = await supabase
          .from('tbl_system_settings')
          .select('tss_setting_key, tss_setting_value')
          .in('tss_setting_key', ['test_otp_enabled', 'test_otp_code']);

      if (error) {
        return { enabled: testOTPCache.enabled, code: testOTPCache.code };
      }

      const settingsMap = data?.reduce((acc: any, setting: any) => {
        try {
          acc[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value);
        } catch (parseError) {
          acc[setting.tss_setting_key] = setting.tss_setting_key === 'test_otp_enabled' ? false : '123456';
        }
        return acc;
      }, {}) || {};

      // Update cache
      testOTPCache.enabled = settingsMap.test_otp_enabled || false;
      testOTPCache.code = settingsMap.test_otp_code || '123456';
      testOTPCache.lastFetched = now;

      return { enabled: testOTPCache.enabled, code: testOTPCache.code };
    } catch (error) {
      return { enabled: testOTPCache.enabled, code: testOTPCache.code };
    }
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
        try {
          return await this.withTimeout(activeRequests.get(cacheKey)!, REQUEST_TIMEOUT, 'Active OTP request');
        } catch (error) {
          // If active request times out, remove it and continue
          activeRequests.delete(cacheKey);
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
              message: `OTP already sent to ${contactInfo}. Please wait ${waitTime} seconds before requesting again.`
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
            message: `OTP already sent to ${contactInfo}. Valid for ${remainingTime} seconds.`
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
      // Try to invalidate existing OTPs using RPC, but don't fail if it times out
      try {
        await this.withTimeout(
            supabaseBatch.rpc('invalidate_user_otps', {
              p_user_id: userId,
              p_otp_type: otpType
            }),
            3000,
            'Database cleanup'
        );
      } catch (cleanupError) {
        // Continue with OTP creation even if cleanup fails
      }

      // Insert new OTP record using RPC
      const { data: otpResult, error: otpError } = await this.withTimeout(
          supabaseBatch.rpc('create_otp_record', {
            p_user_id: userId,
            p_otp_code: otpCode,
            p_otp_type: otpType,
            p_contact_info: contactInfo,
            p_expires_at: expiresAt.toISOString()
          }),
          8000,
          'Database insert'
      );

      if (otpError || !otpResult?.success) {
        throw new Error(`Failed to store OTP: ${otpError?.message || 'Unknown error'}`);
      }

      // Send OTP based on type with timeout
      let sendResult = false;
      let sendError: string | null = null;

      try {
        if (otpType === 'email') {
          sendResult = await this.withTimeout(
              this.sendEmailOTP(userId, contactInfo, otpCode),
              SEND_OPERATION_TIMEOUT,
              'Email OTP send'
          );
        } else {
          sendResult = await this.withTimeout(
              this.sendMobileOTP(userId, contactInfo, otpCode),
              SEND_OPERATION_TIMEOUT,
              'Mobile OTP send'
          );
        }
      } catch (sendErr: any) {
        sendError = sendErr.message;
        throw new Error(sendError || `Failed to send ${otpType} OTP`);
      }

      // Only cache if send was successful
      if (!sendResult) {
        throw new Error(sendError || `Failed to send ${otpType} OTP`);
      }

      // Cache the OTP with sent status only after successful send
      otpCache.set(cacheKey, {
        otp: otpCode,
        expires: expiresAt.getTime(),
        attempts: 0,
        status: 'sent',
        lastSentAt: now
      });

      return {
        success: true,
        message: `OTP sent to ${contactInfo}`,
        expiresAt: expiresAt.toISOString()
      };

    } catch (error: any) {
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

      const now = Date.now();

      // Check for configurable test OTP
      const testOTPSettings = await this.getTestOTPSettings();
      if (testOTPSettings.enabled && otpCode === testOTPSettings.code) {
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
      if (cachedOTP && cachedOTP.otp === otpCode && cachedOTP.status === 'sent' && now < cachedOTP.expires) {
        await this.updateUserVerificationStatus(userId, otpType);
        otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
        
        // Clean up any database records for this user/type after successful cache verification
        this.cleanupOTPRecords(userId, otpType).catch(() => {});
        
        return {
          success: true,
          message: `${otpType} verified successfully`,
          verificationComplete: true,
          nextStep: 'subscription_plans'
        };
      }

      // Database verification with timeout (if database is working)
      let otpRecordId: string | null = null;
      try {
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
            5000,
            'OTP verification lookup'
        );
        if (!findError && otpRecord) {
          if (otpRecord.tov_attempts >= MAX_ATTEMPTS) {
            return {
              success: false,
              error: 'Too many failed attempts. Please request a new OTP.'
            };
          }

          otpRecordId = otpRecord.tov_id;

          // Verify OTP and update user using stored procedure
          const { error: verifyError } = await this.withTimeout(
              supabaseBatch.rpc('verify_otp_and_update_user', {
                p_otp_id: otpRecord.tov_id,
                p_user_id: userId,
                p_otp_type: otpType
              }),
              8000,
              'OTP verification procedure'
          );

          if (!verifyError) {
            // Update cache status
            if (cachedOTP) {
              otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
            }
            // Delete the OTP record after successful verification
            await this.deleteOTPRecord(otpRecordId);
            // Also cleanup any other OTP records for this user/type
            this.cleanupOTPRecords(userId, otpType).catch(() => {});

            return {
              success: true,
              message: `${otpType} verified successfully`,
              verificationComplete: true,
              nextStep: 'subscription_plans'
            };
          }
        }
      } catch (dbError) {
      }

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

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Verification failed'
      };
    }
  }

  // Delete specific OTP record after successful verification
  private async deleteOTPRecord(otpRecordId: string): Promise<void> {
    try {
      const { error } = await this.withTimeout(
        supabaseBatch.rpc('delete_otp_record', {
          p_otp_id: otpRecordId
        }),
        5000,
        'OTP record deletion'
      );

      if (error) {
        return;
      }
    } catch {
    }
  }

  // Cleanup all OTP records for a user/type (for additional safety)
  private async cleanupOTPRecords(userId: string, otpType: 'email' | 'mobile'): Promise<void> {
    try {
      const { data, error } = await this.withTimeout(
        supabaseBatch.rpc('delete_user_otps', {
          p_user_id: userId,
          p_otp_type: otpType
        }),
        5000,
        'OTP records cleanup'
      );

      if (error) {
        return;
      }
    } catch (error) {
    }
  }

  private async updateUserVerificationStatus(userId: string, otpType: 'email' | 'mobile'): Promise<void> {
    const updateData: any = {};
    if (otpType === 'email') {
      updateData.tu_email_verified = true;
      updateData.tu_is_verified = true;
    } else if (otpType === 'mobile') {
      updateData.tu_mobile_verified = true;
      updateData.tu_is_verified = true;
    }

    try {
      // Prefer authenticated client so RLS allows user to update their own record
      const { error: authUpdateError } = await this.withTimeout(
        supabase
          .from('tbl_users')
          .update(updateData)
          .eq('tu_id', userId),
        8000,
        'User status update (auth)'
      );

      if (authUpdateError) {
        const { error: batchError } = await this.withTimeout(
          supabaseBatch
            .from('tbl_users')
            .update(updateData)
            .eq('tu_id', userId),
          8000,
          'User status update (batch)'
        );

        if (batchError) {
          throw new Error(`Failed to update user verification: ${batchError.message}`);
        }
      }
    } catch (error) {
      // Don't throw error - verification can still proceed
    }
  }

  private async sendEmailOTP(userId: string, email: string, otp: string): Promise<boolean> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          contact_info: email,
          otp_type: 'email',
          otp_code: otp
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok || !result.success) {
        const errorMessage = result.error_details?.provider_error ||
                           result.error ||
                           result.message ||
                           `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      return true;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Email sending timed out. Please try again.');
      }
      throw error;
    }
  }


  private async sendMobileOTP(userId: string, mobile: string, otp: string): Promise<boolean> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          user_id: userId,
          contact_info: mobile,
          otp_type: 'mobile',
          otp_code: otp
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok || !result.success) {
        const errorMessage = result.error_details?.provider_error ||
                           result.error ||
                           result.message ||
                           `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      return true;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('SMS sending timed out. Please try again.');
      }
      throw error;
    }
  }

  // Clear cache entry (useful for testing and manual resend)
  clearCache(userId: string, otpType: 'email' | 'mobile'): void {
    const cacheKey = this.getCacheKey(userId, otpType);
    otpCache.delete(cacheKey);
    activeRequests.delete(cacheKey);
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
  }

  // Clear test OTP cache to force refresh
  clearTestOTPCache(): void {
    testOTPCache.lastFetched = 0;
  }

  // Clean up expired OTP records from database (periodic maintenance)
  async cleanupExpiredOTPs(): Promise<{ deleted: number; error?: string }> {
    try {
      const { data, error } = await this.withTimeout(
        supabaseBatch.rpc('delete_expired_otps'),
        10000,
        'Expired OTP cleanup'
      );

      if (error) {
        return { deleted: 0, error: error.message };
      }

      const deletedCount = data?.deleted || 0;

      return { deleted: deletedCount };
    } catch (error: any) {
      return { deleted: 0, error: error.message };
    }
  }

  // Clean up all OTP records for a specific user (useful for user deletion)
  async cleanupUserOTPs(userId: string): Promise<{ deleted: number; error?: string }> {
    try {
      const { data, error } = await this.withTimeout(
        supabaseBatch.rpc('delete_user_otps', {
          p_user_id: userId,
          p_otp_type: null  // Delete all types
        }),
        10000,
        'User OTP cleanup'
      );

      if (error) {
        return { deleted: 0, error: error.message };
      }

      const deletedCount = data?.deleted || 0;

      return { deleted: deletedCount };
    } catch (error: any) {
      return { deleted: 0, error: error.message };
    }
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
