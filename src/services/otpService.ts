@@ .. @@
-import { supabase } from '../lib/supabase';
+import { supabase, supabaseBatch } from '../lib/supabase';
 import { useNotification } from '../components/ui/NotificationProvider';
 
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
 
+// Cache for recent OTP operations to reduce database calls
+const otpCache = new Map<string, { otp: string; expires: number; attempts: number }>();
+const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
+
+// Helper to clean expired cache entries
+const cleanExpiredCache = () => {
+  const now = Date.now();
+  for (const [key, value] of otpCache.entries()) {
+    if (now > value.expires) {
+      otpCache.delete(key);
+    }
+  }
+};
+
 export class OTPService {
   private static instance: OTPService;
   
   static getInstance(): OTPService {
     if (!OTPService.instance) {
       OTPService.instance = new OTPService();
     }
     return OTPService.instance;
   }
 
   // Generate 6-digit OTP
   private generateOTP(): string {
     return Math.floor(100000 + Math.random() * 900000).toString();
   }
 
+  // Get cache key for OTP operations
+  private getCacheKey(userId: string, otpType: string): string {
+    return `${userId}-${otpType}`;
+  }
+
   // Send OTP via email or mobile
   async sendOTP(userId: string, contactInfo: string, otpType: 'email' | 'mobile'): Promise<{
     success: boolean;
     message?: string;
     error?: string;
     otpId?: string;
     expiresAt?: string;
     debugInfo?: any;
   }> {
     try {
       console.log('📤 Starting OTP send process:', { userId, contactInfo, otpType });
 
       // Validate inputs
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
 
+      // Clean expired cache entries
+      cleanExpiredCache();
+
+      // Check cache first to prevent rapid successive requests
+      const cacheKey = this.getCacheKey(userId, otpType);
+      const cachedOTP = otpCache.get(cacheKey);
+      const now = Date.now();
+
+      if (cachedOTP && now < cachedOTP.expires) {
+        console.log('⚡ Using cached OTP to reduce database calls');
+        return {
+          success: true,
+          message: `OTP already sent to ${contactInfo}`,
+          debugInfo: {
+            otp_code: cachedOTP.otp,
+            cached: true,
+            expires_in: Math.ceil((cachedOTP.expires - now) / 1000)
+          }
+        };
+      }
+
       // Generate OTP
       const otpCode = this.generateOTP();
       const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
 
       console.log('🗄️ Storing OTP in database...');
 
-      // Invalidate existing OTPs for this user and type
-      await supabase
+      // Use batch client for database operations to reduce connection usage
+      // Invalidate existing OTPs for this user and type
+      await supabaseBatch
         .from('tbl_otp_verifications')
         .update({ tov_is_verified: true })
         .eq('tov_user_id', userId)
         .eq('tov_otp_type', otpType)
         .eq('tov_is_verified', false);
 
       // Insert new OTP record
-      const { data: otpRecord, error: otpError } = await supabase
+      const { data: otpRecord, error: otpError } = await supabaseBatch
         .from('tbl_otp_verifications')
         .insert({
           tov_user_id: userId,
           tov_otp_code: otpCode,
           tov_otp_type: otpType,
           tov_contact_info: contactInfo,
           tov_expires_at: expiresAt.toISOString(),
           tov_is_verified: false,
           tov_attempts: 0
         })
         .select()
         .single();
 
       if (otpError) {
         console.error('❌ Database error storing OTP:', otpError);
         throw new Error(`Failed to store OTP: ${otpError.message}`);
       }
 
       console.log('✅ OTP stored in database with ID:', otpRecord.tov_id);
 
+      // Cache the OTP to reduce future database calls
+      otpCache.set(cacheKey, {
+        otp: otpCode,
+        expires: expiresAt.getTime(),
+        attempts: 0
+      });
+
       // Send OTP based on type
       let sendResult = false;
       if (otpType === 'email') {
         sendResult = await this.sendEmailOTP(contactInfo, otpCode);
       } else {
         sendResult = await this.sendMobileOTP(contactInfo, otpCode);
       }
 
       // For development, always return success with debug info
       return {
         success: true,
         message: `OTP sent to ${contactInfo}`,
         otpId: otpRecord.tov_id,
         expiresAt: expiresAt.toISOString(),
         debugInfo: {
           otp_code: otpCode,
           contact_info: contactInfo,
           otp_type: otpType,
           send_result: sendResult,
           note: otpType === 'mobile' 
             ? 'Mobile OTP is simulated in development mode' 
             : 'Email OTP sent via configured service'
         }
       };
 
     } catch (error: any) {
       console.error('❌ Failed to send OTP:', error);
       return {
         success: false,
         error: error.message || 'Failed to send OTP'
       };
     }
   }
 
   // Verify OTP
   async verifyOTP(userId: string, otpCode: string, otpType: 'email' | 'mobile'): Promise<{
     success: boolean;
     message?: string;
     error?: string;
     verificationComplete?: boolean;
     nextStep?: string;
   }> {
     try {
       console.log('🔍 Starting OTP verification:', { userId, otpType, otpCode });
 
       // Validate inputs
       if (!userId || !otpCode || !otpType) {
         throw new Error('Missing required parameters');
       }
 
       if (!/^\d{6}$/.test(otpCode)) {
         throw new Error('Invalid OTP format. Must be 6 digits');
       }
 
+      // Clean expired cache entries
+      cleanExpiredCache();
+
+      // Check cache first for faster verification
+      const cacheKey = this.getCacheKey(userId, otpType);
+      const cachedOTP = otpCache.get(cacheKey);
+
       // Allow test OTP for development
       if (otpCode === '123456') {
         console.log('🧪 Test OTP detected, proceeding with verification...');
         
-        // Update user verification status for test OTP
-        const updateData: any = {};
+        // Use cached verification if available
+        if (cachedOTP) {
+          console.log('⚡ Using cached test OTP verification');
+          await this.updateUserVerificationStatus(userId, otpType);
+          otpCache.delete(cacheKey); // Remove from cache after use
+          return {
+            success: true,
+            message: `${otpType} verified successfully (test mode)`,
+            verificationComplete: true,
+            nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
+          };
+        }
+
+        // Update user verification status for test OTP
+        await this.updateUserVerificationStatus(userId, otpType);
+        return {
+          success: true,
+          message: `${otpType} verified successfully (test mode)`,
+          verificationComplete: true,
+          nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
+        };
+      }
+
+      // Check cache for real OTP
+      if (cachedOTP && cachedOTP.otp === otpCode) {
+        console.log('⚡ OTP verified from cache, updating database...');
+        await this.updateUserVerificationStatus(userId, otpType);
+        otpCache.delete(cacheKey); // Remove from cache after successful verification
+        return {
+          success: true,
+          message: `${otpType} verified successfully`,
+          verificationComplete: true,
+          nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
+        };
+      }
+
+      // Fallback to database verification with optimized query
+      console.log('🔍 Verifying OTP from database...');
+      const { data: otpRecord, error: findError } = await supabaseBatch
+        .from('tbl_otp_verifications')
+        .select('tov_id, tov_attempts, tov_expires_at')
+        .eq('tov_user_id', userId)
+        .eq('tov_otp_code', otpCode)
+        .eq('tov_otp_type', otpType)
+        .eq('tov_is_verified', false)
+        .gte('tov_expires_at', new Date().toISOString())
+        .order('tov_created_at', { ascending: false })
+        .limit(1)
+        .maybeSingle();
+
+      if (findError || !otpRecord) {
+        console.error('❌ OTP not found or expired:', findError?.message || 'No matching record');
+        
+        // Update cache to track failed attempts
+        if (cachedOTP) {
+          otpCache.set(cacheKey, {
+            ...cachedOTP,
+            attempts: cachedOTP.attempts + 1
+          });
+        }
+
+        return {
+          success: false,
+          error: 'Invalid or expired OTP. Please request a new code.'
+        };
+      }
+
+      // Check attempts limit
+      if (otpRecord.tov_attempts >= 5) {
+        return {
+          success: false,
+          error: 'Too many failed attempts. Please request a new OTP.'
+        };
+      }
+
+      // Mark OTP as verified and update user status in a single transaction
+      const { error: updateError } = await supabaseBatch.rpc('verify_otp_and_update_user', {
+        p_otp_id: otpRecord.tov_id,
+        p_user_id: userId,
+        p_otp_type: otpType
+      });
+
+      if (updateError) {
+        console.error('❌ Failed to verify OTP:', updateError);
+        return {
+          success: false,
+          error: 'Verification failed. Please try again.'
+        };
+      }
+
+      // Remove from cache after successful verification
+      otpCache.delete(cacheKey);
+
+      console.log('✅ OTP verification completed successfully');
+      return {
+        success: true,
+        message: `${otpType} verified successfully`,
+        verificationComplete: true,
+        nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
+      };
+
+    } catch (error: any) {
+      console.error('❌ OTP verification error:', error);
+      return {
+        success: false,
+        error: error.message || 'Verification failed'
+      };
+    }
+  }
+
+  // Helper method to update user verification status
+  private async updateUserVerificationStatus(userId: string, otpType: 'email' | 'mobile'): Promise<void> {
+    try {
+      const updateData: any = {};
       if (otpType === 'email') {
         updateData.tu_email_verified = true;
       } else if (otpType === 'mobile') {
         updateData.tu_mobile_verified = true;
         updateData.tu_is_verified = true;
       }
 
-      const { error: updateUserError } = await supabase
+      const { error: updateUserError } = await supabaseBatch
         .from('tbl_users')
         .update(updateData)
         .eq('tu_id', userId);
 
       if (updateUserError) {
-        console.warn('⚠️ Failed to update user verification status for test OTP:', updateUserError);
+        console.warn('⚠️ Failed to update user verification status:', updateUserError);
+        throw updateUserError;
       } else {
-        console.log('✅ User verification status updated for test OTP');
+        console.log('✅ User verification status updated');
       }
-
-      return {
-        success: true,
-        message: `${otpType} verified successfully (test mode)`,
-        verificationComplete: true,
-        nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
-      };
-    }
-
-    // Find the most recent valid OTP record
-    const { data: otpRecord, error: findError } = await supabase
-      .from('tbl_otp_verifications')
-      .select('*')
-      .eq('tov_user_id', userId)
-      .eq('tov_otp_code', otpCode)
-      .eq('tov_otp_type', otpType)
-      .eq('tov_is_verified', false)
-      .gte('tov_expires_at', new Date().toISOString())
-      .order('tov_created_at', { ascending: false })
-      .limit(1)
-      .maybeSingle();
-
-    if (findError || !otpRecord) {
-      console.error('❌ OTP not found or expired:', findError?.message || 'No matching record');
-      return {
-        success: false,
-        error: 'Invalid or expired OTP. Please request a new code.'
-      };
-    }
-
-    // Check attempts limit
-    if (otpRecord.tov_attempts >= 5) {
-      return {
-        success: false,
-        error: 'Too many failed attempts. Please request a new OTP.'
-      };
-    }
-
-    console.log('✅ Valid OTP found, marking as verified...');
-
-    // Mark OTP as verified
-    const { error: updateOTPError } = await supabase
-      .from('tbl_otp_verifications')
-      .update({ 
-        tov_is_verified: true,
-        tov_attempts: (otpRecord.tov_attempts || 0) + 1
-      })
-      .eq('tov_id', otpRecord.tov_id);
-
-    if (updateOTPError) {
-      console.error('❌ Failed to update OTP status:', updateOTPError);
-      throw new Error('Failed to verify OTP');
-    }
-
-    // Update user verification status
-    const updateData: any = {};
-    if (otpType === 'email') {
-      updateData.tu_email_verified = true;
-    } else if (otpType === 'mobile') {
-      updateData.tu_mobile_verified = true;
-      updateData.tu_is_verified = true;
-    }
-
-    const { error: updateUserError } = await supabase
-      .from('tbl_users')
-      .update(updateData)
-      .eq('tu_id', userId);
-
-    if (updateUserError) {
-      console.warn('⚠️ Failed to update user verification status:', updateUserError);
-    }
-
-    console.log('✅ OTP verification completed successfully');
-    return {
-      success: true,
-      message: `${otpType} verified successfully`,
-      verificationComplete: true,
-      nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
-    };
-
-  } catch (error: any) {
-    console.error('❌ OTP verification error:', error);
-    return {
-      success: false,
-      error: error.message || 'Verification failed'
-    };
+    } catch (error) {
+      console.error('❌ Failed to update user verification status:', error);
+      throw error;
     }
   }