/*
  # Fix Coupon Creation by Admins

  1. Changes
    - Make tc_created_by nullable to allow admins to create coupons
    - Admin UIDs won't be in tbl_users, so this field can be null for admin-created coupons
    - Add tc_created_by_admin_uid column to track which admin created the coupon
    
  2. Security
    - Maintains existing RLS policies
    - Admins can still manage all coupons through admin policies
*/

-- Make tc_created_by nullable
ALTER TABLE tbl_coupons
ALTER COLUMN tc_created_by DROP NOT NULL;

-- Add column to track admin creator
ALTER TABLE tbl_coupons
ADD COLUMN IF NOT EXISTS tc_created_by_admin_uid uuid REFERENCES auth.users(id);

-- Add comment for clarity
COMMENT ON COLUMN tbl_coupons.tc_created_by IS 'User ID from tbl_users if created by a company/user, NULL if created by admin';
COMMENT ON COLUMN tbl_coupons.tc_created_by_admin_uid IS 'Admin auth UID if coupon was created by an admin';