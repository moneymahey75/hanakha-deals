import { createClient } from 'jsr:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { logAdminAction } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const createSessionToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
    const { email, password } = await req.json();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const plainPassword = String(password || '');

    if (!normalizedEmail || !plainPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Missing email or password' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminUser, error: adminError } = await supabase
      .from('tbl_admin_users')
      .select(
        'tau_id, tau_email, tau_full_name, tau_role, tau_permissions, tau_is_active, tau_last_login, tau_created_at, tau_password_hash'
      )
      .eq('tau_email', normalizedEmail)
      .maybeSingle();

    if (adminError || !adminUser || !adminUser.tau_is_active) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email or password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const passwordMatch = await bcrypt.compare(plainPassword, adminUser.tau_password_hash);
    if (!passwordMatch) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid email or password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sessionToken = createSessionToken();
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    const { error: sessionError } = await supabase
      .from('tbl_admin_sessions')
      .insert({
        tas_admin_id: adminUser.tau_id,
        tas_session_token: sessionToken,
        tas_expires_at: sessionExpiresAt,
        tas_ip_address: ipAddress,
        tas_user_agent: userAgent
      });

    if (sessionError) {
      throw sessionError;
    }

    await supabase
      .from('tbl_admin_users')
      .update({
        tau_last_login: new Date().toISOString(),
      })
      .eq('tau_id', adminUser.tau_id);

    await logAdminAction(supabase, adminUser.tau_id, 'login', 'auth', {
      email: adminUser.tau_email,
      ip_address: ipAddress,
      user_agent: userAgent
    });

    return new Response(
      JSON.stringify({
        success: true,
        session_token: sessionToken,
        session_expires_at: sessionExpiresAt,
        admin: {
          id: adminUser.tau_id,
          email: adminUser.tau_email,
          fullName: adminUser.tau_full_name,
          role: adminUser.tau_role,
          permissions: adminUser.tau_permissions,
          isActive: adminUser.tau_is_active,
          lastLogin: adminUser.tau_last_login || '',
          createdAt: adminUser.tau_created_at || ''
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Login failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
