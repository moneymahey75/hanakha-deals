import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

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

    const { userId, newPassword } = await req.json();
    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Missing parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userRow, error: userError } = await supabase
      .from('tbl_users')
      .select('tu_email, tu_user_type')
      .eq('tu_id', userId)
      .maybeSingle();

    if (userError || !userRow) {
      throw new Error('User not found');
    }

    const permissionModule = userRow.tu_user_type === 'company' ? 'companies' : 'customers';
    if (!adminHasPermission(admin, permissionModule, 'write')) {
      return new Response(JSON.stringify({ success: false, error: `Permission denied: ${permissionModule}.write` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (authError) {
      throw authError;
    }

    await logAdminAction(supabase, admin.tau_id, 'reset_user_password', 'customers', {
      user_id: userId,
      user_email: userRow.tu_email
    });

    return new Response(JSON.stringify({
      success: true,
      data: {
        userId,
        email: userRow.tu_email
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed';
    const status = message.includes('admin session') ? 401 : message.includes('Permission denied') ? 403 : 500;
    return new Response(JSON.stringify({ success: false, error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
