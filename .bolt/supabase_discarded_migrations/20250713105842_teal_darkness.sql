@@ .. @@
 -- Create user_profiles table
 CREATE TABLE IF NOT EXISTS user_profiles (
   id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
   user_id uuid REFERENCES users(id) ON DELETE CASCADE,
   first_name text,
   last_name text,
-  username text,
+  username text UNIQUE,
   mobile text,
   gender text CHECK (gender IN ('male', 'female', 'other')),
   sponsorship_number text UNIQUE,
@@ .. @@
 -- Create unique index on username
-CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key ON user_profiles(username);
+CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key ON user_profiles(username) WHERE username IS NOT NULL;