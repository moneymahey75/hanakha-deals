import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const SITE_NAME = 'ShopClix';
const OTP_TTL_MS = 10 * 60 * 1000;
const MIN_RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const normalizeMobile = (value: string) => {
  const compact = String(value || '').replace(/[\s()-]/g, '');
  if (/^\+\d{10,15}$/.test(compact)) return compact;
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;
  if (/^\d{11,15}$/.test(compact)) return `+${compact}`;
  return compact;
};

async function sendSMSOTP(mobile: string, otp: string) {
  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    return {
      success: false,
      error: 'SMS service is not configured.',
    };
  }

  const authHeader = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const message = `Your ${SITE_NAME} password reset OTP is: ${otp}. This code expires in 10 minutes. Do not share this code with anyone.`;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: mobile,
        Body: message,
      }).toString(),
    },
  );

  if (!response.ok) {
    let messageText = await response.text();
    try {
      messageText = JSON.parse(messageText)?.message || messageText;
    } catch {
      // keep raw Twilio error text
    }
    return {
      success: false,
      error: `SMS failed: ${messageText}`,
    };
  }

  const result = await response.json();
  return {
    success: true,
    messageSid: result.sid,
  };
}

async function findCustomerBySponsorAndMobile(
  supabase: ReturnType<typeof createClient>,
  sponsorshipNumber: string,
  mobile: string,
) {
  const { data: profile, error: profileError } = await supabase
    .from('tbl_user_profiles')
    .select('tup_user_id, tup_mobile, tup_sponsorship_number')
    .eq('tup_sponsorship_number', sponsorshipNumber)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile || normalizeMobile(profile.tup_mobile || '') !== mobile) {
    return null;
  }

  const { data: user, error: userError } = await supabase
    .from('tbl_users')
    .select('tu_id, tu_email, tu_user_type, tu_is_active')
    .eq('tu_id', profile.tup_user_id)
    .maybeSingle();

  if (userError) throw userError;
  if (!user || user.tu_user_type !== 'customer' || user.tu_is_active === false) {
    return null;
  }

  return {
    userId: profile.tup_user_id,
    mobile,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const action = String(body.action || '');
    const sponsorshipNumber = String(body.sponsorshipNumber || '').trim();
    const mobile = normalizeMobile(String(body.mobile || ''));

    if (!sponsorshipNumber || !/^\+\d{10,15}$/.test(mobile)) {
      return jsonResponse({
        success: false,
        error: 'Enter a valid Sponsor ID and mobile number with country code.',
      });
    }

    const account = await findCustomerBySponsorAndMobile(supabase, sponsorshipNumber, mobile);
    if (!account) {
      return jsonResponse({
        success: false,
        error: 'No customer account matched this Sponsor ID and mobile number.',
      });
    }

    if (action === 'request_reset') {
      const { data: recentOtp } = await supabase
        .from('tbl_otp_verifications')
        .select('tov_created_at')
        .eq('tov_user_id', account.userId)
        .eq('tov_otp_type', 'mobile')
        .eq('tov_contact_info', account.mobile)
        .eq('tov_is_verified', false)
        .gte('tov_expires_at', new Date().toISOString())
        .order('tov_created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentOtp?.tov_created_at) {
        const elapsed = Date.now() - new Date(recentOtp.tov_created_at).getTime();
        if (elapsed < MIN_RESEND_MS) {
          return jsonResponse({
            success: false,
            error: `OTP already sent. Please wait ${Math.ceil((MIN_RESEND_MS - elapsed) / 1000)} seconds before requesting again.`,
          });
        }
      }

      await supabase
        .from('tbl_otp_verifications')
        .update({ tov_is_verified: true, tov_updated_at: new Date().toISOString() })
        .eq('tov_user_id', account.userId)
        .eq('tov_otp_type', 'mobile')
        .eq('tov_is_verified', false);

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
      const { data: otpRecord, error: insertError } = await supabase
        .from('tbl_otp_verifications')
        .insert({
          tov_user_id: account.userId,
          tov_otp_code: otp,
          tov_otp_type: 'mobile',
          tov_contact_info: account.mobile,
          tov_expires_at: expiresAt,
          tov_is_verified: false,
          tov_attempts: 0,
        })
        .select('tov_id')
        .single();

      if (insertError) throw insertError;

      const smsResult = await sendSMSOTP(account.mobile, otp);
      if (!smsResult.success) {
        await supabase
          .from('tbl_otp_verifications')
          .update({ tov_is_verified: true, tov_updated_at: new Date().toISOString() })
          .eq('tov_id', otpRecord.tov_id);

        return jsonResponse({ success: false, error: smsResult.error });
      }

      return jsonResponse({
        success: true,
        message: `OTP sent to ${account.mobile.replace(/(.{3}).*(.{4})/, '$1***$2')}`,
        expiresAt,
      });
    }

    if (action === 'reset_password') {
      const otpCode = String(body.otp || '').trim();
      const newPassword = String(body.newPassword || '');

      if (!/^\d{6}$/.test(otpCode)) {
        return jsonResponse({ success: false, error: 'Enter the 6-digit OTP.' });
      }

      if (newPassword.length < 8) {
        return jsonResponse({ success: false, error: 'Password must be at least 8 characters long.' });
      }

      const { data: otpRecord, error: otpError } = await supabase
        .from('tbl_otp_verifications')
        .select('tov_id, tov_attempts')
        .eq('tov_user_id', account.userId)
        .eq('tov_otp_type', 'mobile')
        .eq('tov_contact_info', account.mobile)
        .eq('tov_otp_code', otpCode)
        .eq('tov_is_verified', false)
        .gte('tov_expires_at', new Date().toISOString())
        .order('tov_created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpError) throw otpError;

      if (!otpRecord) {
        const { data: latestOtp } = await supabase
          .from('tbl_otp_verifications')
          .select('tov_id, tov_attempts')
          .eq('tov_user_id', account.userId)
          .eq('tov_otp_type', 'mobile')
          .eq('tov_contact_info', account.mobile)
          .eq('tov_is_verified', false)
          .order('tov_created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestOtp) {
          await supabase
            .from('tbl_otp_verifications')
            .update({ tov_attempts: (latestOtp.tov_attempts || 0) + 1 })
            .eq('tov_id', latestOtp.tov_id);
        }

        return jsonResponse({ success: false, error: 'Invalid or expired OTP. Please request a new code.' });
      }

      if ((otpRecord.tov_attempts || 0) >= MAX_ATTEMPTS) {
        return jsonResponse({ success: false, error: 'Too many failed attempts. Please request a new OTP.' });
      }

      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(account.userId, {
        password: newPassword,
      });

      if (updateAuthError) throw updateAuthError;

      await supabase
        .from('tbl_otp_verifications')
        .update({
          tov_is_verified: true,
          tov_attempts: (otpRecord.tov_attempts || 0) + 1,
          tov_updated_at: new Date().toISOString(),
        })
        .eq('tov_id', otpRecord.tov_id);

      return jsonResponse({
        success: true,
        message: 'Password reset successfully.',
      });
    }

    return jsonResponse({ success: false, error: 'Invalid action.' });
  } catch (error: unknown) {
    console.error('Password reset mobile error:', error);
    const message = error instanceof Error ? error.message : 'Failed to reset password.';
    return jsonResponse({ success: false, error: message }, 500);
  }
});
