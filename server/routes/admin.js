const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { verifyAdminToken } = require('../middleware/auth');

const router = express.Router();

// Generate admin JWT token
const generateAdminToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '8h' // Admin sessions expire in 8 hours
  });
};

// Admin login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password is required')
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

    const { email, password } = req.body;

    // Get admin user
    const [admins] = await pool.execute(
      'SELECT * FROM tbl_admin_users WHERE tau_email = ? AND tau_is_active = true',
      [email]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const admin = admins[0];

    // For demo purposes, accept the demo password
    const isValidPassword = password === 'Admin@123456' || bcrypt.compareSync(password, admin.tau_password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login
    await pool.execute(
      'UPDATE tbl_admin_users SET tau_last_login = NOW() WHERE tau_id = ?',
      [admin.tau_id]
    );

    // Generate token
    const token = generateAdminToken({
      adminId: admin.tau_id,
      email: admin.tau_email,
      role: admin.tau_role
    });

    res.json({
      success: true,
      message: 'Admin login successful',
      data: {
        token,
        admin: {
          id: admin.tau_id,
          email: admin.tau_email,
          fullName: admin.tau_full_name,
          role: admin.tau_role,
          permissions: admin.tau_permissions,
          isActive: admin.tau_is_active,
          lastLogin: admin.tau_last_login,
          createdAt: admin.tau_created_at
        }
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Get system settings
router.get('/settings', verifyAdminToken, async (req, res) => {
  try {
    const [settings] = await pool.execute(
      'SELECT tss_setting_key, tss_setting_value FROM tbl_system_settings'
    );

    // Convert to key-value object
    const settingsMap = {};
    settings.forEach(setting => {
      try {
        settingsMap[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value);
      } catch (parseError) {
        settingsMap[setting.tss_setting_key] = setting.tss_setting_value;
      }
    });

    res.json({
      success: true,
      data: settingsMap
    });

  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system settings'
    });
  }
});

// Update system settings
router.put('/settings', verifyAdminToken, async (req, res) => {
  try {
    const settings = req.body;

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      for (const [key, value] of Object.entries(settings)) {
        await connection.execute(
          `INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description) 
           VALUES (?, ?, ?) 
           ON DUPLICATE KEY UPDATE tss_setting_value = ?, tss_updated_at = NOW()`,
          [key, JSON.stringify(value), `${key} setting`, JSON.stringify(value)]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: 'Settings updated successfully'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
});

module.exports = router;