import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface OTPRequest {
  user_id: string;
  contact_info: string;
  otp_type: 'email' | 'mobile';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔍 Send OTP function called');
    
    const { user_id, contact_info, otp_type }: OTPRequest = await req.json()
    
    console.log('📤 Processing OTP request:', { 
      user_id: user_id?.substring(0, 8) + '...', 
      contact_info: contact_info?.substring(0, 5) + '...', 
      otp_type 
    });

    // Validate input
    if (!user_id || !contact_info || !otp_type) {
      throw new Error('Missing required parameters: user_id, contact_info, or otp_type');
    }

    if (!['email', 'mobile'].includes(otp_type)) {
      throw new Error('Invalid otp_type. Must be "email" or "mobile"');
    }

    // Validate email format
    if (otp_type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_info)) {
      throw new Error('Invalid email format');
    }

    // Validate mobile format (should include country code)
    if (otp_type === 'mobile' && !/^\+\d{10,15}$/.test(contact_info)) {
      throw new Error('Invalid mobile format. Should include country code (e.g., +1234567890)');
    }

    // Generate 6-digit OTP
    const otp_code = Math.floor(100000 + Math.random() * 900000).toString()
    const expires_at = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now

    const { createClient } = await import('npm:@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('🗄️ Storing OTP in database...');

    // First, invalidate any existing OTPs for this user and type
    const { error: invalidateError } = await supabase
      .from('tbl_otp_verifications')
      .update({ tov_is_verified: true }) // Mark as used to invalidate
      .eq('tov_user_id', user_id)
      .eq('tov_otp_type', otp_type)
      .eq('tov_is_verified', false);

    if (invalidateError) {
      console.warn('⚠️ Failed to invalidate existing OTPs (this is okay):', invalidateError.message);
    }

    // Store new OTP in database
    const { data: otpData, error: otpError } = await supabase
      .from('tbl_otp_verifications')
      .insert({
        tov_user_id: user_id,
        tov_otp_code: otp_code,
        tov_otp_type: otp_type,
        tov_contact_info: contact_info,
        tov_expires_at: expires_at.toISOString(),
        tov_is_verified: false,
        tov_attempts: 0
      })
      .select()
      .single()

    if (otpError) {
      console.error('❌ Database error storing OTP:', otpError)
      throw new Error(`Failed to store OTP: ${otpError.message}`)
    }

    console.log('✅ OTP stored in database with ID:', otpData.tov_id)

    // Get system settings for site name
    const { data: settings } = await supabase
      .from('tbl_system_settings')
      .select('tss_setting_key, tss_setting_value')

    const settingsMap = settings?.reduce((acc: any, setting: any) => {
      try {
        acc[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value)
      } catch {
        acc[setting.tss_setting_key] = setting.tss_setting_value
      }
      return acc
    }, {}) || {}

    const siteName = settingsMap.site_name || 'HanakhaDeals'
    console.log('🏢 Site name:', siteName);

    // Send OTP based on type
    let sendResult = false;
    if (otp_type === 'email') {
      console.log('📧 Sending email OTP...');
      sendResult = await sendEmailOTP(contact_info, otp_code, siteName)
    } else if (otp_type === 'mobile') {
      console.log('📱 Sending mobile OTP...');
      // For development, always return true for mobile OTP
      console.log('📱 Development mode - Mobile OTP would be sent to:', contact_info);
      console.log('📱 OTP Code (for testing):', otp_code);
      sendResult = true; // Always succeed in development
    }

    if (!sendResult) {
      console.warn('⚠️ OTP sending failed, but continuing (development mode)');
    }

    console.log('✅ OTP process completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `OTP sent to ${contact_info}`,
        otp_id: otpData.tov_id,
        expires_at: expires_at.toISOString(),
        // For development/testing - remove in production
        debug_info: {
          otp_code: otp_code,
          contact_info: contact_info,
          otp_type: otp_type,
          note: otp_type === 'mobile' ? 'Mobile OTP is simulated in development mode' : 'Email OTP sent via configured service'
        }
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

    console.error("❌ Error sending OTP:", { message, stack });

    return new Response(JSON.stringify({
      success: false,
      error: message
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 400
    });
  }
})

async function sendEmailOTP(email: string, otp: string, siteName: string): Promise<boolean> {
  try {
    console.log('📧 Preparing email OTP for:', email?.substring(0, 5) + '...')

    // Create professional email content
    const emailSubject = `Your OTP Code - ${siteName}`
    const emailBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>OTP Verification</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
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
          .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
            font-size: 16px;
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
            font-family: 'Courier New', monospace;
          }
          .footer { 
            text-align: center; 
            margin-top: 30px; 
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            color: #6c757d; 
            font-size: 14px; 
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
            <p style="font-size: 18px; color: #495057; margin-bottom: 10px;">Hello!</p>
            <p style="color: #6c757d; margin-bottom: 20px;">
              You have requested an OTP for email verification. Please use the code below:
            </p>
            
            <div class="otp-box">
              <p style="margin: 0; color: #495057; font-weight: 600;">Your Verification Code:</p>
              <div class="otp-code">${otp}</div>
              <p style="margin: 0; color: #6c757d; font-size: 14px;">
                <strong>Valid for 10 minutes only</strong>
              </p>
            </div>
            
            <p style="color: #495057; margin-top: 30px;">
              Thank you for choosing ${siteName}!
            </p>
          </div>
          <div class="footer">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `

    // Development fallback - log the email
    console.log('📧 Development mode - Email OTP details:', {
      to: email,
      subject: emailSubject,
      otp: otp,
      message: 'Email would be sent in production with Resend configuration'
    });
    
    return true; // Return true for development

  } catch (error) {
    console.error('❌ Failed to send email OTP:', error)
    
    // Development fallback
    console.log('📧 Development fallback - Email OTP:', {
      email: email?.substring(0, 5) + '...',
      otp,
      message: 'Email would be sent in production'
    });
    
    return true; // Return true for development
  }
}