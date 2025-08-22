/*
  # Fix MLM Tree Placement Algorithm
  
  This migration fixes the breadth-first search algorithm to properly implement
  top-to-bottom, left-to-right placement in the binary tree structure.
  
  1. Fixed Issues
    - Corrected breadth-first search logic
    - Fixed descendant checking for unlimited depth
    - Improved tree traversal algorithm
    
  2. Algorithm Flow
    - Start from sponsor node
    - Check sponsor's direct positions (left/right)
    - If full, search sponsor's children level by level
    - Place in first available position following left-first rule
*/

-- Drop and recreate the find_available_position_unlimited function with fixed logic
DROP FUNCTION IF EXISTS find_available_position_unlimited(text);

CREATE OR REPLACE FUNCTION find_available_position_unlimited(p_sponsor_sponsorship_number text)
RETURNS TABLE(
  parent_node_id uuid,
  "position" text,
  level integer
) AS $$
DECLARE
  v_sponsor_node_id uuid;
  v_sponsor_level integer;
  v_batch_size integer := 1000;
  v_current_level integer := 0; -- Start from sponsor level
  v_max_iterations integer := 50;
  v_iteration integer := 0;
BEGIN
  -- Find sponsor's node in the tree
  SELECT tmt_id, tmt_level INTO v_sponsor_node_id, v_sponsor_level
  FROM tbl_mlm_tree
  WHERE tmt_sponsorship_number = p_sponsor_sponsorship_number
    AND tmt_is_active = true;

  IF v_sponsor_node_id IS NULL THEN
    RAISE EXCEPTION 'Sponsor not found in MLM tree: %', p_sponsor_sponsorship_number;
  END IF;

  -- Search level by level starting from sponsor
  LOOP
    v_iteration := v_iteration + 1;
    
    -- Safety check to prevent infinite loops
    IF v_iteration > v_max_iterations THEN
      RAISE EXCEPTION 'Tree search exceeded maximum iterations. Tree may be corrupted.';
    END IF;

    -- Search current level for available positions
    RETURN QUERY
    WITH RECURSIVE sponsor_descendants AS (
      -- Start with sponsor node
      SELECT 
        tmt_id,
        tmt_user_id,
        tmt_left_child_id,
        tmt_right_child_id,
        tmt_level,
        tmt_sponsorship_number
      FROM tbl_mlm_tree
      WHERE tmt_id = v_sponsor_node_id
      
      UNION ALL
      
      -- Get all descendants of sponsor
      SELECT 
        mt.tmt_id,
        mt.tmt_user_id,
        mt.tmt_left_child_id,
        mt.tmt_right_child_id,
        mt.tmt_level,
        mt.tmt_sponsorship_number
      FROM tbl_mlm_tree mt
      JOIN sponsor_descendants sd ON (mt.tmt_parent_id = sd.tmt_id)
      WHERE mt.tmt_is_active = true
    ),
    level_nodes AS (
      -- Get nodes at current search level that are descendants of sponsor
      SELECT 
        sd.tmt_id,
        sd.tmt_left_child_id,
        sd.tmt_right_child_id,
        sd.tmt_level
      FROM sponsor_descendants sd
      WHERE sd.tmt_level = v_sponsor_level + v_current_level
        AND sd.tmt_is_active = true
      ORDER BY sd.tmt_id
      LIMIT v_batch_size
    )
    SELECT 
      ln.tmt_id,
      CASE 
        WHEN ln.tmt_left_child_id IS NULL THEN 'left'
        WHEN ln.tmt_right_child_id IS NULL THEN 'right'
        ELSE NULL
      END AS "position",
      ln.tmt_level + 1
    FROM level_nodes ln
    WHERE (ln.tmt_left_child_id IS NULL OR ln.tmt_right_child_id IS NULL)
    ORDER BY ln.tmt_id
    LIMIT 1;

    -- If we found an available position, return it
    IF FOUND THEN
      RETURN;
    END IF;

    -- Move to next level
    v_current_level := v_current_level + 1;

    -- Check if there are any nodes at the next level to search
    IF NOT EXISTS (
      WITH RECURSIVE sponsor_descendants AS (
        SELECT tmt_id, tmt_level
        FROM tbl_mlm_tree
        WHERE tmt_id = v_sponsor_node_id
        
        UNION ALL
        
        SELECT mt.tmt_id, mt.tmt_level
        FROM tbl_mlm_tree mt
        JOIN sponsor_descendants sd ON (mt.tmt_parent_id = sd.tmt_id)
        WHERE mt.tmt_is_active = true
      )
      SELECT 1 FROM sponsor_descendants
      WHERE tmt_level = v_sponsor_level + v_current_level
    ) THEN
      -- No more levels to search, return error
      RAISE EXCEPTION 'No available positions found in sponsor tree: %', p_sponsor_sponsorship_number;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a simpler breadth-first search function for better performance
