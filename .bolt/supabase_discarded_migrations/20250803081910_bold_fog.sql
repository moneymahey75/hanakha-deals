-- Function to find available position with unlimited depth
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
    v_current_level integer := 1;
    v_max_iterations integer := 50;
    v_iteration integer := 0;
BEGIN
    SELECT tmt_id, tmt_level INTO v_sponsor_node_id, v_sponsor_level
    FROM tbl_mlm_tree
    WHERE tmt_sponsorship_number = p_sponsor_sponsorship_number
      AND tmt_is_active = true;

    IF v_sponsor_node_id IS NULL THEN
        RAISE EXCEPTION 'Sponsor not found in MLM tree: %', p_sponsor_sponsorship_number;
    END IF;

    LOOP
        v_iteration := v_iteration + 1;

        IF v_iteration > v_max_iterations THEN
            RAISE EXCEPTION 'Tree search exceeded maximum iterations.';
        END IF;

        RETURN QUERY
            WITH level_nodes AS (
                SELECT
                    tmt_id,
                    tmt_left_child_id,
                    tmt_right_child_id,
                    tmt_level
                FROM tbl_mlm_tree
                WHERE tmt_level = v_sponsor_level + v_current_level - 1
                  AND tmt_is_active = true
                  AND (
                    (v_current_level = 1 AND tmt_id = v_sponsor_node_id) OR
                    (v_current_level > 1 AND EXISTS (
                        SELECT 1 FROM tbl_mlm_tree ancestor
                        WHERE ancestor.tmt_sponsorship_number = p_sponsor_sponsorship_number
                          AND ancestor.tmt_level < tmt_level
                    ))
                    )
                ORDER BY tmt_id
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

        IF FOUND THEN
            RETURN;
        END IF;

        v_current_level := v_current_level + 1;

        IF NOT EXISTS (
            SELECT 1 FROM tbl_mlm_tree
            WHERE tmt_level = v_sponsor_level + v_current_level - 1
              AND tmt_is_active = true
        ) THEN
            RETURN QUERY
                SELECT
                    v_sponsor_node_id,
                    CASE
                        WHEN tmt_left_child_id IS NULL THEN 'left'
                        WHEN tmt_right_child_id IS NULL THEN 'right'
                        ELSE 'overflow'
                        END,
                    tmt_level + 1
                FROM tbl_mlm_tree
                WHERE tmt_id = v_sponsor_node_id;

            RETURN;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add user to MLM tree with unlimited depth
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

    SELECT tup_user_id INTO v_sponsor_user_id
    FROM tbl_user_profiles
    WHERE tup_sponsorship_number = p_sponsor_sponsorship_number;

    IF v_sponsor_user_id IS NULL THEN
        RETURN jsonb_build_object(
                'success', false,
                'error', 'Sponsor sponsorship number not found: ' || p_sponsor_sponsorship_number
               );
    END IF;

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

    SELECT parent_node_id, "position", level
    INTO v_parent_node_id, v_position, v_level
    FROM find_available_position_unlimited(p_sponsor_sponsorship_number);

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
            'message', 'User successfully added to MLM tree with unlimited depth'
           );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to place user at specific pre-calculated position
CREATE OR REPLACE FUNCTION place_user_at_position(
    p_user_id uuid,
    p_sponsorship_number text,
    p_parent_node_id uuid,
    p_position text,
    p_level integer
) RETURNS jsonb AS $$
DECLARE
    v_new_node_id uuid;
BEGIN
    IF p_position NOT IN ('left', 'right') THEN
        RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid position: ' || p_position
               );
    END IF;

    IF p_position = 'left' AND EXISTS (
        SELECT 1 FROM tbl_mlm_tree WHERE tmt_id = p_parent_node_id AND tmt_left_child_id IS NOT NULL
    ) THEN
        RETURN jsonb_build_object(
                'success', false,
                'error', 'Left position is no longer available'
               );
    END IF;

    IF p_position = 'right' AND EXISTS (
        SELECT 1 FROM tbl_mlm_tree WHERE tmt_id = p_parent_node_id AND tmt_right_child_id IS NOT NULL
    ) THEN
        RETURN jsonb_build_object(
                'success', false,
                'error', 'Right position is no longer available'
               );
    END IF;

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
                 p_parent_node_id,
                 NULL,
                 NULL,
                 p_level,
                 p_position,
                 p_sponsorship_number,
                 true
             ) RETURNING tmt_id INTO v_new_node_id;

    IF p_position = 'left' THEN
        UPDATE tbl_mlm_tree
        SET tmt_left_child_id = v_new_node_id,
            tmt_updated_at = now()
        WHERE tmt_id = p_parent_node_id;
    ELSE
        UPDATE tbl_mlm_tree
        SET tmt_right_child_id = v_new_node_id,
            tmt_updated_at = now()
        WHERE tmt_id = p_parent_node_id;
    END IF;

    RETURN jsonb_build_object(
            'success', true,
            'node_id', v_new_node_id,
            'parent_id', p_parent_node_id,
            'position', p_position,
            'level', p_level,
            'message', 'User placed at pre-calculated position'
           );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to rebuild available positions queue (e.g., for Redis)
CREATE OR REPLACE FUNCTION rebuild_available_positions_queue()
    RETURNS jsonb AS $$
DECLARE
    v_available_count integer := 0;
    v_node_record record;
BEGIN
    FOR v_node_record IN
        SELECT
            tmt_id,
            tmt_user_id,
            tmt_level,
            tmt_sponsorship_number,
            CASE
                WHEN tmt_left_child_id IS NULL THEN 'left'
                WHEN tmt_right_child_id IS NULL THEN 'right'
                ELSE NULL
                END AS "position"
        FROM tbl_mlm_tree
        WHERE tmt_is_active = true
          AND (tmt_left_child_id IS NULL OR tmt_right_child_id IS NULL)
        ORDER BY tmt_level, tmt_id
        LOOP
            IF v_node_record."position" IS NOT NULL THEN
                v_available_count := v_available_count + 1;
                RAISE NOTICE 'Available position: Node %, Position %, Level %',
                    v_node_record.tmt_id,
                    v_node_record."position",
                    v_node_record.tmt_level + 1;
            END IF;
        END LOOP;

    RETURN jsonb_build_object(
            'success', true,
            'available_positions_found', v_available_count,
            'message', 'Available positions queue rebuilt'
           );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT EXECUTE ON FUNCTION find_available_position_unlimited TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_mlm_tree_unlimited TO authenticated;
GRANT EXECUTE ON FUNCTION place_user_at_position TO authenticated;
GRANT EXECUTE ON FUNCTION rebuild_available_positions_queue TO authenticated;
