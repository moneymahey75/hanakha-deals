/*
  # Fixed MLM Tree Integration

  - Handles tree placement with breadth-first search
  - Fixes 'position' keyword usage
  - Adds RLS policies and security
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
        SELECT
            tmt_id,
            tmt_left_child_id,
            tmt_right_child_id,
            tmt_level,
            0 as search_depth
        FROM tbl_mlm_tree
        WHERE tmt_id = v_sponsor_node_id

        UNION ALL

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
    WHERE ts.tmt_left_child_id IS NULL OR ts.tmt_right_child_id IS NULL
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
    -- Check if user already exists
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

    -- Ensure sponsor exists in user profiles
    IF NOT EXISTS (
        SELECT 1 FROM tbl_user_profiles
        WHERE tup_sponsorship_number = p_sponsor_sponsorship_number
    ) THEN
        RETURN jsonb_build_object(
                'success', false,
                'error', 'Sponsor sponsorship number not found: ' || p_sponsor_sponsorship_number
               );
    END IF;

    -- Ensure sponsor exists in MLM tree (or create root node)
    IF NOT EXISTS (
        SELECT 1 FROM tbl_mlm_tree
        WHERE tmt_sponsorship_number = p_sponsor_sponsorship_number
    ) THEN
        DECLARE v_sponsor_user_id uuid;
        BEGIN
            SELECT tup_user_id INTO v_sponsor_user_id
            FROM tbl_user_profiles
            WHERE tup_sponsorship_number = p_sponsor_sponsorship_number;

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
        END;
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

    -- Link new node to parent
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

-- Granting access and policies
GRANT EXECUTE ON FUNCTION find_available_position_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_mlm_tree_v2 TO authenticated;

-- Create RLS policies for tbl_mlm_tree
DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'tbl_mlm_tree' AND policyname = 'Users can read MLM tree data'
        ) THEN
            CREATE POLICY "Users can read MLM tree data" ON tbl_mlm_tree
                FOR SELECT TO authenticated
                USING (true);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'tbl_mlm_tree' AND policyname = 'Users can insert into MLM tree'
        ) THEN
            CREATE POLICY "Users can insert into MLM tree" ON tbl_mlm_tree
                FOR INSERT TO authenticated
                WITH CHECK (auth.uid() = tmt_user_id);
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'tbl_mlm_tree' AND policyname = 'Users can update MLM tree'
        ) THEN
            CREATE POLICY "Users can update MLM tree" ON tbl_mlm_tree
                FOR UPDATE TO authenticated
                USING (true);
        END IF;
    END $$;
