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
    const { user_id, otp_code, otp_type }: VerifyOTPRequest = await req.json()

    // Validate input
    if (!user_id || !otp_code || !otp_type) {
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

    // For development/testing, allow a universal test OTP
    const isTestOTP = otp_code === '123456';
    
    if (isTestOTP) {
      // Update user verification status for test OTP
      const updateData: any = {}
      if (otp_type === 'email') {
        updateData.tu_email_verified = true
        updateData.tu_is_verified = true
      } else if (otp_type === 'mobile') {
        updateData.tu_mobile_verified = true
        updateData.tu_is_verified = true
      }

      await supabase
        .from('tbl_users')
        .update(updateData)
        .eq('tu_id', user_id)

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

    // Check attempts limit (max 5 attempts)
    if (otpRecord.tov_attempts >= 5) {
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

    // Mark OTP as verified
    const { error: updateOTPError } = await supabase
      .from('tbl_otp_verifications')
      .update({ 
        tov_is_verified: true,
        tov_attempts: (otpRecord.tov_attempts || 0) + 1
      })
      .eq('tov_id', otpRecord.tov_id)

    if (updateOTPError) {
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

    // Update user verification status
    const updateData: any = {}
    if (otp_type === 'email') {
      updateData.tu_email_verified = true
      updateData.tu_is_verified = true
    } else if (otp_type === 'mobile') {
      updateData.tu_mobile_verified = true
      updateData.tu_is_verified = true
    }

    await supabase
      .from('tbl_users')
      .update(updateData)
      .eq('tu_id', user_id)

    // Send welcome email if this was mobile verification (final step)
    if (otp_type === 'mobile') {
      try {
        await sendWelcomeEmail(user_id, supabase)
      } catch (emailError) {
        // Don't fail the verification if welcome email fails
      }
    }

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
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Verification failed. Please try again.',
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
    return true

  } catch (error) {
    return false
  }
}
