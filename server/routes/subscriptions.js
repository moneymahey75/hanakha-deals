const express = require('express');
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get subscription plans
router.get('/plans', async (req, res) => {
  try {
    const [plans] = await pool.execute(
      'SELECT * FROM tbl_subscription_plans WHERE tsp_is_active = true ORDER BY tsp_price ASC'
    );

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    console.error('Get subscription plans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription plans'
    });
  }
});

// Get user subscriptions
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user can access this data
    if (req.user.tu_id !== userId && req.user.tu_user_type !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const [subscriptions] = await pool.execute(
      `SELECT s.*, p.tsp_name, p.tsp_description, p.tsp_features 
       FROM tbl_user_subscriptions s 
       LEFT JOIN tbl_subscription_plans p ON s.tus_plan_id = p.tsp_id 
       WHERE s.tus_user_id = ? 
       ORDER BY s.tus_created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: subscriptions
    });

  } catch (error) {
    console.error('Get user subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user subscriptions'
    });
  }
});

// Create subscription
router.post('/', verifyToken, async (req, res) => {
  try {
    const { planId, paymentData } = req.body;
    const userId = req.user.tu_id;

    // Get plan details
    const [plans] = await pool.execute(
      'SELECT * FROM tbl_subscription_plans WHERE tsp_id = ? AND tsp_is_active = true',
      [planId]
    );

    if (plans.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscription plan not found'
      });
    }

    const plan = plans[0];

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + plan.tsp_duration_days);

    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Create subscription
      const [result] = await connection.execute(
        `INSERT INTO tbl_user_subscriptions (tus_user_id, tus_plan_id, tus_status, tus_start_date, tus_end_date, tus_payment_amount) 
         VALUES (?, ?, 'active', ?, ?, ?)`,
        [userId, planId, startDate, endDate, plan.tsp_price]
      );

      const subscriptionId = result.insertId;

      // Create payment record
      await connection.execute(
        `INSERT INTO tbl_payments (tp_user_id, tp_subscription_id, tp_amount, tp_currency, tp_payment_method, tp_payment_status, tp_transaction_id) 
         VALUES (?, ?, ?, 'USDT', ?, 'completed', ?)`,
        [userId, subscriptionId, plan.tsp_price, paymentData.method, paymentData.transactionId]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: {
          subscriptionId,
          planName: plan.tsp_name,
          amount: plan.tsp_price,
          startDate,
          endDate
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Create subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create subscription'
    });
  }
});

module.exports = router;