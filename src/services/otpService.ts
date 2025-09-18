import { apiClient } from '../lib/api';

export class OTPService {
  private static instance: OTPService;
  
  static getInstance(): OTPService {
    if (!OTPService.instance) {
      OTPService.instance = new OTPService();
    }
    return OTPService.instance;
  }

  // Send OTP via API
  async sendOTP(userId: string, contactInfo: string, otpType: 'email' | 'mobile'): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    otpId?: string;
    expiresAt?: string;
    debug_info?: any;
  }> {
    try {
      console.log('📤 Sending OTP via API:', { userId, contactInfo, otpType });

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

      const response = await apiClient.sendOTP(userId, contactInfo, otpType);
      
      if (response.success) {
        console.log('✅ OTP sent successfully via API');
        return {
          success: true,
          message: response.message,
          otpId: response.data?.otpId,
          expiresAt: response.data?.expiresAt,
          debug_info: response.data?.debugInfo
        };
      } else {
        throw new Error(response.error || 'Failed to send OTP');
      }

    } catch (error: any) {
      console.error('❌ Failed to send OTP via API:', error);
      return {
        success: false,
        error: error.message || 'Failed to send OTP'
      };
    }
  }

  // Verify OTP via API
  async verifyOTP(userId: string, otpCode: string, otpType: 'email' | 'mobile'): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    verificationComplete?: boolean;
    nextStep?: string;
  }> {
    try {
      console.log('🔍 Verifying OTP via API:', { userId, otpType, otpCode });

      // Validate inputs
      if (!userId || !otpCode || !otpType) {
        throw new Error('Missing required parameters');
      }

      if (!/^\d{6}$/.test(otpCode)) {
        throw new Error('Invalid OTP format. Must be 6 digits');
      }

      const response = await apiClient.verifyOTP(userId, otpCode, otpType);
      
      if (response.success) {
        console.log('✅ OTP verified successfully via API');
        return {
          success: true,
          message: response.message,
          verificationComplete: response.data?.verification_complete,
          nextStep: response.data?.next_step
        };
      } else {
        throw new Error(response.error || 'Verification failed');
      }

    } catch (error: any) {
      console.error('❌ OTP verification failed via API:', error);
      return {
        success: false,
        error: error.message || 'Verification failed'
      };
    }
  }
}

// Export singleton instance
export const otpService = OTPService.getInstance();