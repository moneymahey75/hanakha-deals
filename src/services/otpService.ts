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
        console.warn('Failed to fetch test OTP settings, using cached values:', error);
        return { enabled: testOTPCache.enabled, code: testOTPCache.code };
      }

      const settingsMap = data?.reduce((acc: any, setting: any) => {
        try {
          acc[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value);
        } catch (parseError) {
          console.warn('Failed to parse test OTP setting:', setting.tss_setting_key, parseError);
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
      console.warn('Error fetching test OTP settings:', error);
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

      // Insert new OTP record (commented out for now due to DB issues)
      // const { data: otpRecord, error: otpError } = await this.withTimeout(
      //     supabaseBatch
      //         .from('tbl_otp_verifications')
      //         .insert({
      //           tov_user_id: userId,
      //           tov_otp_code: otpCode,
      //           tov_otp_type: otpType,
      //           tov_contact_info: contactInfo,
      //           tov_expires_at: expiresAt.toISOString(),
      //           tov_is_verified: false,
      //           tov_attempts: 0
      //         })
      //         .select()
      //         .single(),
      //     8000,
      //     'Database insert'
      // );

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
          console.log('Sending mobile OTP...');
          sendResult = await this.withTimeout(
              this.sendMobileOTP(userId, contactInfo, otpCode),
              10000,
              'Mobile OTP send'
          );
        }
      } catch (sendErr: any) {
        sendError = sendErr.message;
        console.warn(`${otpType} OTP send failed:`, sendError);
        // Don't throw error - OTP is cached, just log the send failure
        sendResult = false;
      }

      // Cache the OTP with sent status (even if send failed - OTP is cached for verification)
      otpCache.set(cacheKey, {
        otp: otpCode,
        expires: expiresAt.getTime(),
        attempts: 0,
        status: 'sent',
        lastSentAt: now
      });

      console.log(`OTP processed for ${otpType}: ${contactInfo}`);

      return {
        success: true,
        message: `OTP sent to ${contactInfo}`,
        //otpId: otpRecord?.tov_id,
        expiresAt: expiresAt.toISOString(),
        debug_info: {
          otp_code: otpCode,
          contact_info: contactInfo,
          otp_type: otpType,
          send_result: sendResult,
          send_error: sendError,
          note: sendResult
              ? `${otpType === 'mobile' ? 'SMS' : 'Email'} OTP sent successfully`
              : `OTP cached for verification but ${otpType === 'mobile' ? 'SMS' : 'email'} sending ${sendError ? 'failed: ' + sendError : 'simulated'}`
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

      // Check for configurable test OTP
      const testOTPSettings = await this.getTestOTPSettings();
      if (testOTPSettings.enabled && otpCode === testOTPSettings.code) {
        console.log('Test OTP verification successful');
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
        console.log('Cache OTP verification successful');
        await this.updateUserVerificationStatus(userId, otpType);
        otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
        
        // Clean up any database records for this user/type after successful cache verification
        this.cleanupOTPRecords(userId, otpType).catch(error => 
          console.warn('Failed to cleanup OTP records after cache verification:', error)
        );
        
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
        console.log('Email verification 1: ', otpRecord, findError);
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
          console.log('Email verification 2: ', verifyError);

          if (!verifyError) {
            console.log('Database OTP verification successful');
            
            // Update cache status
            if (cachedOTP) {
              otpCache.set(cacheKey, { ...cachedOTP, status: 'verified' });
            }
            console.log('Email verification 3: ', cachedOTP);
            // Delete the OTP record after successful verification
            await this.deleteOTPRecord(otpRecordId);
            console.log('Email verification 4: ', otpRecordId);
            // Also cleanup any other OTP records for this user/type
            this.cleanupOTPRecords(userId, otpType).catch(error => 
              console.warn('Failed to cleanup additional OTP records:', error)
            );
            console.log('Email verification 5: ', userId, otpType);

            return {
              success: true,
              message: `${otpType} verified successfully`,
              verificationComplete: true,
              nextStep: 'subscription_plans'
            };
          }
        }
      } catch (dbError) {
        console.warn('Database verification failed, but cache/test OTP already checked:', dbError);
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
      console.error('OTP verification error:', error);
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
        supabaseBatch
          .from('tbl_otp_verifications')
          .delete()
          .eq('tov_id', otpRecordId),
        5000,
        'OTP record deletion'
      );

      if (error) {
        console.error('Failed to delete OTP record:', error);
      } else {
        console.log('OTP record deleted successfully:', otpRecordId);
      }
    } catch (error) {
      console.error('Error deleting OTP record:', error);
    }
  }

  // Cleanup all OTP records for a user/type (for additional safety)
  private async cleanupOTPRecords(userId: string, otpType: 'email' | 'mobile'): Promise<void> {
    try {
      const { error } = await this.withTimeout(
        supabaseBatch
          .from('tbl_otp_verifications')
          .delete()
          .eq('tov_user_id', userId)
          .eq('tov_otp_type', otpType),
        5000,
        'OTP records cleanup'
      );

      if (error) {
        console.error('Failed to cleanup OTP records:', error);
      } else {
        console.log(`Cleaned up all ${otpType} OTP records for user:`, userId);
      }
    } catch (error) {
      console.error('Error cleaning up OTP records:', error);
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

    try {
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
    } catch (error) {
      console.warn('Failed to update user verification status in database:', error);
      // Don't throw error - verification can still proceed
    }
  }

  private async sendEmailOTP(userId: string, email: string, otp: string): Promise<boolean> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (!supabaseUrl) {
        console.log('Supabase URL not configured, simulating email send');
        // Add delay to simulate email service
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      }

      // Try to send via Edge Function first
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout for email

        console.log(`Sending Email OTP to ${email} via Edge Function...`);

        const response = await fetch(`${supabaseUrl}/functions/v1/send-otp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            user_id: userId,
            contact_info: email,
            otp_type: 'email'
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || `HTTP ${response.status}`;
          console.error('Email Edge function error:', errorMessage);
          throw new Error(`Failed to send email OTP: ${errorMessage}`);
        }

        const result = await response.json();
        console.log('Email OTP sent successfully via Edge Function', result);
        return true;

      } catch (edgeError: any) {
        if (edgeError.name === 'AbortError') {
          console.error('Email OTP send timeout');
          throw new Error('Email sending timed out');
        }
        
        console.warn('Edge function failed for email, trying alternative method:', edgeError.message);
        
        // Fallback to direct email service integration
        return await this.sendEmailDirect(email, otp);
      }

    } catch (error) {
      console.error('Failed to send email OTP:', error);
      return false;
    }
  }

  // Direct email sending as fallback (you can integrate your preferred email service here)
  private async sendEmailDirect(email: string, otp: string): Promise<boolean> {
    try {
      // Option 1: Resend API integration
      const resendApiKey = import.meta.env.VITE_RESEND_API_KEY;
      if (resendApiKey) {
        return await this.sendViaResend(email, otp, resendApiKey);
      }

      // Option 2: SendGrid API integration  
      const sendGridApiKey = import.meta.env.VITE_SENDGRID_API_KEY;
      if (sendGridApiKey) {
        return await this.sendViaSendGrid(email, otp, sendGridApiKey);
      }

      // Option 3: EmailJS integration (client-side)
      const emailJsConfig = {
        serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID,
        templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID,
        publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY
      };
      
      if (emailJsConfig.serviceId && emailJsConfig.templateId && emailJsConfig.publicKey) {
        return await this.sendViaEmailJS(email, otp, emailJsConfig);
      }

      // If no email service is configured, simulate for development
      console.log(`Email OTP simulation: would send ${otp} to ${email}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;

    } catch (error) {
      console.error('Failed to send email via direct method:', error);
      return false;
    }
  }

  // Resend API integration
  private async sendViaResend(email: string, otp: string, apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'noreply@yourdomain.com', // Replace with your verified domain
          to: [email],
          subject: 'Your OTP Verification Code',
          html: this.createEmailTemplate(otp, 'YourAppName') // Replace with your app name
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Resend API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('Email sent successfully via Resend:', result.id);
      return true;
    } catch (error) {
      console.error('Resend email sending failed:', error);
      return false;
    }
  }

  // SendGrid API integration
  private async sendViaSendGrid(email: string, otp: string, apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: email }],
            subject: 'Your OTP Verification Code'
          }],
          from: { email: 'noreply@yourdomain.com' }, // Replace with your verified email
          content: [{
            type: 'text/html',
            value: this.createEmailTemplate(otp, 'YourAppName') // Replace with your app name
          }]
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`SendGrid API error: ${response.status} - ${errorData}`);
      }

      console.log('Email sent successfully via SendGrid');
      return true;
    } catch (error) {
      console.error('SendGrid email sending failed:', error);
      return false;
    }
  }

  // EmailJS integration (client-side email service)
  private async sendViaEmailJS(email: string, otp: string, config: any): Promise<boolean> {
    try {
      // Note: EmailJS requires the EmailJS SDK to be loaded
      // Add this to your index.html: <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
      
      if (typeof window !== 'undefined' && (window as any).emailjs) {
        const emailjs = (window as any).emailjs;
        
        const templateParams = {
          to_email: email,
          otp_code: otp,
          app_name: 'YourAppName' // Replace with your app name
        };

        const response = await emailjs.send(
          config.serviceId,
          config.templateId,
          templateParams,
          config.publicKey
        );

        console.log('Email sent successfully via EmailJS:', response);
        return true;
      } else {
        throw new Error('EmailJS SDK not loaded');
      }
    } catch (error) {
      console.error('EmailJS sending failed:', error);
      return false;
    }
  }

  // Create HTML email template
  private createEmailTemplate(otp: string, appName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification - ${appName}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
            background-color: #f8f9fa;
          }
          .container {
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 40px 30px; 
            text-align: center; 
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
          }
          .content { 
            padding: 40px 30px; 
            text-align: center;
          }
          .otp-box { 
            background: linear-gradient(135deg, #f8f9ff 0%, #e8f2ff 100%);
            border: 2px solid #667eea; 
            padding: 30px; 
            margin: 30px 0; 
            border-radius: 12px; 
          }
          .otp-code { 
            font-size: 36px; 
            font-weight: bold; 
            color: #667eea; 
            letter-spacing: 8px; 
            margin: 15px 0;
            font-family: monospace;
          }
          .footer { 
            text-align: center; 
            margin-top: 30px; 
            color: #6c757d; 
            font-size: 14px; 
          }
          @media (max-width: 600px) {
            .content { padding: 20px; }
            .otp-code { font-size: 28px; letter-spacing: 4px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Verification</h1>
            <p>Secure your ${appName} account</p>
          </div>
          <div class="content">
            <p style="font-size: 18px; margin-bottom: 20px;">
              Use the verification code below to complete your email verification:
            </p>
            
            <div class="otp-box">
              <p style="margin: 0; font-weight: 600;">Your Verification Code:</p>
              <div class="otp-code">${otp}</div>
              <p style="margin: 0; color: #6c757d; font-size: 14px;">
                <strong>Valid for 10 minutes only</strong>
              </p>
            </div>
            
            <p style="color: #6c757d; margin-top: 30px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
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

  // Clear test OTP cache to force refresh
  clearTestOTPCache(): void {
    testOTPCache.lastFetched = 0;
    console.log('Cleared test OTP settings cache');
  }

  // Clean up expired OTP records from database (periodic maintenance)
  async cleanupExpiredOTPs(): Promise<{ deleted: number; error?: string }> {
    try {
      console.log('Starting cleanup of expired OTP records...');
      
      const { data, error } = await this.withTimeout(
        supabaseBatch
          .from('tbl_otp_verifications')
          .delete()
          .lt('tov_expires_at', new Date().toISOString())
          .select('count'),
        10000,
        'Expired OTP cleanup'
      );

      if (error) {
        console.error('Failed to cleanup expired OTPs:', error);
        return { deleted: 0, error: error.message };
      }

      const deletedCount = Array.isArray(data) ? data.length : 0;
      console.log(`Cleanup completed: ${deletedCount} expired OTP records deleted`);
      
      return { deleted: deletedCount };
    } catch (error: any) {
      console.error('Error during expired OTP cleanup:', error);
      return { deleted: 0, error: error.message };
    }
  }

  // Clean up all OTP records for a specific user (useful for user deletion)
  async cleanupUserOTPs(userId: string): Promise<{ deleted: number; error?: string }> {
    try {
      console.log('Cleaning up all OTP records for user:', userId);
      
      const { data, error } = await this.withTimeout(
        supabaseBatch
          .from('tbl_otp_verifications')
          .delete()
          .eq('tov_user_id', userId)
          .select('count'),
        10000,
        'User OTP cleanup'
      );

      if (error) {
        console.error('Failed to cleanup user OTPs:', error);
        return { deleted: 0, error: error.message };
      }

      const deletedCount = Array.isArray(data) ? data.length : 0;
      console.log(`User OTP cleanup completed: ${deletedCount} records deleted for user ${userId}`);
      
      return { deleted: deletedCount };
    } catch (error: any) {
      console.error('Error during user OTP cleanup:', error);
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