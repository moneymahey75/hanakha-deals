const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const users = await executeQuery(
      'SELECT tu_id, tu_email, tu_user_type, tu_is_active FROM tbl_users WHERE tu_id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token. User not found.'
      });
    }

    const user = users[0];
    if (!user.tu_is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account is inactive.'
      });
    }

    req.user = {
      id: user.tu_id,
      email: user.tu_email,
      userType: user.tu_user_type,
      isActive: user.tu_is_active
    };

    next();
  } catch (error) {
    console.error('❌ Token verification error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid token.'
    });
  }
};

// Verify admin token
const verifyAdminToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No admin token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get admin from database
    const admins = await executeQuery(
      'SELECT tau_id, tau_email, tau_role, tau_permissions, tau_is_active FROM tbl_admin_users WHERE tau_id = ?',
      [decoded.adminId]
    );

    if (admins.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid admin token.'
      });
    }

    const admin = admins[0];
    if (!admin.tau_is_active) {
      return res.status(401).json({
        success: false,
        error: 'Admin account is inactive.'
      });
    }

    req.admin = {
      id: admin.tau_id,
      email: admin.tau_email,
      role: admin.tau_role,
      permissions: JSON.parse(admin.tau_permissions),
      isActive: admin.tau_is_active
    };

    next();
  } catch (error) {
    console.error('❌ Admin token verification error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid admin token.'
    });
  }
};

// Check user type
const requireUserType = (userType) => {
  return (req, res, next) => {
    if (req.user.userType !== userType) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.'
      });
    }
    next();
  };
};

// Check admin permission
const requireAdminPermission = (module, action) => {
  return (req, res, next) => {
    if (req.admin.role === 'super_admin') {
      return next();
    }

    if (!req.admin.permissions[module] || !req.admin.permissions[module][action]) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.'
      });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  verifyAdminToken,
  requireUserType,
  requireAdminPermission
};