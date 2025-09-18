# MLM Platform with Binary Tree Architecture (MySQL + Node.js)

A comprehensive Multi-Level Marketing (MLM) platform built with React, TypeScript, MySQL, and Node.js, featuring a binary tree compensation system.

## Features

- **Multi-User System**: Support for Customers, Companies, and Admins
- **Binary Tree MLM Structure**: Automated left-first placement algorithm
- **Authentication & Verification**: Email and SMS OTP verification
- **Subscription Management**: Multiple subscription plans with payment processing
- **Real-time Dashboard**: Analytics and network visualization
- **Responsive Design**: Mobile-first design with Tailwind CSS

## Architecture

The platform uses a modern tech stack:
- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: MySQL
- **Authentication**: JWT tokens
- **Email**: Nodemailer
- **SMS**: Twilio

## Database Structure

The platform uses MySQL with the following main tables:

### Core Tables

1. **users** - Main authentication table
   - `id` (uuid, primary key)
   - `email` (text, unique)
   - `user_type` (customer/company/admin)
   - `is_verified`, `email_verified`, `mobile_verified` (boolean)

2. **user_profiles** - Extended user information
   - `user_id` (foreign key to users)
   - `first_name`, `last_name`, `username`
   - `mobile`, `gender`, `sponsorship_number`
   - `parent_account` (referral information)

3. **companies** - Company-specific data
   - `user_id` (foreign key to users)
   - `company_name`, `brand_name`
   - `registration_number`, `gstin`
   - `verification_status`

4. **mlm_tree** - Binary tree structure
   - `user_id`, `parent_id`
   - `left_child_id`, `right_child_id`
   - `level`, `position` (left/right/root)
   - `sponsorship_number`

5. **subscription_plans** - Available plans
   - `name`, `price`, `duration_days`
   - `features` (JSON array)
   - `is_active`

6. **otp_verifications** - OTP management
   - `user_id`, `otp_code`, `otp_type`
   - `contact_info`, `expires_at`
   - `is_verified`, `attempts`

## Setup Instructions

### 1. Database Setup

1. Install MySQL and create a database named `mlm_platform`
2. Import your converted MySQL schema
3. Update database credentials in server/.env

### 2. Backend Setup

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your database credentials
# Start development server
npm run dev
```

### 3. Frontend Setup

```bash
# Install frontend dependencies
npm install

# Copy environment file
cp .env.example .env

# Update .env with your API URL
# Start development server
npm run dev
```

### 4. Environment Variables

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:5000/api
```

**Backend (server/.env):**
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=mlm_platform
DB_PORT=3306

JWT_SECRET=your_super_secret_jwt_key
SMTP_HOST=smtp.gmail.com
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890
```

### 4. Production Gateway Setup

Configure your production settings through both Admin Panel and Supabase Dashboard:

1. **Access Admin Panel**: `/backpanel/login`
   - Email: `admin@mlmplatform.com`
   - Password: `Admin@123456`

2. **Configure Email**: 
   - Admin Panel → Settings → SMTP Settings (for reference)
   - Supabase Dashboard → Settings → Integrations → Resend
   - Add your Resend API key and configure sender domain

3. **Configure SMS**: 
   - Admin Panel → Settings → SMS Settings (for reference)
   - Supabase Dashboard → Settings → Integrations → Twilio
   - Add your Twilio credentials and phone number
   - Test SMS delivery

### 5. Development

```bash
# Run both frontend and backend
npm run dev:full

# Or run separately:
# Frontend only
npm run dev

# Backend only
npm run dev:server
```

### 6. Twilio Setup

For SMS functionality:
1. Create free account at [Twilio.com](https://www.twilio.com)
2. Verify your phone number
3. Get $15.50 free trial credit
4. Copy Account SID and Auth Token from Console
5. Purchase a phone number (or use trial number for testing)
6. Configure in Supabase Dashboard → Settings → Integrations → Twilio
7. Test SMS delivery through Supabase

## Key Features

### Binary Tree Algorithm
- **Left-First Placement**: New users are automatically placed in the leftmost available position
- **Breadth-First Search**: Ensures balanced tree growth
- **Spillover System**: When a position is full, users spill to the next available spot

### OTP Verification System
- **Email OTP**: 6-digit codes sent via SMTP
- **SMS OTP**: 6-digit codes sent via Twilio
- **Expiration**: 10-minute validity period
- **Rate Limiting**: Prevents spam and abuse

### Subscription Management
- **Multiple Plans**: Basic, Premium, Enterprise tiers
- **Payment Integration**: Support for credit cards and crypto
- **Auto-Renewal**: Subscription lifecycle management

### Admin Dashboard
- **User Management**: View and manage all users
- **System Settings**: Configure platform parameters
- **Analytics**: Revenue, growth, and performance metrics
- **Email Templates**: Customize system communications

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register/customer` - Customer registration
- `POST /api/auth/register/company` - Company registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### OTP Management
- `POST /api/otp/send` - Send OTP
- `POST /api/otp/verify` - Verify OTP

### User Management
- `GET /api/users/:id/profile` - Get user profile
- `PUT /api/users/:id/profile` - Update user profile

### MLM Tree
- `GET /api/mlm/tree/:userId` - Get MLM tree structure
- `GET /api/mlm/stats/:userId` - Get tree statistics
- `POST /api/mlm/add-user` - Add user to MLM tree

## Security Features

- **Row Level Security (RLS)**: Database-level access control
- **JWT Authentication**: Secure session management
- **Input Validation**: Comprehensive data validation
- **Rate Limiting**: Protection against abuse
- **Encryption**: Secure password hashing and data transmission

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Testing

### OTP Testing
- **Test OTP Code**: `123456` (works for both email and mobile in development)
- **Email**: Any valid email address
- **Mobile**: Any mobile number with country code

### Login Credentials
- **Admin**: admin@mlmplatform.com / Admin@123456
- **Test Customer**: test@example.com / password123

## Support

For technical support or questions about the database structure:
1. Check the migration files in `supabase/migrations/`
2. Review the API functions in `supabase/functions/`
3. Examine the database schema in Supabase dashboard