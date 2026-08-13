import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Failed to award AutoPool milestone';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase environment variables');

    const supabase = createClient(supabaseUrl, serviceKey);
    const admin = await requireAdminSession(supabase, req.headers.get('X-Admin-Session'));
    if (!adminHasPermission(admin, 'wallets', 'write')) return json({ success: false, error: 'Wallet write permission required' }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    const level = Number(body?.level);
    const amount = Number(body?.amount);
    const description = typeof body?.description === 'string' ? body.description.trim() : null;

    if (!userId || !Number.isInteger(level) || level < 1 || level > 8 || !Number.isFinite(amount) || amount <= 0) {
      return json({ success: false, error: 'A user, AutoPool level (1–8), and positive amount are required' }, 400);
    }

    const { data, error } = await supabase.rpc('award_autopool_20_milestone', {
      p_user_id: userId,
      p_level: level,
      p_amount: amount,
      p_description: description,
    }).single();
    if (error) throw error;

    await logAdminAction(supabase, admin.tau_id, 'award_autopool_milestone', 'wallets', {
      user_id: userId,
      milestone_level: level,
      amount,
      reward_id: data?.reward_id,
      wallet_transaction_id: data?.wallet_transaction_id,
    });

    return json({ success: true, data: {
      rewardId: data?.reward_id,
      walletTransactionId: data?.wallet_transaction_id,
      walletId: data?.wallet_id,
      newBalance: Number(data?.new_balance || 0),
      requiredMembers: Number(data?.required_members || 0),
    }});
  } catch (error: unknown) {
    return json({ success: false, error: errorMessage(error) }, 500);
  }
});
