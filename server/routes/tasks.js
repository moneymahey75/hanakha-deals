const express = require('express');
const { pool } = require('../config/database');
const { verifyToken, verifyAdminToken } = require('../middleware/auth');

const router = express.Router();

// Get daily tasks
router.get('/daily', async (req, res) => {
  try {
    const { date } = req.query;
    const taskDate = date || new Date().toISOString().split('T')[0];

    const [tasks] = await pool.execute(
      `SELECT t.*, c.tc_title as coupon_title, c.tc_coupon_code 
       FROM tbl_daily_tasks t 
       LEFT JOIN tbl_coupons c ON t.tdt_coupon_id = c.tc_id 
       WHERE t.tdt_task_date = ? AND t.tdt_is_active = true 
       ORDER BY t.tdt_created_at DESC`,
      [taskDate]
    );

    res.json({
      success: true,
      data: tasks
    });

  } catch (error) {
    console.error('Get daily tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get daily tasks'
    });
  }
});

// Create daily task (admin only)
router.post('/daily', verifyAdminToken, async (req, res) => {
  try {
    const taskData = req.body;
    const adminId = req.admin.tau_id;

    const [result] = await pool.execute(
      `INSERT INTO tbl_daily_tasks (tdt_created_by, tdt_task_type, tdt_title, tdt_description, tdt_content_url, tdt_coupon_id, tdt_reward_amount, tdt_task_date, tdt_expires_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId,
        taskData.task_type,
        taskData.title,
        taskData.description,
        taskData.content_url,
        taskData.coupon_id,
        taskData.reward_amount,
        taskData.task_date,
        taskData.expires_at
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Daily task created successfully',
      data: {
        taskId: result.insertId
      }
    });

  } catch (error) {
    console.error('Create daily task error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create daily task'
    });
  }
});

module.exports = router;