const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Get user profile
router.get('/:userId/profile', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user can access this profile (own profile or admin)
    if (req.user.id !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const profiles = await executeQuery(
      `SELECT u.tu_id, u.tu_email, u.tu_user_type, u.tu_is_verified, u.tu_email_verified, u.tu_mobile_verified,
              p.tup_first_name, p.tup_last_name, p.tup_username, p.tup_mobile, p.tup_gender, p.tup_sponsorship_number, p.tup_parent_account
       FROM tbl_users u
       LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
       WHERE u.tu_id = ?`,
      [userId]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: profiles[0]
    });

  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// Update user profile
router.put('/:userId/profile', verifyToken, [
  body('firstName').optional().trim().isLength({ min: 1 }),
  body('lastName').optional().trim().isLength({ min: 1 }),
  body('mobile').optional().isMobilePhone()
], async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user can update this profile
    if (req.user.id !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { firstName, lastName, mobile, gender } = req.body;

    // Update profile
    await executeQuery(
      `UPDATE tbl_user_profiles 
       SET tup_first_name = COALESCE(?, tup_first_name),
           tup_last_name = COALESCE(?, tup_last_name),
           tup_mobile = COALESCE(?, tup_mobile),
           tup_gender = COALESCE(?, tup_gender),
           tup_updated_at = NOW()
       WHERE tup_user_id = ?`,
      [firstName, lastName, mobile, gender, userId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// Check if sponsorship number exists
router.get('/check-sponsorship/:sponsorshipNumber', async (req, res) => {
  try {
    const { sponsorshipNumber } = req.params;

    const profiles = await executeQuery(
      'SELECT tup_sponsorship_number FROM tbl_user_profiles WHERE tup_sponsorship_number = ?',
      [sponsorshipNumber]
    );

    res.json({
      success: true,
      data: {
        exists: profiles.length > 0
      }
    });

  } catch (error) {
    console.error('❌ Check sponsorship number error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check sponsorship number'
    });
  }
});

module.exports = router;