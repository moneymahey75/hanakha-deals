const twilio = require('twilio');

// Create Twilio client
const createTwilioClient = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('⚠️ Twilio credentials not configured');
    return null;
  }
  
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
};

// Send SMS
const sendSMS = async (to, body) => {
  try {
    // For development, just log the SMS
    if (process.env.NODE_ENV === 'development') {
      console.log('📱 Development SMS:', {
        to,
        body,
        note: 'SMS would be sent via Twilio in production'
      });
      return true;
    }

    const client = createTwilioClient();
    if (!client) {
      console.warn('⚠️ Twilio not configured, simulating SMS send');
      return true;
    }

    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to
    });

    console.log('✅ SMS sent successfully:', message.sid);
    return true;
  } catch (error) {
    console.error('❌ SMS send error:', error);
    return false;
  }
};

// Send OTP SMS
const sendOTPSMS = async (mobile, otp, siteName = 'MLM Platform') => {
  const message = `Your ${siteName} verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;
  return await sendSMS(mobile, message);
};

module.exports = {
  sendSMS,
  sendOTPSMS
};