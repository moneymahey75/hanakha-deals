const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/:id/profile', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user can access this profile (own profile or admin)
    if (req.user.tu_id !== id && req.user.tu_user_type !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get user and profile data
    const [users] = await pool.execute(
      `SELECT u.*, p.* FROM tbl_users u 
       LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id 
       WHERE u.tu_id = ?`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// Update user profile
router.put('/:id/profile', verifyToken, [
  body('firstName').optional().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('mobile').optional().isMobilePhone().withMessage('Invalid mobile number')
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

    const { id } = req.params;

    // Verify user can update this profile
    if (req.user.tu_id !== id && req.user.tu_user_type !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const updateData = req.body;
    const allowedFields = ['firstName', 'lastName', 'mobile', 'gender'];
    const updates = {};

    // Filter allowed fields
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        const dbField = `tup_${field.toLowerCase().replace(/([A-Z])/g, '_$1')}`;
        updates[dbField] = updateData[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    // Build update query
    const setClause = Object.keys(updates).map(field => `${field} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);

    await pool.execute(
      `UPDATE tbl_user_profiles SET ${setClause}, tup_updated_at = NOW() WHERE tup_user_id = ?`,
      values
    );

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

module.exports = router;