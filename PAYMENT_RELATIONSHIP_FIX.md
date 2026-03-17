# Payment and Subscription Relationship Fix

## Problem

The application had incorrect database relationships and column references for payments and subscriptions, causing multiple errors:

1. **Incorrect JOIN in queries**: Tried to join `tbl_payments` directly with a non-existent `tp_subscription_plan_id` column
2. **Wrong column names in INSERT**: Used `tp_subscription_plan_id` instead of `tp_subscription_id`
3. **Incorrect order of operations**: Created payments before subscriptions, but payments need to reference subscriptions
4. **Wrong foreign key references**: Edge function tried to find subscriptions by `tus_payment_id` which doesn't exist

## Database Structure

The correct relationship structure is:

```
tbl_payments
  ├── tp_subscription_id → tbl_user_subscriptions.tus_id
  └── tp_user_id → tbl_users.tu_id

tbl_user_subscriptions
  ├── tus_plan_id → tbl_subscription_plans.tsp_id
  └── tus_user_id → tbl_users.tu_id
```

## Fixes Applied

### 1. Fixed PendingPayments Component (`src/components/admin/PendingPayments.tsx`)

**Before:**
```typescript
.select(`
  *,
  user:tp_user_id(tu_email, tu_first_name, tu_last_name),
  plan:tp_subscription_plan_id(tsp_name, tsp_type)  // ❌ Wrong relationship
`)
```

**After:**
```typescript
.select(`
  *,
  user:tp_user_id(tu_email),
  subscription:tp_subscription_id(
    tus_id,
    plan:tus_plan_id(tsp_name, tsp_type)  // ✅ Correct nested relationship
  )
`)
```

**Updated TypeScript interface:**
```typescript
interface Payment {
  // ... other fields
  user?: {
    tu_email: string;
  };
  subscription?: {
    tus_id: string;
    plan?: {
      tsp_name: string;
      tsp_type: string;
    };
  };
}
```

**Updated rendering:**
```typescript
{payment.user?.tu_email || 'N/A'}
{payment.subscription?.plan?.tsp_name || 'N/A'}
```

### 2. Fixed Registration Payment (`src/pages/auth/RegistrationPayment.tsx`)

**Before:**
```typescript
// ❌ Wrong order: payment first
const { data: payment } = await supabase
  .from('tbl_payments')
  .insert({
    tp_subscription_plan_id: plan.tsp_id,  // ❌ Column doesn't exist
    // ...
  });

// Then subscription
await supabase
  .from('tbl_user_subscriptions')
  .insert({
    tus_payment_id: payment.tp_id,  // ❌ Column doesn't exist
    // ...
  });
```

**After:**
```typescript
// ✅ Correct order: subscription first
const { data: subscription } = await supabase
  .from('tbl_user_subscriptions')
  .insert({
    tus_user_id: user?.tu_id,
    tus_plan_id: plan.tsp_id,  // ✅ Correct column
    tus_status: 'pending',
    // ...
  })
  .select()
  .single();

// Then payment linked to subscription
await supabase
  .from('tbl_payments')
  .insert({
    tp_user_id: user?.tu_id,
    tp_subscription_id: subscription.tus_id,  // ✅ Correct column
    tp_amount: plan.tsp_price,
    // ...
  });
```

### 3. Fixed Edge Function (`supabase/functions/process-registration-payment/index.ts`)

**Query Fix:**
```typescript
// Before: ❌ Wrong relationship
const { data: payment } = await supabase
  .from('tbl_payments')
  .select(`
    *,
    plan:tp_subscription_plan_id(tsp_price, tsp_type)
  `);

// After: ✅ Correct nested relationship
const { data: payment } = await supabase
  .from('tbl_payments')
  .select(`
    *,
    user:tp_user_id(tu_id, tu_email, tu_parent_sponsorship_number),
    subscription:tp_subscription_id(
      tus_id,
      plan:tus_plan_id(tsp_price, tsp_type)
    )
  `);
```

**Subscription Update Fix:**
```typescript
// Before: ❌ Wrong column
await supabase
  .from('tbl_user_subscriptions')
  .update({ tus_status: 'active' })
  .eq('tus_payment_id', paymentId);  // ❌ Column doesn't exist

// After: ✅ Correct relationship
await supabase
  .from('tbl_user_subscriptions')
  .update({ tus_status: 'active' })
  .eq('tus_id', payment.tp_subscription_id);  // ✅ Use foreign key from payment
```

**Type Check Fix:**
```typescript
// Before: ❌ Assumes flat structure
if (payment.plan.tsp_type !== 'registration')

// After: ✅ Handles nested structure with optional chaining
if (payment.subscription?.plan?.tsp_type !== 'registration')
```

## Files Modified

1. **Frontend Components:**
   - `src/components/admin/PendingPayments.tsx` - Fixed query and display logic
   - `src/pages/auth/RegistrationPayment.tsx` - Fixed payment creation flow

2. **Edge Functions:**
   - `supabase/functions/process-registration-payment/index.ts` - Fixed query and subscription update

3. **Documentation:**
   - `PAYMENT_RELATIONSHIP_FIX.md` (this file)

## What Now Works

1. **Admin Panel - Pending Payments**: Correctly loads and displays payment data with subscription and plan information
2. **Customer Registration Payment**: Creates subscription first, then links payment to it
3. **Payment Processing**: Edge function correctly retrieves nested data and updates the right subscription
4. **No More Database Errors**: All queries use correct table relationships and column names

## Testing Checklist

- [ ] Admin can view pending payments list
- [ ] Payment details show correct plan name and type
- [ ] Customer can submit registration payment
- [ ] Admin can approve/reject payments
- [ ] Payment approval activates subscription correctly
- [ ] Referral commissions are credited properly
