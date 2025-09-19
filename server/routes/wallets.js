const express = require('express');
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get user wallet
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

    const [wallets] = await pool.execute(
      'SELECT * FROM tbl_wallets WHERE tw_user_id = ? AND tw_currency = "USDT"',
      [userId]
    );

    res.json({
      success: true,
      data: wallets[0] || null
    });

  } catch (error) {
    console.error('Get user wallet error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user wallet'
    });
  }
});

// Get wallet transactions
router.get('/user/:userId/transactions', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user can access this data
    if (req.user.tu_id !== userId && req.user.tu_user_type !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const [transactions] = await pool.execute(
      'SELECT * FROM tbl_wallet_transactions WHERE twt_user_id = ? ORDER BY twt_created_at DESC LIMIT 50',
      [userId]
    );

    res.json({
      success: true,
      data: transactions
    });

  } catch (error) {
    console.error('Get wallet transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet transactions'
    });
  }
});

module.exports = router;