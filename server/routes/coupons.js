const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyToken, verifyAdminToken, requireAdminPermission } = require('../middleware/auth');
const router = express.Router();

// Get coupons
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = 'all', companyId = null } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE c.tc_is_active = true';
    const params = [];

    if (search) {
      whereClause += ' AND (c.tc_title LIKE ? OR c.tc_coupon_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status !== 'all') {
      whereClause += ' AND c.tc_status = ?';
      params.push(status);
    }

    if (companyId) {
      whereClause += ' AND c.tc_company_id = ?';
      params.push(companyId);
    }

    const coupons = await executeQuery(
      `SELECT c.*, comp.tc_company_name
       FROM tbl_coupons c
       LEFT JOIN tbl_companies comp ON c.tc_company_id = comp.tc_id
       ${whereClause}
       ORDER BY c.tc_created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: coupons
    });

  } catch (error) {
    console.error('❌ Get coupons error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get coupons'
    });
  }
});

// Create coupon
router.post('/', verifyToken, [
  body('title').trim().isLength({ min: 1 }),
  body('couponCode').trim().isLength({ min: 1 }),
  body('discountType').isIn(['percentage', 'fixed_amount']),
  body('discountValue').isNumeric(),
  body('shareRewardAmount').isNumeric()
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
      title,
      description,
      couponCode,
      discountType,
      discountValue,
      imageUrl,
      termsConditions,
      validFrom,
      validUntil,
      usageLimit,
      shareRewardAmount
    } = req.body;

    const couponId = require('uuid').v4();

    await executeQuery(
      `INSERT INTO tbl_coupons (tc_id, tc_created_by, tc_title, tc_description, tc_coupon_code, tc_discount_type, tc_discount_value, tc_image_url, tc_terms_conditions, tc_valid_from, tc_valid_until, tc_usage_limit, tc_share_reward_amount, tc_status, tc_is_active, tc_created_at, tc_updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', true, NOW(), NOW())`,
      [couponId, req.user.id, title, description, couponCode, discountType, discountValue, imageUrl, termsConditions, validFrom, validUntil, usageLimit, shareRewardAmount]
    );

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: { couponId }
    });

  } catch (error) {
    console.error('❌ Create coupon error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create coupon'
    });
  }
});

module.exports = router;