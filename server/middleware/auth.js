const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

// Verify JWT token middleware
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const [users] = await pool.execute(
      'SELECT * FROM tbl_users WHERE tu_id = ? AND tu_is_active = true',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive'
      });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Token verification failed'
    });
  }
};

// Verify admin token middleware
const verifyAdminToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Admin access token required'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get admin from database
    const [admins] = await pool.execute(
      'SELECT * FROM tbl_admin_users WHERE tau_id = ? AND tau_is_active = true',
      [decoded.adminId]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Admin not found or inactive'
      });
    }

    req.admin = admins[0];
    next();
  } catch (error) {
    console.error('Admin token verification error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid admin token'
    });
  }
};

// Check user type middleware
const requireUserType = (userType) => {
  return (req, res, next) => {
    if (req.user && req.user.tu_user_type === userType) {
      next();
    } else {
      res.status(403).json({
        success: false,
        error: `Access denied. ${userType} role required.`
      });
    }
  };
};

module.exports = {
  verifyToken,
  verifyAdminToken,
  requireUserType
};