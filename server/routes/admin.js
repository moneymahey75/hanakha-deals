const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyAdminToken, requireAdminPermission } = require('../middleware/auth');
const router = express.Router();

// Admin Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 1 })
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

    // Get admin from database
    const admins = await executeQuery(
      'SELECT tau_id, tau_email, tau_full_name, tau_role, tau_permissions, tau_is_active, tau_last_login FROM tbl_admin_users WHERE tau_email = ?',
      [email]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const admin = admins[0];

    if (!admin.tau_is_active) {
      return res.status(401).json({
        success: false,
        error: 'Admin account is inactive'
      });
    }

    // For demo purposes, check against default password
    // In production, use proper password hashing
    const isValidPassword = password === 'Admin@123456';

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login
    await executeQuery(
      'UPDATE tbl_admin_users SET tau_last_login = NOW() WHERE tau_id = ?',
      [admin.tau_id]
    );

    // Generate token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { adminId: admin.tau_id, role: admin.tau_role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

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
          permissions: JSON.parse(admin.tau_permissions),
          isActive: admin.tau_is_active,
          lastLogin: admin.tau_last_login,
          createdAt: admin.tau_created_at
        }
      }
    });

  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error.message
    });
  }
});

// Get System Settings
router.get('/settings', verifyAdminToken, requireAdminPermission('settings', 'read'), async (req, res) => {
  try {
    const settings = await executeQuery(
      'SELECT tss_setting_key, tss_setting_value FROM tbl_system_settings'
    );

    // Convert to key-value object
    const settingsMap = {};
    settings.forEach(setting => {
      try {
        settingsMap[setting.tss_setting_key] = JSON.parse(setting.tss_setting_value);
      } catch {
        settingsMap[setting.tss_setting_key] = setting.tss_setting_value;
      }
    });

    res.json({
      success: true,
      data: settingsMap
    });

  } catch (error) {
    console.error('❌ Get settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get settings'
    });
  }
});

// Update System Settings
router.put('/settings', verifyAdminToken, requireAdminPermission('settings', 'write'), async (req, res) => {
  try {
    const settings = req.body;

    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      await executeQuery(
        `INSERT INTO tbl_system_settings (tss_setting_key, tss_setting_value, tss_description, tss_created_at, tss_updated_at) 
         VALUES (?, ?, ?, NOW(), NOW()) 
         ON DUPLICATE KEY UPDATE tss_setting_value = ?, tss_updated_at = NOW()`,
        [key, JSON.stringify(value), `${key} setting`, JSON.stringify(value)]
      );
    }

    res.json({
      success: true,
      message: 'Settings updated successfully'
    });

  } catch (error) {
    console.error('❌ Update settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
});

// Get Users
router.get('/users', verifyAdminToken, requireAdminPermission('customers', 'read'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', userType = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (u.tu_email LIKE ? OR p.tup_first_name LIKE ? OR p.tup_last_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (userType !== 'all') {
      whereClause += ' AND u.tu_user_type = ?';
      params.push(userType);
    }

    const users = await executeQuery(
      `SELECT u.*, p.tup_first_name, p.tup_last_name, p.tup_username, p.tup_sponsorship_number, p.tup_mobile
       FROM tbl_users u
       LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
       ${whereClause}
       ORDER BY u.tu_created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const total = await executeQuery(
      `SELECT COUNT(*) as count FROM tbl_users u LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].count,
          pages: Math.ceil(total[0].count / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
});

module.exports = router;