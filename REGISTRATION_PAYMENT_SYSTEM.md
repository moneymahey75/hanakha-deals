# Registration and Payment System

## Overview

The registration and payment system has been completely reworked to separate registration fees from upgrade subscriptions, with automatic referral commission distribution.

## Key Features

### 1. Two Types of Subscription Plans

**Registration Plans:**
- One-time fee paid during account creation
- Default: $5 registration fee
- Only shown during registration process
- Required to activate account

**Upgrade Plans:**
- Additional subscription plans for enhanced features
- Shown in subscription plans page after registration
- Optional upgrades for existing users

### 2. Registration Flow

1. **User Registration** (`/customer/register`)
   - User fills registration form with referral code
   - After successful registration, redirected to payment page

2. **Registration Payment** (`/registration-payment`)
   - Shows active registration plan ($5)
   - User selects wallet (Trust Wallet, MetaMask, SafePal)
   - Admin wallet address displayed for payment
   - User can optionally provide transaction hash
   - Submits payment for admin approval

3. **Payment Status**
   - Payment marked as "pending"
   - User subscription marked as "pending"
   - Account remains inactive until payment approved

### 3. Admin Payment Management

**Location:** Admin Dashboard > Payments Tab

**Features:**
- View all pending registration payments
- See customer details, amount, payment method
- Transaction hash (if provided)
- Approve or reject payments

**Approval Process:**
When admin approves a registration payment:

1. Payment status updated to "completed"
2. User subscription activated
3. **Automatic commission distribution:**
   - System finds the referrer (parent sponsor)
   - Credits $2 to referrer's wallet
   - Creates wallet transaction record
   - Logs activity in admin logs

### 4. Referral Commission System

**Default Settings:**
- Registration Fee: $5
- Direct Referral Commission: $2
- Commission automatically credited to referrer's wallet

**How It Works:**
```
New User pays $5 → Admin approves → Referrer receives $2
```

**Backend Process:**
- Edge function: `process-registration-payment`
- Validates admin session
- Processes payment approval
- Calculates commission from system settings
- Credits referrer wallet
- Creates transaction records
- Logs all activities

### 5. Admin Configuration

**Subscription Plans Management:**

Two separate tabs:
- **Registration Plans:** Manage one-time registration fees
- **Upgrade Plans:** Manage subscription upgrades

Admins can:
- Create/edit/delete plans
- Set pricing and duration
- Define features
- Activate/deactivate plans

**System Settings:**

New settings added:
- `registration_fee`: Registration amount (default: $5)
- `direct_referral_commission`: Referral bonus (default: $2)
- `admin_payment_wallet`: Admin SafePal wallet address
- `payment_wallets_enabled`: Enable/disable payment wallets

### 6. Wallet Integration

**Supported Wallets:**
- Trust Wallet
- MetaMask
- SafePal

**Payment Process:**
1. User selects wallet type
2. Admin wallet address displayed
3. User sends payment externally
4. User submits payment with optional transaction hash
5. Admin verifies and approves

### 7. Database Schema Updates

**New Settings:**
```sql
tbl_system_settings:
- registration_fee (default: 5)
- direct_referral_commission (default: 2)
- admin_payment_wallet (empty by default)
- payment_wallets_enabled (JSON)
```

**Enhanced Plan Type:**
```sql
tbl_subscription_plans:
- tsp_type: 'registration' | 'upgrade'
```

### 8. User Experience

**For New Users:**
1. Register with referral code
2. Complete email/mobile verification (if enabled)
3. Redirected to payment page
4. Select wallet and pay $5
5. Wait for admin approval
6. Account activated + referrer receives $2

**For Referrers:**
1. Share referral link
2. New user registers and pays
3. Admin approves payment
4. Automatically receive $2 in wallet
5. Can view transaction in wallet dashboard

### 9. Security Features

- Admin session validation for payment approvals
- RLS policies on all tables
- Transaction logging
- Payment status tracking
- Automatic commission calculation
- Fraud prevention through admin approval

### 10. Edge Functions

**`process-registration-payment`:**
- Handles payment approval
- Validates admin permissions
- Processes referral commissions
- Updates wallet balances
- Creates transaction records
- Logs admin activities

**`admin-impersonate`:**
- Updated with proper admin authentication
- Uses admin session token validation

## Configuration Steps

### For Administrators:

1. **Set Admin Wallet Address:**
   - Go to Admin Dashboard > Settings > Payment
   - Enter your SafePal wallet address
   - Save settings

2. **Configure Registration Plan:**
   - Go to Subscriptions tab
   - Select "Registration Plans"
   - Edit or create registration plan
   - Set price and features
   - Activate the plan

3. **Configure Commission Settings:**
   - Default $2 commission is pre-configured
   - Can be adjusted in system settings if needed

4. **Approve Payments:**
   - Go to Payments tab
   - Review pending registration payments
   - Verify transaction details
   - Click "Approve" to activate user and pay commission

### For Users:

1. Register with a referral code (optional but recommended)
2. Complete verification if required
3. Select payment wallet
4. Send payment to displayed admin wallet address
5. Submit payment record (with optional transaction hash)
6. Wait for admin approval
7. Start using the platform

## Benefits

1. **Clear Separation:** Registration vs. upgrade plans are distinct
2. **Automated Commissions:** No manual calculation or distribution
3. **Transparent Process:** All transactions logged and trackable
4. **Secure Payments:** Admin approval prevents fraud
5. **Wallet Integration:** Multiple payment options
6. **Audit Trail:** Complete activity logging
7. **Scalable:** Easy to add more plan types or modify commission structure

## Technical Implementation

### Frontend Components:
- `RegistrationPayment.tsx`: Payment page for new users
- `SubscriptionManagement.tsx`: Admin plan management with tabs
- `PendingPayments.tsx`: Admin payment approval interface

### Backend Functions:
- `process-registration-payment`: Commission distribution
- `admin-impersonate`: Customer impersonation with proper auth

### Database:
- System settings for configuration
- Enhanced subscription plans table
- Wallet and transaction tracking
- Activity logging

## Future Enhancements

Potential improvements:
1. Multiple commission levels (indirect referrals)
2. Automatic payment verification via blockchain
3. Real-time payment notifications
4. Commission history reports
5. Bulk payment approvals
6. Webhook integration for external wallets
