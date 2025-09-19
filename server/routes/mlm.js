const express = require('express');
const { pool } = require('../config/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get MLM tree structure
router.get('/tree/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const maxLevels = parseInt(req.query.maxLevels) || 5;

    // Get tree structure (simplified version)
    const [treeNodes] = await pool.execute(
      `SELECT t.*, p.tup_first_name, p.tup_last_name, p.tup_username, u.tu_email 
       FROM tbl_mlm_tree t 
       LEFT JOIN tbl_user_profiles p ON t.tmt_user_id = p.tup_user_id 
       LEFT JOIN tbl_users u ON t.tmt_user_id = u.tu_id 
       WHERE t.tmt_is_active = true 
       ORDER BY t.tmt_level, t.tmt_created_at`,
      []
    );

    res.json({
      success: true,
      data: treeNodes
    });

  } catch (error) {
    console.error('Get MLM tree error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get MLM tree structure'
    });
  }
});

// Get tree statistics
router.get('/stats/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Get basic stats (simplified)
    const [stats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_downline,
        0 as left_side_count,
        0 as right_side_count,
        0 as direct_referrals,
        0 as max_depth,
        COUNT(*) as active_members
       FROM tbl_mlm_tree 
       WHERE tmt_user_id = ? AND tmt_is_active = true`,
      [userId]
    );

    res.json({
      success: true,
      data: stats[0] || {
        total_downline: 0,
        left_side_count: 0,
        right_side_count: 0,
        direct_referrals: 0,
        max_depth: 0,
        active_members: 0
      }
    });

  } catch (error) {
    console.error('Get tree stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tree statistics'
    });
  }
});

// Add user to MLM tree
router.post('/add-user', verifyToken, async (req, res) => {
  try {
    const { userId, sponsorshipNumber, sponsorSponsorshipNumber } = req.body;

    // Simplified MLM tree placement
    const nodeId = require('uuid').v4();

    await pool.execute(
      `INSERT INTO tbl_mlm_tree (tmt_id, tmt_user_id, tmt_sponsorship_number, tmt_level, tmt_position, tmt_is_active) 
       VALUES (?, ?, ?, 0, 'root', true)`,
      [nodeId, userId, sponsorshipNumber]
    );

    res.json({
      success: true,
      message: 'User added to MLM tree successfully',
      data: {
        node_id: nodeId,
        level: 0,
        position: 'root'
      }
    });

  } catch (error) {
    console.error('Add user to MLM tree error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add user to MLM tree'
    });
  }
});

module.exports = router;