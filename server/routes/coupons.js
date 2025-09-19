const express = require('express');
const { pool } = require('../config/database');
const { verifyToken, verifyAdminToken } = require('../middleware/auth');

const router = express.Router();

// Get coupons
router.get('/', async (req, res) => {
  try {
    const { status, company } = req.query;

    let query = 'SELECT * FROM tbl_coupons WHERE tc_is_active = true';
    const params = [];

    if (status) {
      query += ' AND tc_status = ?';
      params.push(status);
    }

    if (company) {
      query += ' AND tc_company_id = ?';
      params.push(company);
    }

    query += ' ORDER BY tc_created_at DESC';

    const [coupons] = await pool.execute(query, params);

    res.json({
      success: true,
      data: coupons
    });

  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get coupons'
    });
  }
});

// Create coupon
router.post('/', verifyToken, async (req, res) => {
  try {
    const couponData = req.body;
    const userId = req.user.tu_id;

    const [result] = await pool.execute(
      `INSERT INTO tbl_coupons (tc_created_by, tc_title, tc_description, tc_coupon_code, tc_discount_type, tc_discount_value, tc_share_reward_amount, tc_valid_from, tc_valid_until, tc_usage_limit, tc_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        userId,
        couponData.title,
        couponData.description,
        couponData.coupon_code,
        couponData.discount_type,
        couponData.discount_value,
        couponData.share_reward_amount,
        couponData.valid_from,
        couponData.valid_until,
        couponData.usage_limit
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: {
        couponId: result.insertId
      }
    });

  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create coupon'
    });
  }
});

module.exports = router;