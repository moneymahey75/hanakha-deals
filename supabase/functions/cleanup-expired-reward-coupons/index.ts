import { createClient } from 'jsr:@supabase/supabase-js@2';
import { adminHasPermission, requireAdminSession, logAdminAction } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session, X-Cleanup-Secret',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const cleanupSecret = Deno.env.get('REWARD_COUPON_CLEANUP_SECRET');
    const providedSecret = req.headers.get('X-Cleanup-Secret');
    const hasValidSecret = Boolean(cleanupSecret && providedSecret && providedSecret === cleanupSecret);
    let adminId: string | null = null;

    if (!hasValidSecret) {
      const admin = await requireAdminSession(supabase, req.headers.get('X-Admin-Session'));
      if (!adminHasPermission(admin, 'coupons', 'write')) {
        return jsonResponse({ success: false, error: 'Permission denied: coupons.write' }, 403);
      }
      adminId = admin.tau_id;
    }

    const payload = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(payload.limit ?? 50000) || 50000, 200000));
    const beforeDate = typeof payload.beforeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.beforeDate)
      ? payload.beforeDate
      : undefined;

    const rpcArgs: Record<string, string | number> = { p_limit: limit };
    if (beforeDate) {
      rpcArgs.p_before_date = beforeDate;
    }

    const { data, error } = await supabase.rpc('cleanup_expired_reward_coupons', rpcArgs);

    if (error) {
      throw error;
    }

    const deleted = Number(data || 0);

    if (adminId) {
      await logAdminAction(supabase, adminId, 'cleanup_expired_reward_coupons', 'coupons', {
        deleted,
        before_date: beforeDate || null,
        limit,
      });
    }

    return jsonResponse({
      success: true,
      data: {
        deleted,
        beforeDate: beforeDate || null,
        limit,
      },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed';
    const status = message.includes('admin session') ? 401 : message.includes('Permission denied') ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
