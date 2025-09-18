const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyAdminToken, requireAdminPermission } = require('../middleware/auth');
const router = express.Router();

// Get companies
router.get('/', verifyAdminToken, requireAdminPermission('companies', 'read'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (c.tc_company_name LIKE ? OR c.tc_official_email LIKE ? OR c.tc_registration_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== 'all') {
      whereClause += ' AND c.tc_verification_status = ?';
      params.push(status);
    }

    const companies = await executeQuery(
      `SELECT c.*, u.tu_email, u.tu_is_active
       FROM tbl_companies c
       JOIN tbl_users u ON c.tc_user_id = u.tu_id
       ${whereClause}
       ORDER BY c.tc_created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const total = await executeQuery(
      `SELECT COUNT(*) as count FROM tbl_companies c JOIN tbl_users u ON c.tc_user_id = u.tu_id ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        companies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].count,
          pages: Math.ceil(total[0].count / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get companies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get companies'
    });
  }
});

// Update company status
router.put('/:companyId/status', verifyAdminToken, requireAdminPermission('companies', 'write'), [
  body('status').isIn(['pending', 'verified', 'rejected'])
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

    const { companyId } = req.params;
    const { status } = req.body;

    await executeQuery(
      'UPDATE tbl_companies SET tc_verification_status = ?, tc_updated_at = NOW() WHERE tc_id = ?',
      [status, companyId]
    );

    res.json({
      success: true,
      message: `Company status updated to ${status}`
    });

  } catch (error) {
    console.error('❌ Update company status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update company status'
    });
  }
});

module.exports = router;