import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireAdminSession, logAdminAction } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
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
    const admin = await requireAdminSession(supabase, adminSessionToken);

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('tbl_admin_sessions')
      .delete()
      .lt('tas_expires_at', nowIso)
      .select('tas_id');

    if (error) {
      throw error;
    }

    const deleted = data?.length || 0;
    await logAdminAction(supabase, admin.tau_id, 'cleanup_sessions', 'admin_sessions', {
      deleted,
      timestamp: nowIso
    });

    return new Response(JSON.stringify({ success: true, data: { deleted } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed';
    const status = message.includes('admin session') ? 401 : 500;
    return new Response(JSON.stringify({ success: false, error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
