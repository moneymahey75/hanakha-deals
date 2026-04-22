import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

    const response: any = {
      success: sendResult.success,
      message: sendResult.success
        ? `OTP sent to ${contact_info}`
        : `Failed to send OTP: ${sendResult.error}`,
      expires_at: expires_at.toISOString()
    };

    if (sendResult.success) {
      response.debug_info = {
        otp_code: otp_code,
        contact_info: contact_info,
        otp_type: otp_type,
        provider: sendResult.provider || 'unknown',
        message_id: sendResult.messageId || sendResult.messageSid,
        note: `${otp_type} OTP sent successfully`
      };
    } else {
      response.error_details = {
        provider_error: sendResult.error,
        contact_info: contact_info,
        otp_type: otp_type
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
    console.error('Send OTP error:', error);
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
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return {
        success: false,
        error: 'Email service not configured. Please add RESEND_API_KEY secret.'
      };
    }

    const emailSubject = `Your OTP Code - ${siteName}`;
    const emailBody = createEmailTemplate(otp, siteName);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${siteName} <noreply@shopclix.live>`,
        to: [email],
        subject: emailSubject,
        html: emailBody
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', errorText);
      return {
        success: false,
        error: `Resend API error: ${response.status} - ${errorText}`
      };
    }

    const result = await response.json();
    console.log('Email sent successfully via Resend:', result.id);

    return {
      success: true,
      provider: 'resend',
      messageId: result.id
    };

  } catch (error) {
    console.error('Failed to send email OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Email send failed'
    };
  }
}

async function sendSMSOTP(mobile: string, otp: string, siteName: string) {
  try {
    console.log('Starting SMS send process...');

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');

    console.log('Checking Twilio configuration...');
    console.log('TWILIO_ACCOUNT_SID:', TWILIO_ACCOUNT_SID ? `Set (${TWILIO_ACCOUNT_SID.substring(0, 10)}...)` : 'NOT SET');
    console.log('TWILIO_AUTH_TOKEN:', TWILIO_AUTH_TOKEN ? 'Set (hidden)' : 'NOT SET');
    console.log('TWILIO_PHONE_NUMBER:', TWILIO_PHONE_NUMBER || 'NOT SET');

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      const missingVars = [];
      if (!TWILIO_ACCOUNT_SID) missingVars.push('TWILIO_ACCOUNT_SID');
      if (!TWILIO_AUTH_TOKEN) missingVars.push('TWILIO_AUTH_TOKEN');
      if (!TWILIO_PHONE_NUMBER) missingVars.push('TWILIO_PHONE_NUMBER');

      const errorMsg = `Twilio not configured. Missing: ${missingVars.join(', ')}`;
      console.error(errorMsg);

      return {
        success: false,
        error: errorMsg
      };
    }

    const message = `Your ${siteName} verification code is: ${otp}. This code expires in 10 minutes. Do not share this code with anyone.`;

    console.log(`Sending SMS to ${mobile}...`);
    console.log(`Message: ${message}`);
    console.log(`From: ${TWILIO_PHONE_NUMBER}`);

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

    console.log('Twilio response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twilio API error response:', errorText);

      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = errorJson.message || errorText;
      } catch (e) {
        console.log('Could not parse Twilio error as JSON');
      }

      return {
        success: false,
        error: `Twilio API error (${response.status}): ${errorDetails}`
      };
    }

    const result = await response.json();
    console.log('SMS sent successfully via Twilio');
    console.log('Message SID:', result.sid);
    console.log('Status:', result.status);

    return {
      success: true,
      provider: 'twilio',
      messageSid: result.sid,
      status: result.status
    };

  } catch (error) {
    console.error('Failed to send SMS OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SMS send failed'
    };
  }
}

function createEmailTemplate(otp: string, siteName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - ${siteName}</title>
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
          <p>Secure your ${siteName} account</p>
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
          <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
