# Security Fixes Documentation

This document explains the security issues found in your Supabase project and how they were resolved.

---

## Issue 1: Auth DB Connection Strategy is not Percentage

### What is the Problem?

Your Auth server is configured to use a **fixed number of connections** (10 connections) instead of a percentage-based allocation. This means:

- If you upgrade your database instance size, the Auth server won't automatically benefit from the additional connection capacity
- The Auth server might not be able to handle traffic spikes efficiently
- Connection pool isn't dynamically scaling with your database resources

### Why is this a Security/Performance Issue?

- **Performance Bottleneck**: Fixed connection limits can cause Auth operations to timeout during high traffic
- **Availability Risk**: Auth failures affect all users trying to log in or authenticate
- **Scalability**: Prevents your Auth system from scaling with database upgrades

### How to Fix

**Option 1: Via Supabase Dashboard (Recommended)**

1. Go to your Supabase Dashboard
2. Navigate to **Project Settings** → **Database**
3. Find **Connection Pooling** settings
4. Change Auth connection allocation from **Fixed (10)** to **Percentage**
5. Set to **10-15%** of max connections (recommended)

**Option 2: Via Supabase CLI**

```bash
supabase secrets set AUTH_DB_MAX_CONNECTIONS_PERCENTAGE=15
```

**Option 3: Via Configuration File**

If using self-hosted Supabase, update your `supabase/config.toml`:

```toml
[auth.database]
# Use percentage instead of fixed number
max_pool_size_percentage = 15
```

### Verification

After applying the fix:

1. Check Dashboard → Database → Connection Pooling
2. Verify Auth pool shows percentage (e.g., "15% of max connections")
3. Monitor connection usage under high load

---

## Issue 2 & 3: Function Search Path Mutable

### What is the Problem?

Two database functions have **mutable search_path**:
- `find_available_position_v2`
- `add_user_to_mlm_tree_v2`

These functions are marked as `SECURITY DEFINER` but don't have a fixed `search_path` setting.

### Why is this a Security Issue?

**Security Definer functions run with the privileges of the function owner**, not the caller. Without a fixed search_path:

1. **Schema Injection Attack**: An attacker could create malicious tables/functions in their own schema
2. **Privilege Escalation**: The attacker's code runs with elevated privileges
3. **Data Manipulation**: Attacker could intercept or modify data

#### Example Attack Scenario:

```sql
-- Attacker creates malicious schema
CREATE SCHEMA attacker;
SET search_path = attacker, public;

-- Attacker creates fake table that looks like tbl_mlm_tree
CREATE TABLE attacker.tbl_mlm_tree (...);

-- When victim calls the vulnerable function:
-- It uses attacker.tbl_mlm_tree instead of public.tbl_mlm_tree
-- Attacker's code runs with SECURITY DEFINER privileges!
```

### How We Fixed It

The `fix_security_issues.sql` script adds `SET search_path = public, pg_temp` to all vulnerable functions:

**Before (Vulnerable):**
```sql
CREATE OR REPLACE FUNCTION find_available_position_v2(...)
RETURNS TABLE(...)
LANGUAGE plpgsql
SECURITY DEFINER  -- ❌ No search_path set!
AS $$
BEGIN
  -- Function code
END;
$$;
```

**After (Secure):**
```sql
CREATE OR REPLACE FUNCTION find_available_position_v2(...)
RETURNS TABLE(...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- ✅ Fixed search_path!
AS $$
BEGIN
  -- Function code
END;
$$;
```

### What `SET search_path = public, pg_temp` Does

- **public**: Only search the public schema for tables/functions
- **pg_temp**: Allow temporary tables (safe, session-specific)
- **Excludes user schemas**: Prevents attacker-controlled schemas from being searched

### Additional Functions Fixed

The script also secures these functions if they exist:
- `register_customer`
- `register_company`
- `update_wallet_balance`

---

## How to Apply All Fixes

### Step 1: Run the SQL Script

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy contents of `sql_scripts/fix_security_issues.sql`
5. Click **Run**

### Step 2: Fix Auth Connection Strategy

Follow the instructions in **Issue 1** above to switch to percentage-based connections.

### Step 3: Verify the Fixes

Run this verification query in SQL Editor:

```sql
-- Check that functions have secure search_path
SELECT
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  p.proconfig as search_path_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
  'find_available_position_v2',
  'add_user_to_mlm_tree_v2',
  'register_customer',
  'register_company',
  'update_wallet_balance'
)
ORDER BY p.proname;
```

**Expected Results:**
- `is_security_definer` = `t` (true)
- `search_path_config` = `{search_path=public,pg_temp}`

---

## Impact of These Fixes

### Before Fixes:
- ❌ Auth server can't scale with database upgrades
- ❌ Vulnerable to schema injection attacks
- ❌ Risk of privilege escalation
- ❌ Potential for data manipulation

### After Fixes:
- ✅ Auth server scales automatically with database size
- ✅ Protected against schema injection attacks
- ✅ Secure SECURITY DEFINER functions
- ✅ Defense-in-depth security posture

---

## Best Practices Going Forward

### For Database Functions:

1. **Always set search_path** for SECURITY DEFINER functions:
   ```sql
   CREATE FUNCTION my_function()
   SECURITY DEFINER
   SET search_path = public, pg_temp  -- Always add this!
   AS $$ ... $$;
   ```

2. **Use SECURITY INVOKER when possible** (runs with caller's privileges):
   ```sql
   CREATE FUNCTION my_function()
   SECURITY INVOKER  -- Safer when appropriate
   AS $$ ... $$;
   ```

3. **Validate all inputs** in SECURITY DEFINER functions
4. **Use qualified names** when referencing objects: `public.table_name`

### For Connection Management:

1. Use **percentage-based** connection allocation
2. Monitor connection pool usage regularly
3. Set appropriate percentages:
   - Auth: 10-15%
   - REST API: 50-60%
   - Realtime: 10-15%
   - Storage: 5-10%

---

## Resources

- [PostgreSQL SECURITY DEFINER Best Practices](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [PostgreSQL Search Path](https://www.postgresql.org/docs/current/ddl-schemas.html#DDL-SCHEMAS-PATH)

---

## Questions?

If you encounter any issues after applying these fixes:

1. Check the Supabase logs for any function errors
2. Verify RLS policies still work correctly
3. Test user registration and MLM tree operations
4. Monitor Auth server performance

All fixes are backward-compatible and should not break existing functionality.
