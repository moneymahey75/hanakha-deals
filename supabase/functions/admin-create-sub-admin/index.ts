import { createClient } from 'jsr:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const generateTempPassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
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

    const { email, fullName, permissions } = await req.json();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const trimmedName = String(fullName || '').trim();

    if (!normalizedEmail || !trimmedName) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existing } = await supabase
      .from('tbl_admin_users')
      .select('tau_id')
      .eq('tau_email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ success: false, error: 'Email address already exists' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const { data: newAdmin, error: insertError } = await supabase
      .from('tbl_admin_users')
      .insert({
        tau_email: normalizedEmail,
        tau_full_name: trimmedName,
        tau_password_hash: hashedPassword,
        tau_role: 'sub_admin',
        tau_permissions: permissions || {
          customers: { read: false, write: false, delete: false },
          companies: { read: false, write: false, delete: false },
          subscriptions: { read: false, write: false, delete: false },
          payments: { read: false, write: false, delete: false },
          withdrawals: { read: false, write: false, delete: false },
          settings: { read: false, write: false, delete: false },
          mlm: { read: false, write: false, delete: false },
          admins: { read: false, write: false, delete: false },
          coupons: { read: false, write: false, delete: false },
          dailytasks: { read: false, write: false, delete: false },
          wallets: { read: false, write: false, delete: false },
        },
        tau_is_active: true,
        tau_created_by: admin.tau_id,
        tau_created_at: new Date().toISOString(),
      })
      .select('tau_id, tau_email')
      .maybeSingle();

    if (insertError || !newAdmin) {
      throw insertError || new Error('Failed to create sub-admin');
    }

    await logAdminAction(supabase, admin.tau_id, 'create_sub_admin', 'admins', {
      sub_admin_id: newAdmin.tau_id,
      email: newAdmin.tau_email,
    });

    return new Response(JSON.stringify({ success: true, data: { id: newAdmin.tau_id, tempPassword } }), {
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
