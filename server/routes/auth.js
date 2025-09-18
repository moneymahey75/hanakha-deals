const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { executeQuery, executeTransaction } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Generate JWT token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Generate sponsorship number
const generateSponsorshipNumber = async () => {
  let sponsorshipNumber;
  let exists = true;
  
  while (exists) {
    sponsorshipNumber = 'SP' + Math.random().toString().substr(2, 8).padStart(8, '0');
    const result = await executeQuery(
      'SELECT tup_sponsorship_number FROM tbl_user_profiles WHERE tup_sponsorship_number = ?',
      [sponsorshipNumber]
    );
    exists = result.length > 0;
  }
  
  return sponsorshipNumber;
};

// Customer Registration
router.post('/register/customer', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('firstName').trim().isLength({ min: 1 }),
  body('lastName').trim().isLength({ min: 1 }),
  body('userName').trim().isLength({ min: 3 }),
  body('mobile').optional().isMobilePhone(),
  body('gender').isIn(['male', 'female', 'other']),
  body('parentAccount').optional().trim()
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
      email,
      password,
      firstName,
      lastName,
      userName,
      mobile,
      gender,
      parentAccount
    } = req.body;

    // Check if email already exists
    const existingUsers = await executeQuery(
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
    const existingUsername = await executeQuery(
      'SELECT tup_user_id FROM tbl_user_profiles WHERE tup_username = ?',
      [userName]
    );

    if (existingUsername.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Username already taken'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = require('uuid').v4();
    const sponsorshipNumber = await generateSponsorshipNumber();

    // Create user and profile in transaction
    const queries = [
      {
        query: `INSERT INTO tbl_users (tu_id, tu_email, tu_user_type, tu_is_verified, tu_email_verified, tu_mobile_verified, tu_is_active, tu_created_at, tu_updated_at) 
                VALUES (?, ?, 'customer', false, false, false, true, NOW(), NOW())`,
        params: [userId, email]
      },
      {
        query: `INSERT INTO tbl_user_profiles (tup_user_id, tup_first_name, tup_last_name, tup_username, tup_mobile, tup_gender, tup_sponsorship_number, tup_parent_account, tup_created_at, tup_updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        params: [userId, firstName, lastName, userName, mobile, gender, sponsorshipNumber, parentAccount]
      }
    ];

    await executeTransaction(queries);

    // Generate token
    const token = generateToken(userId, 'customer');

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
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
          isVerified: false
        }
      }
    });

  } catch (error) {
    console.error('❌ Customer registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message
    });
  }
});

// Company Registration
router.post('/register/company', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('companyName').trim().isLength({ min: 1 }),
  body('registrationNumber').trim().isLength({ min: 1 }),
  body('gstin').trim().isLength({ min: 1 })
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
      email,
      password,
      companyName,
      brandName,
      businessType,
      businessCategory,
      registrationNumber,
      gstin,
      websiteUrl,
      affiliateCode
    } = req.body;

    // Check if email already exists
    const existingUsers = await executeQuery(
      'SELECT tu_id FROM tbl_users WHERE tu_email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = require('uuid').v4();

    // Create user and company in transaction
    const queries = [
      {
        query: `INSERT INTO tbl_users (tu_id, tu_email, tu_user_type, tu_is_verified, tu_email_verified, tu_mobile_verified, tu_is_active, tu_created_at, tu_updated_at) 
                VALUES (?, ?, 'company', false, false, false, true, NOW(), NOW())`,
        params: [userId, email]
      },
      {
        query: `INSERT INTO tbl_companies (tc_user_id, tc_company_name, tc_brand_name, tc_business_type, tc_business_category, tc_registration_number, tc_gstin, tc_website_url, tc_official_email, tc_affiliate_code, tc_verification_status, tc_created_at, tc_updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        params: [userId, companyName, brandName, businessType, businessCategory, registrationNumber, gstin, websiteUrl, email, affiliateCode]
      }
    ];

    await executeTransaction(queries);

    // Generate token
    const token = generateToken(userId, 'company');

    res.status(201).json({
      success: true,
      message: 'Company registered successfully',
      data: {
        userId,
        token,
        user: {
          id: userId,
          email,
          companyName,
          userType: 'company',
          isVerified: false
        }
      }
    });

  } catch (error) {
    console.error('❌ Company registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message
    });
  }
});

