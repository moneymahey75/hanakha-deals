import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendSmtpMail, welcomeEmailTemplate } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface VerifyOTPRequest {
  user_id: string;
  otp_code: string;
  otp_type: 'email' | 'mobile';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔍 Verify OTP function called');
    
    const { user_id, otp_code, otp_type }: VerifyOTPRequest = await req.json()

    console.log('🔐 Processing OTP verification:', { 
      user_id: user_id?.substring(0, 8) + '...', 
      otp_type,
      otp_code: otp_code?.substring(0, 2) + '****'
    });

    // Validate input
    if (!user_id || !otp_code || !otp_type) {
      console.error('❌ Missing required parameters:', { user_id: !!user_id, otp_code: !!otp_code, otp_type: !!otp_type });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required parameters: user_id, otp_code, or otp_type',
          code: 'MISSING_PARAMETERS'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    if (!['email', 'mobile'].includes(otp_type)) {
      console.error('❌ Invalid OTP type:', otp_type);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid otp_type. Must be "email" or "mobile"',
          code: 'INVALID_OTP_TYPE'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    if (!/^\d{6}$/.test(otp_code)) {
      console.error('❌ Invalid OTP format:', otp_code);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid OTP format. Must be 6 digits',
          code: 'INVALID_OTP_FORMAT'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    const { createClient } = await import('npm:@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('🔍 Looking for valid OTP in database...');

    // For development/testing, allow a universal test OTP
    const isTestOTP = otp_code === '123456';
    
    if (isTestOTP) {
      console.log('🧪 Test OTP detected, proceeding with verification...');
      
      // Update user verification status for test OTP
      const updateData: any = {}
      if (otp_type === 'email') {
        updateData.tu_email_verified = true
        updateData.tu_is_verified = true
      } else if (otp_type === 'mobile') {
        updateData.tu_mobile_verified = true
        updateData.tu_is_verified = true
      }

      const { error: updateUserError } = await supabase
        .from('tbl_users')
        .update(updateData)
        .eq('tu_id', user_id)

      if (updateUserError) {
        console.warn('⚠️ Failed to update user verification status for test OTP:', updateUserError)
      } else {
        console.log('✅ User verification status updated for test OTP')
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `${otp_type} verified successfully (test mode)`,
          verification_complete: true,
          next_step: otp_type === 'mobile' ? 'subscription_plans' : 'continue_verification'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Find the most recent valid OTP record
    const { data: otpRecord, error: findError } = await supabase
      .from('tbl_otp_verifications')
      .select('*')
      .eq('tov_user_id', user_id)
      .eq('tov_otp_code', otp_code)
      .eq('tov_otp_type', otp_type)
      .eq('tov_is_verified', false)
      .gte('tov_expires_at', new Date().toISOString())
      .order('tov_created_at', { ascending: false })
      .limit(1)
      .single()

    if (findError || !otpRecord) {
      console.error('❌ OTP not found or expired:', findError?.message || 'No matching record');
      
      // Try to increment attempts for any existing unverified OTP
      try {
        const { data: existingOTPs } = await supabase
          .from('tbl_otp_verifications')
          .select('tov_id, tov_attempts')
          .eq('tov_user_id', user_id)
          .eq('tov_otp_type', otp_type)
          .eq('tov_is_verified', false)
          .order('tov_created_at', { ascending: false })
          .limit(1);

        if (existingOTPs && existingOTPs.length > 0) {
          const existingOTP = existingOTPs[0];
          await supabase
            .from('tbl_otp_verifications')
            .update({ tov_attempts: (existingOTP.tov_attempts || 0) + 1 })
            .eq('tov_id', existingOTP.tov_id);
        }
      } catch (attemptError) {
        console.warn('Failed to update attempts:', attemptError);
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid or expired OTP. Please request a new code.',
          code: 'INVALID_OTP'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    console.log('✅ Valid OTP found:', otpRecord.tov_id);

    // Check attempts limit (max 5 attempts)
    if (otpRecord.tov_attempts >= 5) {
      console.error('❌ Too many attempts for OTP:', otpRecord.tov_id)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Too many failed attempts. Please request a new OTP.',
          code: 'TOO_MANY_ATTEMPTS'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429 
        }
      )
    }

    console.log('🔄 Marking OTP as verified...');

    // Mark OTP as verified
    const { error: updateOTPError } = await supabase
      .from('tbl_otp_verifications')
      .update({ 
        tov_is_verified: true,
        tov_attempts: (otpRecord.tov_attempts || 0) + 1
      })
      .eq('tov_id', otpRecord.tov_id)

    if (updateOTPError) {
      console.error('❌ Failed to update OTP status:', updateOTPError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to verify OTP: ${updateOTPError.message}`,
          code: 'UPDATE_FAILED'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    console.log('🔄 Updating user verification status...');

    // Update user verification status
    const updateData: any = {}
    if (otp_type === 'email') {
      updateData.tu_email_verified = true
      updateData.tu_is_verified = true
    } else if (otp_type === 'mobile') {
      updateData.tu_mobile_verified = true
      updateData.tu_is_verified = true
    }

    const { error: updateUserError } = await supabase
      .from('tbl_users')
      .update(updateData)
      .eq('tu_id', user_id)

    if (updateUserError) {
      console.warn('⚠️ Failed to update user verification status:', updateUserError)
      // Don't throw error here as OTP is already verified
    } else {
      console.log('✅ User verification status updated')
    }

    // Send welcome email if this was mobile verification (final step)
    if (otp_type === 'mobile') {
      try {
        console.log('📧 Sending welcome email...');
        await sendWelcomeEmail(user_id, supabase)
      } catch (emailError) {
        console.warn('⚠️ Failed to send welcome email:', emailError)
        // Don't fail the verification if welcome email fails
      }
    }

    console.log('🎉 OTP verification completed successfully')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${otp_type} verified successfully`,
        verification_complete: true,
        next_step: otp_type === 'mobile' ? 'subscription_plans' : 'continue_verification'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    let message = "Unknown error";
    let stack = null;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack || null;
    } else if (typeof error === "string") {
      message = error;
    } else {
      try {
        message = JSON.stringify(error);
      } catch (_) {
        message = "Non-serializable error object";
      }
    }

    console.error("❌ Error verifying OTP:", { message, stack });

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: message,
        code: 'VERIFICATION_FAILED'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})

async function sendWelcomeEmail(userId: string, supabase: any) {
  try {
    console.log('📧 Preparing welcome email for user:', userId?.substring(0, 8) + '...')

    const { data: userData } = await supabase
      .from('tbl_users')
      .select(`
        tu_email,
        tbl_user_profiles (
          tup_first_name,
          tup_last_name,
          tup_username,
          tup_sponsorship_number
        )
      `)
      .eq('tu_id', userId)
      .single()

    if (!userData) {
      console.warn('⚠️ User data not found for welcome email')
      return false
    }

    const firstName = userData.tbl_user_profiles?.tup_first_name || ''
    const lastName = userData.tbl_user_profiles?.tup_last_name || ''
    const displayName = `${firstName} ${lastName}`.trim() || userData.tbl_user_profiles?.tup_username || userData.tu_email
    const sponsorshipNumber = userData.tbl_user_profiles?.tup_sponsorship_number || 'N/A'
    const emailSubject = 'Welcome to ShopClix! Your account is ready'
    await sendSmtpMail({
      to: userData.tu_email,
      subject: emailSubject,
      html: welcomeEmailTemplate(displayName, [
        { label: 'User ID', value: sponsorshipNumber },
        { label: 'Email', value: userData.tu_email },
        { label: 'Status', value: 'Verified' },
      ]),
      text: `Welcome to ShopClix, ${displayName}. Your User ID is ${sponsorshipNumber}.`,
      fromName: 'ShopClix Welcome',
    })

    console.log('✅ Welcome email sent successfully via SMTP')
    return true

  } catch (error) {
    console.error('❌ Failed to send welcome email:', error)
    return false
  }
}
