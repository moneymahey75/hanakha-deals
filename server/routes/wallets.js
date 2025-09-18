const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, executeTransaction } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Get user wallet
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

    const wallets = await executeQuery(
      'SELECT * FROM tbl_wallets WHERE tw_user_id = ? AND tw_currency = "USDT"',
      [userId]
    );

    res.json({
      success: true,
      data: wallets[0] || null
    });

  } catch (error) {
    console.error('❌ Get wallet error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet'
    });
  }
});

// Get wallet transactions
router.get('/user/:userId/transactions', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Check access permissions
    if (req.user.id !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const transactions = await executeQuery(
      `SELECT * FROM tbl_wallet_transactions 
       WHERE twt_user_id = ? 
       ORDER BY twt_created_at DESC 
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: transactions
    });

  } catch (error) {
    console.error('❌ Get transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transactions'
    });
  }
});

// Create wallet transaction
router.post('/transactions', verifyToken, [
  body('amount').isNumeric(),
  body('transactionType').isIn(['credit', 'debit', 'transfer']),
  body('description').trim().isLength({ min: 1 })
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
      amount,
      transactionType,
      description,
      referenceType,
      referenceId,
      blockchainHash
    } = req.body;

    const userId = req.user.id;
    const transactionId = require('uuid').v4();

    // Get user's wallet
    const wallets = await executeQuery(
      'SELECT tw_id, tw_balance FROM tbl_wallets WHERE tw_user_id = ? AND tw_currency = "USDT"',
      [userId]
    );

    if (wallets.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found'
      });
    }

    const wallet = wallets[0];
    let newBalance = parseFloat(wallet.tw_balance);

    if (transactionType === 'credit') {
      newBalance += parseFloat(amount);
    } else if (transactionType === 'debit') {
      if (newBalance < parseFloat(amount)) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient balance'
        });
      }
      newBalance -= parseFloat(amount);
    }

    // Update wallet and create transaction in a transaction
    const queries = [
      {
        query: 'UPDATE tbl_wallets SET tw_balance = ?, tw_updated_at = NOW() WHERE tw_id = ?',
        params: [newBalance, wallet.tw_id]
      },
      {
        query: `INSERT INTO tbl_wallet_transactions (twt_id, twt_wallet_id, twt_user_id, twt_transaction_type, twt_amount, twt_currency, twt_description, twt_reference_type, twt_reference_id, twt_blockchain_hash, twt_status, twt_created_at) 
                VALUES (?, ?, ?, ?, ?, 'USDT', ?, ?, ?, ?, 'completed', NOW())`,
        params: [transactionId, wallet.tw_id, userId, transactionType, amount, description, referenceType, referenceId, blockchainHash]
      }
    ];

    await executeTransaction(queries);

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: {
        transactionId,
        newBalance
      }
    });

  } catch (error) {
    console.error('❌ Create transaction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create transaction'
    });
  }
});

module.exports = router;