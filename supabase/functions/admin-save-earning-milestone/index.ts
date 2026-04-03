import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logAdminAction } from '../_shared/adminSession.ts';

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

    const { id, title, level1, level2, level3, amount, isActive } = await req.json();
    if (!title) {
      return new Response(JSON.stringify({ success: false, error: 'Missing title' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (id) {
      const { error } = await supabase
        .from('tbl_mlm_reward_milestones')
        .update({
          tmm_title: title,
          tmm_level1_required: level1,
          tmm_level2_required: level2,
          tmm_level3_required: level3,
          tmm_reward_amount: amount,
          tmm_is_active: isActive
        })
        .eq('tmm_id', id);

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase
        .from('tbl_mlm_reward_milestones')
        .insert({
          tmm_title: title,
          tmm_level1_required: level1,
          tmm_level2_required: level2,
          tmm_level3_required: level3,
          tmm_reward_amount: amount,
          tmm_currency: 'USDT',
          tmm_is_active: isActive
        });

      if (error) {
        throw error;
      }
    }

    await logAdminAction(supabase, admin.tau_id, id ? 'update_earning_milestone' : 'create_earning_milestone', 'earning_milestones', {
      milestone_id: id || null,
      title,
      level1,
      level2,
      level3,
      amount,
      is_active: isActive
    });

    return new Response(JSON.stringify({ success: true, data: { id: id || null } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
