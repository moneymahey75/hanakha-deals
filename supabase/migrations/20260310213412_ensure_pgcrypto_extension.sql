/*
  # Ensure pgcrypto Extension is Available

  1. Purpose
    - Ensures pgcrypto extension is enabled and accessible
    - Makes cryptographic functions like gen_salt and crypt available

  2. Changes
    - Creates pgcrypto extension if not exists
    - Ensures functions are accessible in current schema
*/

-- Enable pgcrypto extension (it's already installed, just making sure it's created)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Grant usage on extensions schema to authenticated and anon roles
GRANT USAGE ON SCHEMA extensions TO authenticated, anon, postgres, service_role;
