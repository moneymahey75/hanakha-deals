import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { otpEmailTemplate, sendSmtpMail } from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  try {
    const body = await req.json();
    const { user_id, contact_info, otp_type, otp_code } = body;

    if (!user_id || !contact_info || !otp_type || !otp_code) {
      return new Response(JSON.stringify({
        error: 'user_id, contact_info, otp_type, and otp_code are required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    if (!['email', 'mobile'].includes(otp_type)) {
      return new Response(JSON.stringify({
        error: 'otp_type must be either "email" or "mobile"'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    if (otp_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_info)) {
      return new Response(JSON.stringify({
        error: 'Invalid email format'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    if (otp_type === 'mobile' && !/^\+\d{10,15}$/.test(contact_info)) {
      return new Response(JSON.stringify({
        error: 'Invalid mobile format. Should include country code (e.g., +1234567890)'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp_code)) {
      return new Response(JSON.stringify({
        error: 'Invalid OTP format. Must be 6 digits'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const expires_at = new Date(Date.now() + 10 * 60 * 1000);
    const siteName = 'ShopClix';

    let sendResult;
    if (otp_type === 'email') {
      sendResult = await sendEmailOTP(contact_info, otp_code, siteName);
    } else {
      sendResult = await sendSMSOTP(contact_info, otp_code, siteName);
    }

    const response: {
      success: boolean;
      message: string;
      expires_at: string;
      error_details?: Record<string, unknown>;
    } = {
      success: sendResult.success,
      message: sendResult.success
        ? `OTP sent to ${contact_info}`
        : 'Failed to send OTP. Please try again.',
      expires_at: expires_at.toISOString()
    };

    if (!sendResult.success) {
      response.error_details = {
        provider_error: 'OTP delivery failed'
      };
    }

    return new Response(JSON.stringify(response), {
      status: sendResult.success ? 200 : 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
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

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Email send failed'
    };
  }
}

async function sendSMSOTP(mobile: string, otp: string, siteName: string) {
  try {
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      const missingVars = [];
      if (!TWILIO_ACCOUNT_SID) missingVars.push('TWILIO_ACCOUNT_SID');
      if (!TWILIO_AUTH_TOKEN) missingVars.push('TWILIO_AUTH_TOKEN');
      if (!TWILIO_PHONE_NUMBER) missingVars.push('TWILIO_PHONE_NUMBER');

      const errorMsg = `Twilio not configured. Missing: ${missingVars.join(', ')}`;

      return {
        success: false,
        error: errorMsg
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
      const errorText = await response.text();

      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.message || errorText;
      } catch {
        // Keep raw provider parsing failures out of logs and client responses.
      }

      return {
        success: false,
        error: `Twilio API error (${response.status}): ${errorDetails}`
      };
    }

    const result = await response.json();

    return {
      success: true,
      provider: 'twilio',
      messageSid: result.sid,
      status: result.status
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SMS send failed'
    };
  }
}
