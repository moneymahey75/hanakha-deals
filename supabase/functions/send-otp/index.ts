import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
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
    const { user_id, contact_info, otp_type } = body;
    // Input validation
    if (!user_id || !contact_info || !otp_type) {
      return new Response(JSON.stringify({
        error: 'user_id, contact_info, and otp_type are required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (![
      'email',
      'mobile'
    ].includes(otp_type)) {
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
    // Validate contact info format
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
    // Generate 6-digit OTP
    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    // Initialize Supabase client
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Store OTP in database
    const { data: otpData, error: otpError } = await supabase.from('tbl_otp_verifications').insert({
      tov_user_id: user_id,
      tov_otp_code: otp_code,
      tov_otp_type: otp_type,
      tov_contact_info: contact_info,
      tov_expires_at: expires_at.toISOString(),
      tov_is_verified: false,
      tov_attempts: 0
    }).select().single();
    if (otpError) {
      console.error('Database error:', otpError);
      return new Response(JSON.stringify({
        error: 'Failed to store OTP in database',
        details: otpError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get system settings for site name
    const { data: settings } = await supabase.from('tbl_system_settings').select('tss_setting_key, tss_setting_value');
    const settingsMap = settings?.reduce((acc, setting)=>{
      acc[setting.tss_setting_key] = setting.tss_setting_value;
      return acc;
    }, {}) || {};
    const siteName = settingsMap.site_name?.replace(/"/g, '') || 'DealSphere';
    // Send OTP based on type
    let sendResult;
    if (otp_type === 'email') {
      sendResult = await sendEmailOTP(contact_info, otp_code, siteName);
    } else {
      sendResult = await sendSMSOTP(contact_info, otp_code, siteName);
    }
    if (!sendResult.success) {
      console.error(`Failed to send ${otp_type} OTP:`, sendResult.error);
      // Don't fail the entire request - OTP is stored, just log the send failure
    }
    // Return success response
    const response = {
      success: true,
      message: `OTP sent to ${contact_info}`,
      otp_id: otpData.tov_id,
      expires_at: expires_at.toISOString()
    };
    // Add debug info in development
    if (Deno.env.get('NODE_ENV') === 'development' || !Deno.env.get('NODE_ENV')) {
      response.debug_info = {
        otp_code: otp_code,
        contact_info: contact_info,
        otp_type: otp_type,
        send_result: sendResult.success,
        note: `${otp_type} OTP ${sendResult.success ? 'sent successfully' : 'simulated'}`
      };
    }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(JSON.stringify({
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
async function sendEmailOTP(email, otp, siteName) {
  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.log('📧 Resend not configured, simulating email send');
      return {
        success: true,
        messageId: 'sim_' + Date.now()
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
        from: `${siteName} <noreply@${siteName.toLowerCase().replace(/\s+/g, '')}.com>`,
        to: [
          email
        ],
        subject: emailSubject,
        html: emailBody
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', errorText);
      return {
        success: false,
        error: `Resend API error: ${response.status}`
      };
    }
    const result = await response.json();
    console.log('✅ Email sent successfully via Resend');
    return {
      success: true,
      messageId: result.id
    };
  } catch (error) {
    console.error('❌ Failed to send email OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Email send failed'
    };
  }
}
async function sendSMSOTP(mobile, otp, siteName) {
  try {
    console.log('📱 Twilio variables started');
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER');
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.log('📱 Twilio not configured, simulating SMS send');
      return {
        success: true,
        messageSid: 'sim_' + Date.now()
      };
    }
    const message = `Your ${siteName} verification code is: ${otp}. This code expires in 10 minutes. Do not share this code with anyone.`;
    const authHeader = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: TWILIO_PHONE_NUMBER,
        To: mobile,
        Body: message
      })
    });
    console.log('Twilio response', response);
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twilio API error:', errorText);
      return {
        success: false,
        error: `Twilio API error: ${response.status}`
      };
    }
    const result = await response.json();
    console.log('✅ SMS sent successfully via Twilio');
    return {
      success: true,
      messageSid: result.sid
    };
  } catch (error) {
    console.error('❌ Failed to send SMS OTP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SMS send failed'
    };
  }
}
function createEmailTemplate(otp, siteName) {
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