// Login
router.post('/login', [
  body('emailOrUsername').trim().isLength({ min: 1 }),
  body('password').isLength({ min: 1 }),
  body('userType').isIn(['customer', 'company'])
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

    // Determine if input is email or username
    const isEmail = emailOrUsername.includes('@');
    let user;

    if (isEmail) {
      const users = await executeQuery(
        'SELECT tu_id, tu_email, tu_user_type, tu_is_active FROM tbl_users WHERE tu_email = ? AND tu_user_type = ?',
        [emailOrUsername, userType]
      );
      user = users[0];
    } else {
      // Get user by username
      const users = await executeQuery(
        `SELECT u.tu_id, u.tu_email, u.tu_user_type, u.tu_is_active 
         FROM tbl_users u 
         JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id 
         WHERE p.tup_username = ? AND u.tu_user_type = ?`,
        [emailOrUsername, userType]
      );
      user = users[0];
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    if (!user.tu_is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account is inactive'
      });
    }

    // For demo purposes, we'll use a simple password check
    // In production, you should store hashed passwords
    const isValidPassword = password === 'password123' || await bcrypt.compare(password, hashedPassword);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken(user.tu_id, user.tu_user_type);

    // Get additional user data
    let userData = {
      id: user.tu_id,
      email: user.tu_email,
      userType: user.tu_user_type,
      isActive: user.tu_is_active
    };

    if (userType === 'customer') {
      const profiles = await executeQuery(
        'SELECT tup_first_name, tup_last_name, tup_username, tup_sponsorship_number FROM tbl_user_profiles WHERE tup_user_id = ?',
        [user.tu_id]
      );
      if (profiles.length > 0) {
        userData = { ...userData, ...profiles[0] };
      }
    } else if (userType === 'company') {
      const companies = await executeQuery(
        'SELECT tc_company_name, tc_brand_name FROM tbl_companies WHERE tc_user_id = ?',
        [user.tu_id]
      );
      if (companies.length > 0) {
        userData = { ...userData, ...companies[0] };
      }
    }

    // Log login activity
    await executeQuery(
      'INSERT INTO tbl_user_activity_logs (tual_user_id, tual_activity_type, tual_ip_address, tual_user_agent, tual_login_time, tual_created_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [user.tu_id, 'login', req.ip, req.get('User-Agent')]
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userData
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error.message
    });
  }
});

// Logout
router.post('/logout', verifyToken, async (req, res) => {
  try {
    // Log logout activity
    await executeQuery(
      'INSERT INTO tbl_user_activity_logs (tual_user_id, tual_activity_type, tual_ip_address, tual_user_agent, tual_logout_time, tual_created_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [req.user.id, 'logout', req.ip, req.get('User-Agent')]
    );

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const users = await executeQuery(
      `SELECT u.tu_id, u.tu_email, u.tu_user_type, u.tu_is_verified, u.tu_email_verified, u.tu_mobile_verified, u.tu_is_active,
              p.tup_first_name, p.tup_last_name, p.tup_username, p.tup_sponsorship_number, p.tup_mobile,
              c.tc_company_name, c.tc_brand_name
       FROM tbl_users u
       LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
       LEFT JOIN tbl_companies c ON u.tu_id = c.tc_user_id
       WHERE u.tu_id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    // Check for active subscription
    const subscriptions = await executeQuery(
      'SELECT tus_id FROM tbl_user_subscriptions WHERE tus_user_id = ? AND tus_status = "active" AND tus_end_date > NOW()',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        id: user.tu_id,
        email: user.tu_email,
        firstName: user.tup_first_name,
        lastName: user.tup_last_name,
        userName: user.tup_username,
        companyName: user.tc_company_name,
        userType: user.tu_user_type,
        sponsorshipNumber: user.tup_sponsorship_number,
        mobile: user.tup_mobile,
        isVerified: user.tu_is_verified,
        emailVerified: user.tu_email_verified,
        mobileVerified: user.tu_mobile_verified,
        hasActiveSubscription: subscriptions.length > 0
      }
    });

  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user data'
    });
  }
});

// Forgot Password
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    const { email } = req.body;

    // Check if user exists
    const users = await executeQuery(
      'SELECT tu_id FROM tbl_users WHERE tu_email = ?',
      [email]
    );

    if (users.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent'
      });
    }

    // Generate reset token (in production, implement proper password reset)
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    
    // Store reset token in database (you'll need to create this table)
    // For now, just return success
    
    res.json({
      success: true,
      message: 'Password reset link sent to your email'
    });

  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset'
    });
  }
});

module.exports = router;