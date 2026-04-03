/*
  # Add foreign key between tbl_companies and tbl_users

  This fixes schema cache relationship errors when selecting related user data
  via Supabase and ensures referential integrity for tc_user_id.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tbl_companies_tc_user_id_fkey'
  ) THEN
    ALTER TABLE tbl_companies
      ADD CONSTRAINT tbl_companies_tc_user_id_fkey
      FOREIGN KEY (tc_user_id)
      REFERENCES tbl_users (tu_id)
      ON DELETE SET NULL;
  END IF;
END $$;
