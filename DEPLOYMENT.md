# Deployment Guide

## GitHub Repository Setup

### 1. Create GitHub Repository

```bash
# Initialize git repository
git init

# Add all files
git add .

# Initial commit
git commit -m "Initial commit: MLM Platform with Binary Tree Architecture"

# Add remote repository
git remote add origin https://github.com/yourusername/mlm-platform.git

# Push to GitHub
git push -u origin main
```

### 2. Environment Variables Setup

Create `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Netlify Deployment

#### Option A: Connect GitHub to Netlify
1. Go to [Netlify](https://netlify.com)
2. Click "New site from Git"
3. Connect your GitHub repository
4. Set build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables in Netlify dashboard

#### Option B: Manual Deployment
1. Run `npm run build` locally
2. Drag and drop the `dist` folder to Netlify

### 4. Supabase Configuration

#### Database Setup
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the migration file: `supabase/migrations/20250715185532_dusty_sea.sql`

#### Edge Functions Deployment
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy edge functions
supabase functions deploy send-otp
supabase functions deploy verify-otp
supabase functions deploy send-account-email
supabase functions deploy contact-us
supabase functions deploy verify-turnstile
supabase functions deploy verify-registration-payment
supabase functions deploy process-registration-payment
supabase functions deploy request-withdrawal
supabase functions deploy process-withdrawal
supabase functions deploy resend
```

### 5. Third-Party Service Configuration

#### Cloudflare Turnstile Setup
1. Configure the frontend hosting environment variable:
   ```bash
   VITE_TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
   ```
2. Configure Supabase Edge Function secrets:
   ```bash
   supabase secrets set TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
   supabase secrets set TURNSTILE_SECRET_KEY=your-cloudflare-turnstile-secret-key
   ```

#### Gmail SMTP Setup
1. Enable 2-Factor Authentication on Gmail
2. Generate App Password:
   - Google Account → Security → App Passwords
   - Select "Mail" and generate password
3. Configure Supabase Edge Function secrets:
   ```bash
   supabase secrets set GMAIL_SMTP_USER=your-gmail-address@gmail.com
   supabase secrets set GMAIL_SMTP_APP_PASSWORD=your-gmail-app-password
   supabase secrets set GMAIL_SMTP_FROM_NAME="ShopClix Support"
   supabase secrets set CONTACT_ADMIN_EMAIL=admin-receiver@example.com
   supabase secrets set SITE_URL=https://shopclix.live
   supabase secrets set SITE_LOGO_URL=https://shopclix.live/svgHanakaFullLogoFinal.svg
   ```
4. SMTP is used for OTP, welcome, contact, registration payment, upgrade payment, and withdrawal emails. The old `resend` function now uses SMTP internally for any legacy callers.
5. The Contact Us function sends:
   - Admin notification to `CONTACT_ADMIN_EMAIL`, or the Contact Email configured in Admin Panel if no secret is set
   - Thank-you acknowledgement to the sender

#### Twilio SMS Setup
1. Create account at [Twilio.com](https://www.twilio.com)
2. Get Account SID and Auth Token from Console
3. Purchase phone number or use trial number
4. Configure in Admin Panel:
   - Account SID: From Twilio Console
   - Auth Token: From Twilio Console
   - From Number: Your Twilio phone number

### 6. Admin Panel Access

- URL: `your-domain.com/backpanel/login`

Create the first super-admin directly in the database using a strong one-time password, then rotate it after first login. Do not publish or commit default admin credentials.

### 7. Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Edge functions deployed
- [ ] Super-admin account created with a strong password
- [ ] SSL certificate active (automatic with Netlify)
- [ ] Custom domain configured (optional)

## Continuous Deployment

Once connected to GitHub, Netlify will automatically deploy when you push changes:

```bash
# Make changes to your code
git add .
git commit -m "Your commit message"
git push origin main
```

Netlify will automatically build and deploy your changes.

## Monitoring

- **Netlify Dashboard**: Monitor deployments and site analytics
- **Supabase Dashboard**: Monitor database usage and API calls
- **Twilio Console**: Monitor SMS usage and costs
- **Gmail**: Monitor email sending through Gmail SMTP

## Support

For issues with:
- **Deployment**: Check Netlify build logs
- **Database**: Check Supabase logs and RLS policies
- **Email**: Verify Gmail App Password and SMTP settings
- **SMS**: Check Twilio account balance and phone number status
