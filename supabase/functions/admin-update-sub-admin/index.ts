import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

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

    if (admin.tau_role !== 'super_admin') {
      return new Response(JSON.stringify({ success: false, error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { id, email, fullName, permissions, isActive } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing sub-admin id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updateData: Record<string, any> = {};
    if (email !== undefined) updateData.tau_email = String(email || '').trim().toLowerCase();
    if (fullName !== undefined) updateData.tau_full_name = String(fullName || '').trim();
    if (permissions !== undefined) updateData.tau_permissions = permissions;
    if (isActive !== undefined) updateData.tau_is_active = !!isActive;

    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No updates provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: updated, error } = await supabase
      .from('tbl_admin_users')
      .update(updateData)
      .eq('tau_id', id)
      .eq('tau_role', 'sub_admin')
      .select('tau_id, tau_email')
      .maybeSingle();

    if (error || !updated) {
      throw error || new Error('Sub-admin not found');
    }

    await logAdminAction(supabase, admin.tau_id, 'update_sub_admin', 'admins', {
      sub_admin_id: updated.tau_id,
      email: updated.tau_email,
      updated_fields: Object.keys(updateData),
    });

    return new Response(JSON.stringify({ success: true, data: { id: updated.tau_id } }), {
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
