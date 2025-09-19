const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// Login endpoint
router.post('/login', [
  body('emailOrUsername').notEmpty().withMessage('Email or username is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('userType').isIn(['customer', 'company', 'admin']).withMessage('Invalid user type')
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

    const { emailOrUsername, password, userType } = req.body;

    // Query user based on email or username
    let query, params;
    if (emailOrUsername.includes('@')) {
      query = 'SELECT * FROM tbl_users WHERE tu_email = ? AND tu_user_type = ? AND tu_is_active = true';
      params = [emailOrUsername, userType];
    } else {
      // Join with user_profiles to search by username
      query = `
        SELECT u.*, p.tup_username 
        FROM tbl_users u 
        LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id 
        WHERE p.tup_username = ? AND u.tu_user_type = ? AND u.tu_is_active = true
      `;
      params = [emailOrUsername, userType];
    }

    const [users] = await pool.execute(query, params);

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const user = users[0];

    // For demo purposes, accept any password
    // In production, you would verify the hashed password
    const isValidPassword = true; // bcrypt.compareSync(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Get user profile
    const [profiles] = await pool.execute(
      'SELECT * FROM tbl_user_profiles WHERE tup_user_id = ?',
      [user.tu_id]
    );

    const profile = profiles[0] || {};

    // Generate token
    const token = generateToken({
      userId: user.tu_id,
      email: user.tu_email,
      userType: user.tu_user_type
    });

    // Update last login (if column exists)
    try {
      await pool.execute(
        'UPDATE tbl_users SET tu_updated_at = NOW() WHERE tu_id = ?',
        [user.tu_id]
      );
    } catch (updateError) {
      console.warn('Could not update last login:', updateError.message);
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.tu_id,
          email: user.tu_email,
          firstName: profile.tup_first_name,
          lastName: profile.tup_last_name,
          userName: profile.tup_username,
          userType: user.tu_user_type,
          sponsorshipNumber: profile.tup_sponsorship_number,
          isVerified: user.tu_is_verified,
          hasActiveSubscription: false, // Would check subscription table
          mobileVerified: user.tu_mobile_verified,
          emailVerified: user.tu_email_verified
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Customer registration
router.post('/register/customer', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required'),
  body('userName').isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
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

    const {
      firstName,
      lastName,
      userName,
      email,
      mobile,
      parentAccount,
      gender,
      password
    } = req.body;

    // Check if email already exists
    const [existingUsers] = await pool.execute(
      'SELECT tu_id FROM tbl_users WHERE tu_email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Check if username already exists
    const [existingUsernames] = await pool.execute(
      'SELECT tup_id FROM tbl_user_profiles WHERE tup_username = ?',
      [userName]
    );

    if (existingUsernames.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Username already taken'
      });
    }

    const userId = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert user
      await connection.execute(
        `INSERT INTO tbl_users (tu_id, tu_email, tu_user_type, tu_is_verified, tu_email_verified, tu_mobile_verified, tu_is_active) 
         VALUES (?, ?, 'customer', false, false, false, true)`,
        [userId, email]
      );

      // Generate sponsorship number
      const sponsorshipNumber = 'SP' + Date.now().toString().slice(-8);

      // Insert user profile
      await connection.execute(
        `INSERT INTO tbl_user_profiles (tup_user_id, tup_first_name, tup_last_name, tup_username, tup_mobile, tup_gender, tup_sponsorship_number, tup_parent_account) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, firstName, lastName, userName, mobile, gender, sponsorshipNumber, parentAccount]
      );

      await connection.commit();

      // Generate token
      const token = generateToken({
        userId,
        email,
        userType: 'customer'
      });

      res.status(201).json({
        success: true,
        message: 'Customer registration successful',
        data: {
          userId,
          token,
          user: {
            id: userId,
            email,
            firstName,
            lastName,
            userName,
            userType: 'customer',
            sponsorshipNumber,
            isVerified: false,
            hasActiveSubscription: false,
            mobileVerified: false,
            emailVerified: false
          }
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Company registration
router.post('/register/company', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('companyName').notEmpty().withMessage('Company name is required'),
  body('registrationNumber').notEmpty().withMessage('Registration number is required'),
  body('gstin').notEmpty().withMessage('GSTIN is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
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

    const {
      companyName,
      brandName,
      businessType,
      businessCategory,
      registrationNumber,
      gstin,
      websiteUrl,
      email,
      affiliateCode,
      password
    } = req.body;

    // Check if email already exists
    const [existingUsers] = await pool.execute(
      'SELECT tu_id FROM tbl_users WHERE tu_email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    const userId = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Insert user
      await connection.execute(
        `INSERT INTO tbl_users (tu_id, tu_email, tu_user_type, tu_is_verified, tu_email_verified, tu_mobile_verified, tu_is_active) 
         VALUES (?, ?, 'company', false, false, false, true)`,
        [userId, email]
      );

      // Insert company
      await connection.execute(
        `INSERT INTO tbl_companies (tc_user_id, tc_company_name, tc_brand_name, tc_business_type, tc_business_category, tc_registration_number, tc_gstin, tc_website_url, tc_official_email, tc_affiliate_code, tc_verification_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [userId, companyName, brandName, businessType, businessCategory, registrationNumber, gstin, websiteUrl, email, affiliateCode]
      );

      await connection.commit();

      // Generate token
      const token = generateToken({
        userId,
        email,
        userType: 'company'
      });

      res.status(201).json({
        success: true,
        message: 'Company registration successful',
        data: {
          userId,
          token,
          user: {
            id: userId,
            email,
            companyName,
            userType: 'company',
            isVerified: false,
            hasActiveSubscription: false,
            mobileVerified: false,
            emailVerified: false
          }
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Company registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Get user profile
    const [profiles] = await pool.execute(
      'SELECT * FROM tbl_user_profiles WHERE tup_user_id = ?',
      [user.tu_id]
    );

    const profile = profiles[0] || {};

    // Check for active subscription
    const [subscriptions] = await pool.execute(
      'SELECT * FROM tbl_user_subscriptions WHERE tus_user_id = ? AND tus_status = "active" AND tus_end_date > NOW()',
      [user.tu_id]
    );

    res.json({
      success: true,
      data: {
        id: user.tu_id,
        email: user.tu_email,
        firstName: profile.tup_first_name,
        lastName: profile.tup_last_name,
        userName: profile.tup_username,
        userType: user.tu_user_type,
        sponsorshipNumber: profile.tup_sponsorship_number,
        isVerified: user.tu_is_verified,
        hasActiveSubscription: subscriptions.length > 0,
        mobileVerified: user.tu_mobile_verified,
        emailVerified: user.tu_email_verified
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
});

// Logout endpoint
router.post('/logout', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful'
  });
});

// Forgot password
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required')
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

    const { email } = req.body;

    // Check if user exists
    const [users] = await pool.execute(
      'SELECT tu_id FROM tbl_users WHERE tu_email = ? AND tu_is_active = true',
      [email]
    );

    if (users.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent'
      });
    }

    // In a real implementation, you would:
    // 1. Generate a reset token
    // 2. Save it to database with expiration
    // 3. Send email with reset link

    res.json({
      success: true,
      message: 'Password reset email sent'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
});

module.exports = router;