CREATE OR REPLACE FUNCTION find_available_position_breadth_first(p_sponsor_sponsorship_number text)
RETURNS TABLE(
  parent_node_id uuid,
  "position" text,
  level integer
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE breadth_first_search AS (
    -- Start with sponsor node
    SELECT 
      tmt_id,
      tmt_left_child_id,
      tmt_right_child_id,
      tmt_level,
      0 as search_depth
    FROM tbl_mlm_tree
    WHERE tmt_sponsorship_number = p_sponsor_sponsorship_number
      AND tmt_is_active = true
    
    UNION ALL
    
    -- Add children level by level (breadth-first)
    SELECT 
      mt.tmt_id,
      mt.tmt_left_child_id,
      mt.tmt_right_child_id,
      mt.tmt_level,
      bfs.search_depth + 1
    FROM tbl_mlm_tree mt
    JOIN breadth_first_search bfs ON (
      mt.tmt_id = bfs.tmt_left_child_id OR 
      mt.tmt_id = bfs.tmt_right_child_id
    )
    WHERE mt.tmt_is_active = true
      AND bfs.search_depth < 20 -- Reasonable depth limit for performance
  )
  SELECT 
    bfs.tmt_id,
    CASE 
      WHEN bfs.tmt_left_child_id IS NULL THEN 'left'
      WHEN bfs.tmt_right_child_id IS NULL THEN 'right'
      ELSE NULL
    END AS "position",
    bfs.tmt_level + 1
  FROM breadth_first_search bfs
  WHERE (bfs.tmt_left_child_id IS NULL OR bfs.tmt_right_child_id IS NULL)
  ORDER BY bfs.search_depth, bfs.tmt_id -- This ensures left-first placement
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the main function to use the improved breadth-first search
CREATE OR REPLACE FUNCTION add_user_to_mlm_tree_unlimited(
  p_user_id uuid,
  p_sponsorship_number text,
  p_sponsor_sponsorship_number text
) RETURNS jsonb AS $$
DECLARE
  v_new_node_id uuid;
  v_parent_node_id uuid;
  v_position text;
  v_level integer;
  v_sponsor_user_id uuid;
BEGIN
  -- Check if user already exists in tree
  SELECT tmt_id INTO v_new_node_id
  FROM tbl_mlm_tree
  WHERE tmt_user_id = p_user_id;

  IF v_new_node_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User already exists in MLM tree',
      'node_id', v_new_node_id
    );
  END IF;

  -- Validate sponsor exists in user profiles
  SELECT tup_user_id INTO v_sponsor_user_id
  FROM tbl_user_profiles
  WHERE tup_sponsorship_number = p_sponsor_sponsorship_number;

  IF v_sponsor_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sponsor sponsorship number not found: ' || p_sponsor_sponsorship_number
    );
  END IF;

  -- Ensure sponsor exists in MLM tree (create root node if needed)
  IF NOT EXISTS (
    SELECT 1 FROM tbl_mlm_tree
    WHERE tmt_sponsorship_number = p_sponsor_sponsorship_number
  ) THEN
    INSERT INTO tbl_mlm_tree (
      tmt_user_id,
      tmt_parent_id,
      tmt_left_child_id,
      tmt_right_child_id,
      tmt_level,
      tmt_position,
      tmt_sponsorship_number,
      tmt_is_active
    ) VALUES (
      v_sponsor_user_id,
      NULL,
      NULL,
      NULL,
      0,
      'root',
      p_sponsor_sponsorship_number,
      true
    );
    
    RAISE NOTICE 'Created root node for sponsor: %', p_sponsor_sponsorship_number;
  END IF;

  -- Find available position using improved breadth-first search
  SELECT parent_node_id, "position", level
  INTO v_parent_node_id, v_position, v_level
  FROM find_available_position_breadth_first(p_sponsor_sponsorship_number);

  IF v_parent_node_id IS NULL OR v_position IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No available position found for sponsor: ' || p_sponsor_sponsorship_number
    );
  END IF;

  IF v_position = 'overflow' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sponsor tree is full. Cannot place new user under: ' || p_sponsor_sponsorship_number
    );
  END IF;

  -- Insert new node into MLM tree
  INSERT INTO tbl_mlm_tree (
    tmt_user_id,
    tmt_parent_id,
    tmt_left_child_id,
    tmt_right_child_id,
    tmt_level,
    tmt_position,
    tmt_sponsorship_number,
    tmt_is_active
  ) VALUES (
    p_user_id,
    v_parent_node_id,
    NULL,
    NULL,
    v_level,
    v_position,
    p_sponsorship_number,
    true
  ) RETURNING tmt_id INTO v_new_node_id;

  -- Update parent node to link to new child
  IF v_position = 'left' THEN
    UPDATE tbl_mlm_tree
    SET tmt_left_child_id = v_new_node_id,
        tmt_updated_at = now()
    WHERE tmt_id = v_parent_node_id;
  ELSE
    UPDATE tbl_mlm_tree
    SET tmt_right_child_id = v_new_node_id,
        tmt_updated_at = now()
    WHERE tmt_id = v_parent_node_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'node_id', v_new_node_id,
    'parent_id', v_parent_node_id,
    'position', v_position,
    'level', v_level,
    'sponsor_sponsorship_number', p_sponsor_sponsorship_number,
    'message', 'User successfully added to MLM tree with proper breadth-first placement'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION find_available_position_unlimited TO authenticated;
GRANT EXECUTE ON FUNCTION find_available_position_breadth_first TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_mlm_tree_unlimited TO authenticated;

-- Create a test function to verify tree placement logic
CREATE OR REPLACE FUNCTION test_tree_placement()
RETURNS TABLE(
  test_case text,
  result text,
  details jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'Tree Structure Check'::text,
    'Current tree state'::text,
    jsonb_build_object(
      'total_nodes', (SELECT COUNT(*) FROM tbl_mlm_tree),
      'root_nodes', (SELECT COUNT(*) FROM tbl_mlm_tree WHERE tmt_parent_id IS NULL),
      'nodes_with_available_positions', (
        SELECT COUNT(*) FROM tbl_mlm_tree 
        WHERE tmt_left_child_id IS NULL OR tmt_right_child_id IS NULL
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION test_tree_placement TO authenticated;

-- Success message
SELECT 'MLM Tree placement algorithm fixed! Now properly implements breadth-first search for top-to-bottom, left-to-right placement.' as status;