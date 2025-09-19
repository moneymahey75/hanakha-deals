const express = require('express');
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get user payment history
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

    const [payments] = await pool.execute(
      `SELECT p.*, s.tus_plan_id, sp.tsp_name 
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
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment history'
    });
  }
});

// Create payment
router.post('/', verifyToken, async (req, res) => {
  try {
    const { amount, currency, paymentMethod, transactionId, subscriptionId } = req.body;
    const userId = req.user.tu_id;

    const [result] = await pool.execute(
      `INSERT INTO tbl_payments (tp_user_id, tp_subscription_id, tp_amount, tp_currency, tp_payment_method, tp_payment_status, tp_transaction_id) 
       VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
      [userId, subscriptionId, amount, currency, paymentMethod, transactionId]
    );

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        paymentId: result.insertId,
        amount,
        currency,
        transactionId
      }
    });

  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record payment'
    });
  }
});

module.exports = router;