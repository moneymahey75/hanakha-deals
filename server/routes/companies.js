const express = require('express');
const { pool } = require('../config/database');
const { verifyToken, verifyAdminToken } = require('../middleware/auth');

const router = express.Router();

// Get companies (admin only)
router.get('/', verifyAdminToken, async (req, res) => {
  try {
    const { status, verification } = req.query;

    let query = `
      SELECT c.*, u.tu_email, u.tu_is_active 
      FROM tbl_companies c 
      LEFT JOIN tbl_users u ON c.tc_user_id = u.tu_id 
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND u.tu_is_active = ?';
      params.push(status === 'active');
    }

    if (verification) {
      query += ' AND c.tc_verification_status = ?';
      params.push(verification);
    }

    query += ' ORDER BY c.tc_created_at DESC';

    const [companies] = await pool.execute(query, params);

    res.json({
      success: true,
      data: companies
    });

  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get companies'
    });
  }
});

// Update company status
router.put('/:id/status', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await pool.execute(
      'UPDATE tbl_companies SET tc_verification_status = ? WHERE tc_id = ?',
      [status, id]
    );

    res.json({
      success: true,
      message: 'Company status updated successfully'
    });

  } catch (error) {
    console.error('Update company status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update company status'
    });
  }
});

module.exports = router;