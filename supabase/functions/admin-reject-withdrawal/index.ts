import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const getAdminBySession = async (supabase: ReturnType<typeof createClient>, token: string) => {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('tbl_admin_sessions')
    .select(
      `
      tas_admin_id,
      admin:tas_admin_id(
        tau_id,
        tau_email,
        tau_role,
        tau_permissions,
        tau_is_active
      )
    `
    )
    .eq('tas_session_token', token)
    .gt('tas_expires_at', nowIso)
    .maybeSingle();

  if (error || !data?.admin || !data.admin.tau_is_active) return null;
  return data.admin;
};

const isUuid = (value?: string | null) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const adminSessionToken = req.headers.get('X-Admin-Session');
    if (!adminSessionToken) {
      return new Response(JSON.stringify({ success: false, error: 'Missing admin session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = await getAdminBySession(supabase, adminSessionToken);
    if (!admin) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid admin session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!adminHasPermission(admin, 'withdrawals', 'write')) {
      return new Response(JSON.stringify({ success: false, error: 'Permission denied: withdrawals.write' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { withdrawalId, note, refundAttemptedAmount } = await req.json();
    if (!isUuid(withdrawalId)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid withdrawalId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('tbl_withdrawal_requests')
      .select('*')
      .eq('twr_id', withdrawalId)
      .maybeSingle();

    if (withdrawalError || !withdrawal) {
      return new Response(JSON.stringify({ success: false, error: 'Withdrawal request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const status = String(withdrawal.twr_status || '').toLowerCase();
    if (withdrawal.twr_blockchain_tx || status === 'completed') {
      return new Response(JSON.stringify({ success: false, error: 'Cannot reject a completed withdrawal' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shouldRefund = refundAttemptedAmount === true;
    const refundResult = shouldRefund && ['processing', 'failed', 'pending'].includes(status)
      ? await supabase
          .rpc('refund_withdrawal_if_debited', { p_withdrawal_id: withdrawalId })
          .then(({ data, error }: any) => error
            ? { refunded: false, reason: 'refund_failed' }
            : {
                refunded: Boolean(data?.refunded),
                reason: String(data?.reason || (data?.refunded ? 'ok' : 'not_refunded')),
              })
      : {
          refunded: false,
          reason: shouldRefund ? `not_refundable_status_${status || 'unknown'}` : 'admin_declined_refund'
        };

    const { data: updated, error } = await supabase
      .from('tbl_withdrawal_requests')
      .update({
        twr_status: 'rejected',
        twr_processed_at: new Date().toISOString(),
        twr_processed_by_admin_id: admin.tau_id,
        twr_processed_by_admin_email: admin.tau_email,
        twr_processed_by_admin_name: admin.tau_email,
        twr_failure_reason: note || null
      })
      .eq('twr_id', withdrawalId)
      .eq('twr_status', status)
      .is('twr_blockchain_tx', null)
      .select('twr_id')
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!updated?.twr_id) {
      return new Response(JSON.stringify({ success: false, error: 'Withdrawal status changed. Please refresh and try again.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await logAdminAction(supabase, admin.tau_id, 'reject_withdrawal', 'withdrawals', {
      withdrawal_id: withdrawalId,
      previous_status: status,
      refund_requested: shouldRefund,
      refunded: refundResult.refunded,
      refund_reason: refundResult.reason,
      note: note || null
    });

    return new Response(JSON.stringify({ success: true, data: { withdrawalId, refunded: refundResult.refunded } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: 'Failed to reject withdrawal' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
