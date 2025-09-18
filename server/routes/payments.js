const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Get payment history for user
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

    const payments = await executeQuery(
      `SELECT p.*, s.tus_plan_id, s.tus_status as subscription_status, s.tus_start_date, s.tus_end_date,
              sp.tsp_name, sp.tsp_description, sp.tsp_features
       FROM tbl_payments p
       LEFT JOIN tbl_user_subscriptions s ON p.tp_subscription_id = s.tus_id
       LEFT JOIN tbl_subscription_plans sp ON s.tus_plan_id = sp.tsp_id
       WHERE p.tp_user_id = ?
       ORDER BY p.tp_created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: payments
    });

  } catch (error) {
    console.error('❌ Get payment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment history'
    });
  }
});

// Create payment
router.post('/', verifyToken, [
  body('amount').isNumeric(),
  body('currency').isLength({ min: 3, max: 3 }),
  body('paymentMethod').isLength({ min: 1 })
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

    const { amount, currency, paymentMethod, subscriptionId, transactionId, gatewayResponse } = req.body;
    const userId = req.user.id;

    const paymentId = require('uuid').v4();

    await executeQuery(
      `INSERT INTO tbl_payments (tp_id, tp_user_id, tp_subscription_id, tp_amount, tp_currency, tp_payment_method, tp_payment_status, tp_transaction_id, tp_gateway_response, tp_created_at, tp_updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, NOW(), NOW())`,
      [paymentId, userId, subscriptionId, amount, currency, paymentMethod, transactionId, JSON.stringify(gatewayResponse)]
    );

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: { paymentId }
    });

  } catch (error) {
    console.error('❌ Create payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record payment'
    });
  }
});

module.exports = router;