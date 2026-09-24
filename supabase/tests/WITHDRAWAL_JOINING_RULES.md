# Withdrawal joining requirements

Deploy `20260925090000_require_new_joinings_for_withdrawals.sql`, the updated
`request-withdrawal` Edge Function, and the frontend together. Apply the migration
before deploying the frontend/function. This change does not apply migrations to
any remote database automatically.

Admin → Payment Settings → New joinings required for withdrawal controls both
rules in one JSON setting, `withdrawal_joining_rules`. Defaults are enabled,
one joining since September 25, 2026 at 00:00 Asia/Kolkata. Launch accepts an
initial 50, 100, or 200 USDT package; AutoPool accepts the existing 20 USDT plan.
Multiple selected amounts mean any of those exact amounts, not a minimum price.

Rules are selected by the wallet: AutoPool uses its own rule; working, reward/ROI,
and non-working wallets use Launch. All users are covered. Count distinct direct
referrals (depth 1 in the existing sponsor closure), not matrix positions. Both
account creation and qualifying package purchase must be on/after the cutoff.
The account must be active, registration-paid and non-dummy. Launch counts the
registration package; AutoPool counts the first AutoPool purchase (the existing
schema labels those purchases `upgrade`). Repeat purchases, renewals, Launch
upgrades and deeper referrals do not increase the count. Exhausted/expired paid
packages still count; cancelled/inactive packages do not. Historical purchase
amounts are used so editing plan prices does not change existing qualifications.

Meeting the count is not consumed by a withdrawal. Current admin rules are
re-evaluated for new requests and before the first debit of pending requests.
Already-debited retries remain idempotent. Cancellation, rejection and refunds
remain available. Changing the date/count/plans can change existing users'
eligibility; disabling the relevant rule removes that requirement.

The migration enforces settings validation, authenticated self-only eligibility
lookups, request insert/update checks, and a check at the wallet debit boundary.
The Edge Function and customer UI use the same database eligibility calculation.

Run isolated integration tests with Node and `@electric-sql/pglite` installed in a
temporary directory, without touching production:

```sh
npm install --prefix /private/tmp/withdrawal-rule-tests @electric-sql/pglite --no-audit --no-fund
PGLITE_MODULE=/private/tmp/withdrawal-rule-tests/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/withdrawal_joining_rules.mjs
```

Tests cover defaults, inclusive India-time cutoff, earlier members, direct versus
deep referrals, duplicates, invalid/dummy/unpaid users, exact plan amounts,
Launch/AutoPool isolation, repeat withdrawals, configurable counts/dates,
disabling rules, input validation, JSON-string normalization, pending request
rechecks, debit idempotence, cancellation and authorization.
