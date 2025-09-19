const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP
router.post('/send', [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('contactInfo').notEmpty().withMessage('Contact information is required'),
  body('otpType').isIn(['email', 'mobile']).withMessage('Invalid OTP type')
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

    // Verify user exists
    const [users] = await pool.execute(
      'SELECT tu_id FROM tbl_users WHERE tu_id = ? AND tu_is_active = true',
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

    // Save OTP to database
    await pool.execute(
      `INSERT INTO tbl_otp_verifications (tov_user_id, tov_otp_code, tov_otp_type, tov_contact_info, tov_expires_at) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, otpCode, otpType, contactInfo, expiresAt]
    );

    // In development, return the OTP code for testing
    if (process.env.NODE_ENV === 'development') {
      return res.json({
        success: true,
        message: `OTP sent to ${contactInfo}`,
        data: {
          otpId: uuidv4(),
          expiresAt: expiresAt.toISOString(),
          debugInfo: {
            otp_code: otpCode,
            message: `Development mode: Use OTP ${otpCode} for testing`
          }
        }
      });
    }

    // In production, you would send actual email/SMS here
    // For now, just return success
    res.json({
      success: true,
      message: `OTP sent to ${contactInfo}`,
      data: {
        otpId: uuidv4(),
        expiresAt: expiresAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send OTP'
    });
  }
});

// Verify OTP
router.post('/verify', [
  body('userId').isUUID().withMessage('Valid user ID is required'),
  body('otpCode').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('otpType').isIn(['email', 'mobile']).withMessage('Invalid OTP type')
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

    // Find valid OTP
    const [otps] = await pool.execute(
      `SELECT * FROM tbl_otp_verifications 
       WHERE tov_user_id = ? AND tov_otp_code = ? AND tov_otp_type = ? 
       AND tov_is_verified = false AND tov_expires_at > NOW() 
       ORDER BY tov_created_at DESC LIMIT 1`,
      [userId, otpCode, otpType]
    );

    if (otps.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP'
      });
    }

    const otp = otps[0];

    // Mark OTP as verified
    await pool.execute(
      'UPDATE tbl_otp_verifications SET tov_is_verified = true WHERE tov_id = ?',
      [otp.tov_id]
    );

    // Update user verification status
    const updateField = otpType === 'email' ? 'tu_email_verified' : 'tu_mobile_verified';
    await pool.execute(
      `UPDATE tbl_users SET ${updateField} = true WHERE tu_id = ?`,
      [userId]
    );

    // Check if user is fully verified
    const [updatedUser] = await pool.execute(
      'SELECT tu_email_verified, tu_mobile_verified FROM tbl_users WHERE tu_id = ?',
      [userId]
    );

    const user = updatedUser[0];
    const isFullyVerified = user.tu_email_verified && user.tu_mobile_verified;

    if (isFullyVerified) {
      await pool.execute(
        'UPDATE tbl_users SET tu_is_verified = true WHERE tu_id = ?',
        [userId]
      );
    }

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        verification_complete: isFullyVerified,
        next_step: isFullyVerified ? 'subscription' : 'continue_verification'
      }
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP'
    });
  }
});

module.exports = router;