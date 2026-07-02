import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { withdrawalId } = await req.json();
    if (!isUuid(withdrawalId)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid withdrawal ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('tbl_withdrawal_requests')
      .select('twr_id, twr_status, twr_user_id')
      .eq('twr_id', withdrawalId)
      .single();

    if (withdrawalError || !withdrawal) {
      return new Response(JSON.stringify({ success: false, error: 'Withdrawal request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (withdrawal.twr_user_id !== authData.user.id) {
      return new Response(JSON.stringify({ success: false, error: 'Not authorized to cancel this withdrawal' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (withdrawal.twr_status !== 'pending') {
      return new Response(JSON.stringify({ success: false, error: 'Only pending withdrawals can be cancelled' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from('tbl_withdrawal_requests')
      .update({
        twr_status: 'cancelled',
        twr_processed_at: new Date().toISOString()
      })
      .eq('twr_id', withdrawalId)
      .eq('twr_user_id', authData.user.id)
      .eq('twr_status', 'pending')
      .select('twr_id')
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }
    if (!updated?.twr_id) {
      return new Response(JSON.stringify({ success: false, error: 'Withdrawal status changed. Please refresh and try again.' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Unable to cancel withdrawal',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
