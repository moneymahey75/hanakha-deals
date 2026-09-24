// Run: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node supabase/tests/withdrawal_joining_rules.mjs
// Isolated PostgreSQL fixtures: never connects to a project database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
SET request.jwt.claims = '{"role":"service_role"}';
CREATE TABLE tbl_system_settings(tss_setting_key text PRIMARY KEY,tss_setting_value jsonb,tss_description text);
ALTER TABLE tbl_system_settings ENABLE ROW LEVEL SECURITY;
CREATE TABLE tbl_subscription_plans(tsp_id uuid PRIMARY KEY,tsp_price numeric,tsp_product_code text,tsp_plan_phase text);
CREATE TABLE tbl_users(tu_id uuid PRIMARY KEY,tu_created_at timestamptz,tu_is_active boolean DEFAULT true,tu_is_dummy boolean DEFAULT false,tu_registration_paid boolean DEFAULT true);
CREATE TABLE tbl_referral_closure(trc_ancestor_user_id uuid,trc_descendant_user_id uuid,trc_depth int);
CREATE TABLE tbl_user_subscriptions(tus_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tus_user_id uuid,tus_plan_id uuid,tus_start_date timestamptz,tus_status text,tus_package_kind text,tus_plan_phase text,tus_payment_amount numeric);
CREATE TABLE tbl_wallets(tw_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tw_user_id uuid,tw_currency text DEFAULT 'USDT',tw_wallet_type text,tw_balance numeric,tw_reserved_balance numeric DEFAULT 0,tw_updated_at timestamptz);
CREATE TABLE tbl_wallet_transactions(twt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),twt_wallet_id uuid,twt_user_id uuid,twt_transaction_type text,twt_amount numeric,twt_description text,twt_reference_type text,twt_reference_id uuid,twt_status text,twt_created_at timestamptz DEFAULT now());
CREATE TABLE tbl_withdrawal_requests(twr_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),twr_user_id uuid,twr_wallet_type text,twr_status text DEFAULT 'pending',twr_blockchain_tx text,twr_amount numeric);
INSERT INTO tbl_subscription_plans VALUES
('10000000-0000-0000-0000-000000000050',50,null,'launch'),
('10000000-0000-0000-0000-000000000100',100,null,'launch'),
('10000000-0000-0000-0000-000000000200',200,null,'launch'),
('10000000-0000-0000-0000-000000000020',20,'autopool_20','prelaunch');
`);
await db.exec(await readFile(new URL('../migrations/20260925090000_require_new_joinings_for_withdrawals.sql', import.meta.url),'utf8'));
const user = '20000000-0000-0000-0000-000000000001';
let sequence = 10;
const id = () => `20000000-0000-0000-0000-${String(sequence++).padStart(12,'0')}`;
const plan = amount => `10000000-0000-0000-0000-${String(amount).padStart(12,'0')}`;
let rules = (await db.query("SELECT tss_setting_value FROM tbl_system_settings")).rows[0].tss_setting_value;
assert.equal(rules.launch.required_count,1);
assert.equal(rules.launch.from_date,'2026-09-25');
const save = async (value=rules) => db.query("UPDATE tbl_system_settings SET tss_setting_value=$1 WHERE tss_setting_key='withdrawal_joining_rules'",[JSON.stringify(value)]);
rules.launch.from_date = rules.autopool.from_date = '2020-01-02';
await save();
const status = async (wallet='working', uid=user) => (await db.query('SELECT get_withdrawal_joining_status($1,$2) AS result',[uid,wallet])).rows[0].result;
const join = async ({ amount=50, date='2020-01-02T00:00:00+05:30', kind='registration', depth=1, active=true, dummy=false, paid=true }={}) => {
 const uid=id();
 await db.query('INSERT INTO tbl_users VALUES($1,$2,$3,$4,$5)',[uid,date,active,dummy,paid]);
 await db.query('INSERT INTO tbl_referral_closure VALUES($1,$2,$3)',[user,uid,depth]);
 await db.query("INSERT INTO tbl_user_subscriptions(tus_user_id,tus_plan_id,tus_start_date,tus_status,tus_package_kind,tus_plan_phase,tus_payment_amount) VALUES($1,$2,$3,'active',$4,$5,$6)",[uid,plan(amount),date,kind,amount===20?'prelaunch':'launch',amount]);
 return uid;
};
const request = async (wallet='working') => (await db.query('INSERT INTO tbl_withdrawal_requests(twr_user_id,twr_wallet_type,twr_amount) VALUES($1,$2,10) RETURNING twr_id',[user,wallet])).rows[0].twr_id;
assert.equal((await status()).eligible,false);
await assert.rejects(request(),/Joinings still needed/);
await join({ date:'2020-01-01T23:59:59+05:30' });
await join({ depth:2 }); await join({ kind:'upgrade' }); await join({ kind:'renew' });
await join({ active:false }); await join({ dummy:true }); await join({ paid:false });
assert.equal((await status()).qualified_count,0);
const direct = await join();
assert.equal((await status()).eligible,true);
assert.equal((await status('reward')).eligible,true);
assert.equal((await status('non_working')).eligible,true);
assert.equal((await status('autopool')).eligible,false);
assert.equal((await status('working',id())).eligible,false);
await request(); await request(); // eligibility is not consumed
rules.launch.required_count=2; await save();
assert.equal((await status()).eligible,false);
await db.query("INSERT INTO tbl_user_subscriptions(tus_user_id,tus_plan_id,tus_start_date,tus_status,tus_package_kind,tus_payment_amount) VALUES($1,$2,'2020-01-03','active','registration',50)",[direct,plan(50)]);
assert.equal((await status()).qualified_count,1); // never double count a person
await join({amount:100});
assert.equal((await status()).eligible,true);
rules.launch.plan_amounts=[200]; await save();
assert.equal((await status()).qualified_count,0);
await join({amount:200});
assert.equal((await status()).qualified_count,1);
await join({amount:20,kind:'upgrade'}); // existing AutoPool schema labels first purchases upgrade
assert.equal((await status('autopool')).eligible,true);
rules.launch.enabled=false; await save();
assert.equal((await status()).eligible,true);
rules.launch.enabled=true; rules.launch.required_count=1; await save();
await db.query("INSERT INTO tbl_wallets(tw_user_id,tw_wallet_type,tw_balance) VALUES($1,'working',100)",[user]);
const debitRequest=await request();
const debit=async () => (await db.query('SELECT debit_wallet_for_withdrawal($1) AS result',[debitRequest])).rows[0].result;
assert.equal((await debit()).success,true);
assert.equal((await debit()).reused,true);
assert.equal(Number((await db.query('SELECT tw_balance FROM tbl_wallets')).rows[0].tw_balance),90);
assert.equal((await status()).eligible,true);
const pending=await request();
rules.launch.from_date='2099-01-01'; await save();
assert.equal((await debit()).reused,true); // retry never charges twice or strands already debited funds
await assert.rejects(db.query('SELECT debit_wallet_for_withdrawal($1)',[pending]),/Joinings still needed/);
await db.query("UPDATE tbl_withdrawal_requests SET twr_status='rejected' WHERE twr_id=$1",[pending]);
await assert.rejects(db.query("UPDATE tbl_withdrawal_requests SET twr_status='processing' WHERE twr_id=$1",[pending]),/Joinings still needed/);
for (const patch of [{required_count:0},{required_count:1.5},{plan_amounts:[]},{from_date:'invalid'},{from_date:'2020-02-31'},{plan_amounts:[75]},{enabled:'yes'}]) {
 await assert.rejects(save({...rules,launch:{...rules.launch,...patch}}));
}
await assert.rejects(save({...rules,autopool:{...rules.autopool,plan_amounts:[99]}}));
// JSON-encoded settings from the existing admin endpoint normalize to an object.
await db.query("UPDATE tbl_system_settings SET tss_setting_value=$1",[JSON.stringify(JSON.stringify(rules))]);
assert.equal((await db.query('SELECT jsonb_typeof(tss_setting_value) AS kind FROM tbl_system_settings')).rows[0].kind,'object');
await db.exec(`SET request.jwt.claims = '{"role":"authenticated"}'; SET test.uid = '${user}';`);
await status();
await assert.rejects(status('working',id()),/Not authorized/);
await assert.rejects(status('unknown'),/Invalid withdrawal/);
await db.close();
console.log('Withdrawal joining rules: all PostgreSQL integration checks passed.');
