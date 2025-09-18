const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyToken, verifyAdminToken, requireAdminPermission } = require('../middleware/auth');
const router = express.Router();

// Get daily tasks
router.get('/daily', async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;

    const tasks = await executeQuery(
      `SELECT t.*, c.tc_title as coupon_title, c.tc_coupon_code
       FROM tbl_daily_tasks t
       LEFT JOIN tbl_coupons c ON t.tdt_coupon_id = c.tc_id
       WHERE t.tdt_task_date = ? AND t.tdt_is_active = true AND t.tdt_expires_at > NOW()
       ORDER BY t.tdt_created_at DESC`,
      [date]
    );

    res.json({
      success: true,
      data: tasks
    });

  } catch (error) {
    console.error('❌ Get daily tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get daily tasks'
    });
  }
});

// Create daily task
router.post('/daily', verifyAdminToken, requireAdminPermission('dailytasks', 'write'), [
  body('taskType').isIn(['coupon_share', 'social_share', 'video_share', 'custom']),
  body('title').trim().isLength({ min: 1 }),
  body('rewardAmount').isNumeric()
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
      taskType,
      title,
      description,
      contentUrl,
      couponId,
      rewardAmount,
      taskDate,
      expiresAt
    } = req.body;

    const taskId = require('uuid').v4();

    await executeQuery(
      `INSERT INTO tbl_daily_tasks (tdt_id, tdt_created_by, tdt_task_type, tdt_title, tdt_description, tdt_content_url, tdt_coupon_id, tdt_reward_amount, tdt_task_date, tdt_expires_at, tdt_is_active, tdt_created_at, tdt_updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, NOW(), NOW())`,
      [taskId, req.admin.id, taskType, title, description, contentUrl, couponId, rewardAmount, taskDate, expiresAt]
    );

    res.status(201).json({
      success: true,
      message: 'Daily task created successfully',
      data: { taskId }
    });

  } catch (error) {
    console.error('❌ Create daily task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create daily task'
    });
  }
});

module.exports = router;