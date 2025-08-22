/*
  # MLM Tree Database Functions v2 - Fixed

  Adjustments:
    - Wrapped "position" in double quotes to avoid conflicts with PostgreSQL reserved keywords
*/

-- Function to find available position in MLM tree using breadth-first search
CREATE OR REPLACE FUNCTION find_available_position_v2(p_sponsor_sponsorship_number text)
    RETURNS TABLE(
                     parent_node_id uuid,
                     "position" text,
                     level integer
                 ) AS $$
DECLARE
    v_sponsor_node_id uuid;
    v_sponsor_level integer;
BEGIN
    -- Find sponsor's node in the tree
    SELECT tmt_id, tmt_level INTO v_sponsor_node_id, v_sponsor_level
    FROM tbl_mlm_tree
    WHERE tmt_sponsorship_number = p_sponsor_sponsorship_number
      AND tmt_is_active = true;

    IF v_sponsor_node_id IS NULL THEN
        RAISE EXCEPTION 'Sponsor not found in MLM tree: %', p_sponsor_sponsorship_number;
    END IF;

    -- Use breadth-first search to find first available position
    WITH RECURSIVE tree_search AS (
        -- Start with sponsor node
        SELECT
            tmt_id,
            tmt_left_child_id,
            tmt_right_child_id,
            tmt_level,
            0 as search_depth
        FROM tbl_mlm_tree
        WHERE tmt_id = v_sponsor_node_id

        UNION ALL

        -- Recursively search children (breadth-first)
        SELECT
            mt.tmt_id,
            mt.tmt_left_child_id,
            mt.tmt_right_child_id,
            mt.tmt_level,
            ts.search_depth + 1
        FROM tbl_mlm_tree mt
                 JOIN tree_search ts ON (mt.tmt_id = ts.tmt_left_child_id OR mt.tmt_id = ts.tmt_right_child_id)
        WHERE ts.search_depth < 10
    )
    SELECT
        ts.tmt_id as parent_node_id,
        CASE
            WHEN ts.tmt_left_child_id IS NULL THEN 'left'
            WHEN ts.tmt_right_child_id IS NULL THEN 'right'
            ELSE NULL
            END as "position",
        ts.tmt_level + 1 as level
    FROM tree_search ts
    WHERE (ts.tmt_left_child_id IS NULL OR ts.tmt_right_child_id IS NULL)
    ORDER BY ts.search_depth, ts.tmt_id
    LIMIT 1;

    -- If no position found in tree, place directly under sponsor
    IF NOT FOUND THEN
        SELECT
            v_sponsor_node_id as parent_node_id,
            CASE
                WHEN tmt_left_child_id IS NULL THEN 'left'
                WHEN tmt_right_child_id IS NULL THEN 'right'
                ELSE 'overflow'
                END as "position",
            tmt_level + 1 as level
        FROM tbl_mlm_tree
        WHERE tmt_id = v_sponsor_node_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to add user to MLM tree
CREATE OR REPLACE FUNCTION add_user_to_mlm_tree_v2(
    p_user_id uuid,
    p_sponsorship_number text,
    p_sponsor_sponsorship_number text
) RETURNS jsonb AS $$
DECLARE
    v_new_node_id uuid;
    v_parent_node_id uuid;
    v_position text;
    v_level integer;
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

    -- Find available position
    SELECT parent_node_id, "position", level
    INTO v_parent_node_id, v_position, v_level
    FROM find_available_position_v2(p_sponsor_sponsorship_number);

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

    -- Insert new node
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
            'message', 'User successfully added to MLM tree'
           );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ✅ No changes required to the other two functions unless "position" is used as a column alias.
-- If you want me to review those two (`get_mlm_tree_structure_v2`, `get_tree_statistics_v2`), let me know.

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION find_available_position_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_mlm_tree_v2 TO authenticated;
