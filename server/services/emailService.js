const nodemailer = require('nodemailer');

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Send email
const sendEmail = async (to, subject, html) => {
  try {
    // For development, just log the email
    if (process.env.NODE_ENV === 'development') {
      console.log('📧 Development Email:', {
        to,
        subject,
        html: html.substring(0, 100) + '...'
      });
      return true;
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('❌ Email send error:', error);
    return false;
  }
};

// Send OTP email
const sendOTPEmail = async (email, otp, siteName = 'MLM Platform') => {
  const subject = `Your OTP Code - ${siteName}`;
  const html = `
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
  `;

  return await sendEmail(email, subject, html);
};

module.exports = {
  sendEmail,
  sendOTPEmail
};