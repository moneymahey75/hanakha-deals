import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { otpEmailTemplate, sendSmtpMail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 30 * 1000;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });

const generateOTP = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
};

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

const verifyContactBelongsToUser = async (
  supabase: ReturnType<typeof createClient>,
  userId: string,
  contactInfo: string,
  otpType: 'email' | 'mobile'
) => {
  if (otpType === 'email') {
    const { data, error } = await supabase
      .from('tbl_users')
      .select('tu_id')
      .eq('tu_id', userId)
      .eq('tu_email', contactInfo)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.tu_id);
  }

  const { data, error } = await supabase
    .from('tbl_user_profiles')
    .select('tup_user_id')
    .eq('tup_user_id', userId)
    .eq('tup_mobile', contactInfo)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.tup_user_id);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ success: false, error: 'OTP service is not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { user_id, contact_info, otp_type } = body;

    if (!user_id || !contact_info || !otp_type) {
      return jsonResponse({ success: false, error: 'user_id, contact_info, and otp_type are required' }, 400);
    }

    if (!['email', 'mobile'].includes(otp_type)) {
      return jsonResponse({ success: false, error: 'otp_type must be either "email" or "mobile"' }, 400);
    }

    const otpType = otp_type as 'email' | 'mobile';

    if (otpType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_info)) {
      return jsonResponse({ success: false, error: 'Invalid email format' }, 400);
    }

    if (otpType === 'mobile' && !/^\+\d{10,15}$/.test(contact_info)) {
      return jsonResponse({ success: false, error: 'Invalid mobile format. Should include country code (e.g., +1234567890)' }, 400);
    }

    const authenticatedUserId = await getAuthenticatedUserId(req, supabase);
    if (authenticatedUserId !== user_id) {
      return jsonResponse({ success: false, error: 'Not authorized to send this OTP' }, 403);
    }

    const contactMatchesUser = await verifyContactBelongsToUser(supabase, user_id, contact_info, otpType);
    if (!contactMatchesUser) {
      return jsonResponse({ success: false, error: 'Contact information does not match this account' }, 403);
    }

    const now = new Date();
    const { data: recentOtp, error: recentOtpError } = await supabase
      .from('tbl_otp_verifications')
      .select('tov_id, tov_created_at, tov_expires_at')
      .eq('tov_user_id', user_id)
      .eq('tov_otp_type', otpType)
      .eq('tov_is_verified', false)
      .gte('tov_expires_at', now.toISOString())
      .order('tov_created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentOtpError) throw recentOtpError;

    if (recentOtp?.tov_created_at) {
      const createdAtMs = new Date(recentOtp.tov_created_at).getTime();
      if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs < MIN_REQUEST_INTERVAL_MS) {
        return jsonResponse({
          success: true,
          message: 'OTP already sent. Please wait before requesting again.',
          expires_at: recentOtp.tov_expires_at
        });
      }
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const siteName = 'ShopClix';

    const { error: invalidateOtpError } = await supabase
      .from('tbl_otp_verifications')
      .update({ tov_is_verified: true })
      .eq('tov_user_id', user_id)
      .eq('tov_otp_type', otpType)
      .eq('tov_is_verified', false);
    if (invalidateOtpError) throw invalidateOtpError;

    const { data: insertedOtp, error: insertOtpError } = await supabase
      .from('tbl_otp_verifications')
      .insert({
        tov_user_id: user_id,
        tov_otp_code: otpCode,
        tov_otp_type: otpType,
        tov_contact_info: contact_info,
        tov_expires_at: expiresAt.toISOString(),
        tov_is_verified: false,
        tov_attempts: 0
      })
      .select('tov_id')
      .single();

    if (insertOtpError) throw insertOtpError;

    const sendResult = otpType === 'email'
      ? await sendEmailOTP(contact_info, otpCode, siteName)
      : await sendSMSOTP(contact_info, otpCode, siteName);

    if (!sendResult.success && insertedOtp?.tov_id) {
      await supabase
        .from('tbl_otp_verifications')
        .update({ tov_is_verified: true })
        .eq('tov_id', insertedOtp.tov_id);
    }

    return jsonResponse({
      success: sendResult.success,
      message: sendResult.success
        ? 'OTP sent successfully'
        : 'Failed to send OTP. Please try again.',
      expires_at: expiresAt.toISOString()
    }, sendResult.success ? 200 : 500);

  } catch {
    return jsonResponse({
      success: false,
      error: 'Failed to send OTP. Please try again.'
    }, 500);
  }
});

async function sendEmailOTP(email: string, otp: string, siteName: string) {
  try {
    const emailSubject = `Your OTP Code - ${siteName}`;
    const emailBody = otpEmailTemplate(otp);

    await sendSmtpMail({
      to: email,
      subject: emailSubject,
      html: emailBody,
      text: `Your ${siteName} verification code is ${otp}. This code expires in 10 minutes. Do not share this code with anyone.`,
      fromName: `${siteName} Security`,
    });

    return {
      success: true,
      provider: 'smtp'
    };

  } catch {
    return {
      success: false,
      error: 'Email send failed'
    };
  }
}

async function sendSMSOTP(mobile: string, otp: string, siteName: string) {
  try {
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      return {
        success: false,
        error: 'SMS provider is not configured'
      };
    }

    const message = `Your ${siteName} verification code is: ${otp}. This code expires in 10 minutes. Do not share this code with anyone.`;
    const authHeader = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          From: TWILIO_PHONE_NUMBER,
          To: mobile,
          Body: message
        }).toString()
      }
    );

    if (!response.ok) {
      return {
        success: false,
        error: 'SMS send failed'
      };
    }

    const result = await response.json();

    return {
      success: true,
      provider: 'twilio',
      messageSid: result.sid,
      status: result.status
    };

  } catch {
    return {
      success: false,
      error: 'SMS send failed'
    };
  }
}
