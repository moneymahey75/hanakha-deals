const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { sendEmail } = require('../services/emailService');
const { sendSMS } = require('../services/smsService');
const router = express.Router();

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP
router.post('/send', [
  body('userId').isUUID(),
  body('contactInfo').trim().isLength({ min: 1 }),
  body('otpType').isIn(['email', 'mobile'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId, contactInfo, otpType } = req.body;

    // Validate contact info format
    if (otpType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactInfo)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    if (otpType === 'mobile' && !/^\+\d{10,15}$/.test(contactInfo)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid mobile format. Should include country code'
      });
    }

    // Check if user exists
    const users = await executeQuery(
      'SELECT tu_id FROM tbl_users WHERE tu_id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate existing OTPs
    await executeQuery(
      'UPDATE tbl_otp_verifications SET tov_is_verified = true WHERE tov_user_id = ? AND tov_otp_type = ? AND tov_is_verified = false',
      [userId, otpType]
    );

    // Store new OTP
    const otpId = require('uuid').v4();
    await executeQuery(
      `INSERT INTO tbl_otp_verifications (tov_id, tov_user_id, tov_otp_code, tov_otp_type, tov_contact_info, tov_is_verified, tov_expires_at, tov_attempts, tov_created_at) 
       VALUES (?, ?, ?, ?, ?, false, ?, 0, NOW())`,
      [otpId, userId, otpCode, otpType, contactInfo, expiresAt]
    );

    // Send OTP
    let sendResult = false;
    if (otpType === 'email') {
      sendResult = await sendEmail(contactInfo, 'Your OTP Code', `Your verification code is: ${otpCode}`);
    } else {
      sendResult = await sendSMS(contactInfo, `Your verification code is: ${otpCode}`);
    }

    res.json({
      success: true,
      message: `OTP sent to ${contactInfo}`,
      data: {
        otpId,
        expiresAt: expiresAt.toISOString(),
        // For development only
        debugInfo: process.env.NODE_ENV === 'development' ? {
          otpCode,
          sendResult,
          note: otpType === 'mobile' ? 'Mobile OTP simulated in development' : 'Email OTP sent'
        } : undefined
      }
    });

  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send OTP',
      message: error.message
    });
  }
});

// Verify OTP
router.post('/verify', [
  body('userId').isUUID(),
  body('otpCode').isLength({ min: 6, max: 6 }).isNumeric(),
  body('otpType').isIn(['email', 'mobile'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { userId, otpCode, otpType } = req.body;

    // Allow test OTP for development
    if (otpCode === '123456' && process.env.NODE_ENV === 'development') {
      // Update user verification status
      const updateData = {};
      if (otpType === 'email') {
        updateData.tu_email_verified = true;
      } else {
        updateData.tu_mobile_verified = true;
        updateData.tu_is_verified = true;
      }

      const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updateData);
      
      await executeQuery(
        `UPDATE tbl_users SET ${setClause} WHERE tu_id = ?`,
        [...values, userId]
      );

      return res.json({
        success: true,
        message: `${otpType} verified successfully (test mode)`,
        data: {
          verificationComplete: true,
          nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
        }
      });
    }

    // Find valid OTP
    const otpRecords = await executeQuery(
      `SELECT tov_id, tov_attempts, tov_expires_at 
       FROM tbl_otp_verifications 
       WHERE tov_user_id = ? AND tov_otp_code = ? AND tov_otp_type = ? AND tov_is_verified = false AND tov_expires_at > NOW()
       ORDER BY tov_created_at DESC LIMIT 1`,
      [userId, otpCode, otpType]
    );

    if (otpRecords.length === 0) {
      // Increment attempts for any existing unverified OTP
      await executeQuery(
        'UPDATE tbl_otp_verifications SET tov_attempts = tov_attempts + 1 WHERE tov_user_id = ? AND tov_otp_type = ? AND tov_is_verified = false',
        [userId, otpType]
      );

      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP. Please request a new code.'
      });
    }

    const otpRecord = otpRecords[0];

    // Check attempts limit
    if (otpRecord.tov_attempts >= 5) {
      return res.status(429).json({
        success: false,
        error: 'Too many failed attempts. Please request a new OTP.'
      });
    }

    // Mark OTP as verified and update user status
    await executeQuery(
      'UPDATE tbl_otp_verifications SET tov_is_verified = true, tov_attempts = tov_attempts + 1 WHERE tov_id = ?',
      [otpRecord.tov_id]
    );

    // Update user verification status
    const updateData = {};
    if (otpType === 'email') {
      updateData.tu_email_verified = true;
    } else {
      updateData.tu_mobile_verified = true;
      updateData.tu_is_verified = true;
    }

    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updateData);
    
    await executeQuery(
      `UPDATE tbl_users SET ${setClause} WHERE tu_id = ?`,
      [...values, userId]
    );

    res.json({
      success: true,
      message: `${otpType} verified successfully`,
      data: {
        verificationComplete: true,
        nextStep: otpType === 'mobile' ? 'subscription_plans' : 'continue_verification'
      }
    });

  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP',
      message: error.message
    });
  }
});

module.exports = router;