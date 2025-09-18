const express = require('express');
const { executeQuery } = require('../config/database');
const { verifyToken } = require('../middleware/auth');
const router = express.Router();

// Get MLM tree structure
router.get('/tree/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { maxLevels = 5 } = req.query;

    // Check access permissions
    if (req.user.id !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get tree structure using recursive CTE
    const treeData = await executeQuery(
      `WITH RECURSIVE tree_cte AS (
        SELECT 
          t.tmt_id as node_id,
          t.tmt_user_id as user_id,
          t.tmt_parent_id as parent_id,
          t.tmt_left_child_id as left_child_id,
          t.tmt_right_child_id as right_child_id,
          t.tmt_level as level,
          t.tmt_position as position,
          t.tmt_sponsorship_number as sponsorship_number,
          t.tmt_is_active as is_active,
          p.tup_first_name as first_name,
          p.tup_last_name as last_name,
          u.tu_email as user_email,
          p.tup_username as username,
          0 as depth
        FROM tbl_mlm_tree t
        JOIN tbl_users u ON t.tmt_user_id = u.tu_id
        LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
        WHERE t.tmt_user_id = ?
        
        UNION ALL
        
        SELECT 
          t.tmt_id,
          t.tmt_user_id,
          t.tmt_parent_id,
          t.tmt_left_child_id,
          t.tmt_right_child_id,
          t.tmt_level,
          t.tmt_position,
          t.tmt_sponsorship_number,
          t.tmt_is_active,
          p.tup_first_name,
          p.tup_last_name,
          u.tu_email,
          p.tup_username,
          tc.depth + 1
        FROM tbl_mlm_tree t
        JOIN tbl_users u ON t.tmt_user_id = u.tu_id
        LEFT JOIN tbl_user_profiles p ON u.tu_id = p.tup_user_id
        JOIN tree_cte tc ON (t.tmt_parent_id = tc.node_id)
        WHERE tc.depth < ?
      )
      SELECT * FROM tree_cte ORDER BY level, position`,
      [userId, parseInt(maxLevels)]
    );

    res.json({
      success: true,
      data: treeData
    });

  } catch (error) {
    console.error('❌ Get tree structure error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tree structure'
    });
  }
});

// Get tree statistics
router.get('/stats/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check access permissions
    if (req.user.id !== userId && req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get user's tree node
    const userNodes = await executeQuery(
      'SELECT tmt_id FROM tbl_mlm_tree WHERE tmt_user_id = ?',
      [userId]
    );

    if (userNodes.length === 0) {
      return res.json({
        success: true,
        data: {
          total_downline: 0,
          left_side_count: 0,
          right_side_count: 0,
          direct_referrals: 0,
          max_depth: 0,
          active_members: 0
        }
      });
    }

    const userNodeId = userNodes[0].tmt_id;

    // Calculate statistics
    const stats = await executeQuery(
      `WITH RECURSIVE downline_cte AS (
        SELECT tmt_id, tmt_user_id, tmt_level, tmt_position, tmt_is_active, 0 as depth
        FROM tbl_mlm_tree 
        WHERE tmt_parent_id = ?
        
        UNION ALL
        
        SELECT t.tmt_id, t.tmt_user_id, t.tmt_level, t.tmt_position, t.tmt_is_active, d.depth + 1
        FROM tbl_mlm_tree t
        JOIN downline_cte d ON t.tmt_parent_id = d.tmt_id
        WHERE d.depth < 10
      )
      SELECT 
        COUNT(*) as total_downline,
        SUM(CASE WHEN tmt_position = 'left' AND depth = 0 THEN 1 ELSE 0 END) as direct_left,
        SUM(CASE WHEN tmt_position = 'right' AND depth = 0 THEN 1 ELSE 0 END) as direct_right,
        SUM(CASE WHEN tmt_is_active = true THEN 1 ELSE 0 END) as active_members,
        MAX(depth) as max_depth
      FROM downline_cte`,
      [userNodeId]
    );

    const result = stats[0] || {};

    res.json({
      success: true,
      data: {
        total_downline: result.total_downline || 0,
        left_side_count: result.direct_left || 0,
        right_side_count: result.direct_right || 0,
        direct_referrals: (result.direct_left || 0) + (result.direct_right || 0),
        max_depth: result.max_depth || 0,
        active_members: result.active_members || 0
      }
    });

  } catch (error) {
    console.error('❌ Get tree stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tree statistics'
    });
  }
});

// Add user to MLM tree
router.post('/add-user', verifyToken, [
  body('userId').isUUID(),
  body('sponsorshipNumber').isLength({ min: 1 }),
  body('sponsorSponsorshipNumber').isLength({ min: 1 })
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

    const { userId, sponsorshipNumber, sponsorSponsorshipNumber } = req.body;

    // Find sponsor in tree
    const sponsors = await executeQuery(
      'SELECT tmt_id, tmt_level FROM tbl_mlm_tree WHERE tmt_sponsorship_number = ?',
      [sponsorSponsorshipNumber]
    );

    if (sponsors.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sponsor not found in MLM tree'
      });
    }

    // Find optimal placement using breadth-first search
    const placement = await findOptimalPlacement(sponsors[0].tmt_id);

    if (!placement) {
      return res.status(400).json({
        success: false,
        error: 'No available position found'
      });
    }

    // Add user to tree
    const nodeId = require('uuid').v4();
    await executeQuery(
      `INSERT INTO tbl_mlm_tree (tmt_id, tmt_user_id, tmt_parent_id, tmt_level, tmt_position, tmt_sponsorship_number, tmt_is_active, tmt_created_at, tmt_updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, true, NOW(), NOW())`,
      [nodeId, userId, placement.parentId, placement.level, placement.position, sponsorshipNumber]
    );

    // Update parent's child reference
    const updateField = placement.position === 'left' ? 'tmt_left_child_id' : 'tmt_right_child_id';
    await executeQuery(
      `UPDATE tbl_mlm_tree SET ${updateField} = ? WHERE tmt_id = ?`,
      [nodeId, placement.parentId]
    );

    res.status(201).json({
      success: true,
      message: 'User added to MLM tree successfully',
      data: {
        nodeId,
        parentId: placement.parentId,
        position: placement.position,
        level: placement.level
      }
    });

  } catch (error) {
    console.error('❌ Add user to tree error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add user to MLM tree'
    });
  }
});

// Helper function to find optimal placement
async function findOptimalPlacement(startNodeId) {
  const queue = [startNodeId];
  const visited = new Set();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    
    if (visited.has(currentNodeId)) continue;
    visited.add(currentNodeId);

    const nodes = await executeQuery(
      'SELECT tmt_id, tmt_left_child_id, tmt_right_child_id, tmt_level FROM tbl_mlm_tree WHERE tmt_id = ?',
      [currentNodeId]
    );

    if (nodes.length === 0) continue;

    const node = nodes[0];

    // Check for available positions
    if (!node.tmt_left_child_id) {
      return {
        parentId: currentNodeId,
        position: 'left',
        level: node.tmt_level + 1
      };
    }

    if (!node.tmt_right_child_id) {
      return {
        parentId: currentNodeId,
        position: 'right',
        level: node.tmt_level + 1
      };
    }

    // Add children to queue
    if (node.tmt_left_child_id) queue.push(node.tmt_left_child_id);
    if (node.tmt_right_child_id) queue.push(node.tmt_right_child_id);
  }

  return null;
}

module.exports = router;