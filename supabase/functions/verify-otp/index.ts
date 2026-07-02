import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendSmtpMail, welcomeEmailTemplate } from '../_shared/email.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const getAuthenticatedUserId = async (
  req: Request,
  supabase: ReturnType<typeof createClient>
) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
};

const parseSettingValue = (value: unknown) => {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getTestOTPSettings = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from('tbl_system_settings')
    .select('tss_setting_key, tss_setting_value')
    .in('tss_setting_key', ['test_otp_enabled', 'test_otp_code']);

  if (error) {
    return { enabled: false, code: null };
  }

  const settings = new Map((data || []).map((row) => [
    row.tss_setting_key,
    parseSettingValue(row.tss_setting_value),
  ]));
  const enabledRaw = settings.get('test_otp_enabled');
  const enabledValue = String(enabledRaw || '').toLowerCase();
  const code = String(settings.get('test_otp_code') || '');

  return {
    enabled: enabledRaw === true || ['true', '1', 'yes', 'enabled'].includes(enabledValue),
    code: /^\d{6}$/.test(code) ? code : null,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405);
    }

    const { user_id, otp_code, otp_type }: VerifyOTPRequest = await req.json()

    if (!user_id || !otp_code || !otp_type) {
      return jsonResponse({
        success: false,
        error: 'Missing required parameters: user_id, otp_code, or otp_type',
        code: 'MISSING_PARAMETERS'
      }, 400);
    }

    if (!['email', 'mobile'].includes(otp_type)) {
      return jsonResponse({
        success: false,
        error: 'Invalid otp_type. Must be "email" or "mobile"',
        code: 'INVALID_OTP_TYPE'
      }, 400);
    }

    if (!/^\d{6}$/.test(otp_code)) {
      return jsonResponse({
        success: false,
        error: 'Invalid OTP format. Must be 6 digits',
        code: 'INVALID_OTP_FORMAT'
      }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'OTP service is not configured', code: 'SERVICE_NOT_CONFIGURED' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const authenticatedUserId = await getAuthenticatedUserId(req, supabase);

    if (authenticatedUserId !== user_id) {
      return jsonResponse({ success: false, error: 'Not authorized to verify this OTP', code: 'UNAUTHORIZED' }, 403);
    }

    const testOTPSettings = await getTestOTPSettings(supabase);
    const isTestOTP = testOTPSettings.enabled && testOTPSettings.code === otp_code;

    if (isTestOTP) {
      const updateData: any = {}
      if (otp_type === 'email') {
        updateData.tu_email_verified = true
        updateData.tu_is_verified = true
      } else if (otp_type === 'mobile') {
        updateData.tu_mobile_verified = true
        updateData.tu_is_verified = true
      }

      const { error: testUpdateError } = await supabase
        .from('tbl_users')
        .update(updateData)
        .eq('tu_id', user_id)

      if (testUpdateError) {
        return jsonResponse({
          success: false,
          error: 'Unable to verify OTP. Please try again.',
          code: 'UPDATE_FAILED'
        }, 500);
      }

      return jsonResponse({
        success: true,
        message: `${otp_type} verified successfully`,
        verification_complete: true,
        next_step: otp_type === 'mobile' ? 'subscription_plans' : 'continue_verification'
      });
    }

    const { data: otpRecord, error: findError } = await supabase
      .from('tbl_otp_verifications')
      .select('tov_id, tov_attempts')
      .eq('tov_user_id', user_id)
      .eq('tov_otp_code', otp_code)
      .eq('tov_otp_type', otp_type)
      .eq('tov_is_verified', false)
      .gte('tov_expires_at', new Date().toISOString())
      .order('tov_created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findError || !otpRecord) {
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
      } catch {
      }

      return jsonResponse({
        success: false,
        error: 'Invalid or expired OTP. Please request a new code.',
        code: 'INVALID_OTP'
      }, 400)
    }

    if (otpRecord.tov_attempts >= 5) {
      return jsonResponse({
        success: false,
        error: 'Too many failed attempts. Please request a new OTP.',
        code: 'TOO_MANY_ATTEMPTS'
      }, 429)
    }

    const { error: updateOTPError } = await supabase
      .from('tbl_otp_verifications')
      .update({
        tov_is_verified: true,
        tov_attempts: (otpRecord.tov_attempts || 0) + 1
      })
      .eq('tov_id', otpRecord.tov_id)

    if (updateOTPError) {
      return jsonResponse({
        success: false,
        error: 'Unable to verify OTP. Please try again.',
        code: 'UPDATE_FAILED'
      }, 500);
    }

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
      return jsonResponse({
        success: false,
        error: 'Unable to update verification status. Please try again.',
        code: 'USER_UPDATE_FAILED'
      }, 500);
    }

    if (otp_type === 'mobile') {
      try {
        await sendWelcomeEmail(user_id, supabase)
      } catch {
      }
    }

    return jsonResponse({
      success: true,
      message: `${otp_type} verified successfully`,
      verification_complete: true,
      next_step: otp_type === 'mobile' ? 'subscription_plans' : 'continue_verification'
    })

  } catch {
    return jsonResponse({
      success: false,
      error: 'Verification failed. Please try again.',
      code: 'VERIFICATION_FAILED'
    }, 400)
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

  } catch {
    return false
  }
}
