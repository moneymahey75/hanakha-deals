const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, executeTransaction } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Get subscription plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await executeQuery(
      'SELECT * FROM tbl_subscription_plans WHERE tsp_is_active = true ORDER BY tsp_price ASC'
    );

    res.json({
      success: true,
      data: plans
    });

  } catch (error) {
    console.error('❌ Get plans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription plans'
    });
  }
});

// Create subscription
router.post('/', verifyToken, [
  body('planId').isUUID(),
  body('paymentData').isObject()
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

    const { planId, paymentData } = req.body;
    const userId = req.user.id;

    // Get plan details
    const plans = await executeQuery(
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

    const subscriptionId = require('uuid').v4();
    const paymentId = require('uuid').v4();

    // Create subscription and payment in transaction
    const queries = [
      {
        query: `INSERT INTO tbl_user_subscriptions (tus_id, tus_user_id, tus_plan_id, tus_status, tus_start_date, tus_end_date, tus_payment_amount, tus_created_at, tus_updated_at) 
                VALUES (?, ?, ?, 'active', ?, ?, ?, NOW(), NOW())`,
        params: [subscriptionId, userId, planId, startDate, endDate, plan.tsp_price]
      },
      {
        query: `INSERT INTO tbl_payments (tp_id, tp_user_id, tp_subscription_id, tp_amount, tp_currency, tp_payment_method, tp_payment_status, tp_transaction_id, tp_gateway_response, tp_created_at, tp_updated_at) 
                VALUES (?, ?, ?, ?, 'USD', ?, 'completed', ?, ?, NOW(), NOW())`,
        params: [paymentId, userId, subscriptionId, plan.tsp_price, paymentData.method || 'card', paymentData.transactionId || null, JSON.stringify(paymentData)]
      }
    ];

    await executeTransaction(queries);

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      data: {
        subscriptionId,
        paymentId
      }
    });

  } catch (error) {
    console.error('❌ Create subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create subscription'
    });
  }
});

// Get user subscriptions
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check access permissions
    if (req.user.id !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const subscriptions = await executeQuery(
      `SELECT s.*, p.tsp_name, p.tsp_description, p.tsp_features
       FROM tbl_user_subscriptions s
       JOIN tbl_subscription_plans p ON s.tus_plan_id = p.tsp_id
       WHERE s.tus_user_id = ?
       ORDER BY s.tus_created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: subscriptions
    });

  } catch (error) {
    console.error('❌ Get user subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscriptions'
    });
  }
});

module.exports = router;