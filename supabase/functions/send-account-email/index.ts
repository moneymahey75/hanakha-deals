import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  getDisplayName,
  paymentEmailTemplate,
  sendSmtpMail,
  welcomeEmailTemplate,
} from '../_shared/email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type EmailType = 'welcome' | 'upgrade_payment';

const formatAmount = (value: unknown) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0 USDT';
  return `${amount.toFixed(6).replace(/\.?0+$/, '')} USDT`;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();

    if (authError || !authData?.user?.id) {
      return new Response(JSON.stringify({ success: false, error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const type = String(body?.type || '') as EmailType;

    if (!['welcome', 'upgrade_payment'].includes(type)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const { data: userRow } = await adminClient
      .from('tbl_users')
      .select('tu_email')
      .eq('tu_id', userId)
      .maybeSingle();

    const { data: profile } = await adminClient
      .from('tbl_user_profiles')
      .select('tup_first_name, tup_last_name, tup_username')
      .eq('tup_user_id', userId)
      .maybeSingle();

    const email = userRow?.tu_email || authData.user.email;
    if (!email) {
      return new Response(JSON.stringify({ success: false, error: 'User email not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const name = getDisplayName(profile, email);

    if (type === 'welcome') {
      await sendSmtpMail({
        to: email,
        subject: 'Welcome to ShopClix',
        html: welcomeEmailTemplate(name),
        text: `Hi ${name || 'there'}, welcome to ShopClix. Your account has been created successfully.`,
        fromName: 'ShopClix Welcome',
      });
    }

    if (type === 'upgrade_payment') {
      const planName = String(body?.planName || 'Account upgrade').trim();
      const amount = Number(body?.amount || 0);
      const transactionHash = String(body?.transactionHash || '').trim();
      const reservedUsed = Number(body?.reservedUsed || 0);
      const network = String(body?.network || '').trim();

      await sendSmtpMail({
        to: email,
        subject: 'Your ShopClix upgrade is active',
        html: paymentEmailTemplate({
          name,
          title: 'Upgrade activated',
          subtitle: 'Your account upgrade payment has been confirmed.',
          theme: 'gold',
          rows: [
            { label: 'Plan', value: planName },
            { label: 'Amount', value: formatAmount(amount) },
            { label: 'Reserved Used', value: reservedUsed > 0 ? formatAmount(reservedUsed) : null },
            { label: 'Network', value: network },
            { label: 'Transaction Hash', value: transactionHash || 'Reserved balance payment' },
            { label: 'Status', value: 'Completed' },
          ],
        }),
        text: `Your ShopClix upgrade is active. Plan: ${planName}. Amount: ${formatAmount(amount)}. Transaction: ${transactionHash || 'Reserved balance payment'}.`,
        fromName: 'ShopClix Payments',
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Account email error:', error);
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
