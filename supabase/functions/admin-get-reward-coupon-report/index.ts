import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logAdminAction, requireAdminSession } from '../_shared/adminSession.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session',
};

const getBusinessDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

const toNumber = (value: unknown) => Number(value || 0);
const isIsoDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

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
    const admin = await requireAdminSession(supabase, req.headers.get('X-Admin-Session'));
    const { startDate, endDate } = await req.json().catch(() => ({}));
    const today = getBusinessDate();
    const requestedStartDate = isIsoDate(startDate) ? String(startDate) : today;
    const requestedEndDate = isIsoDate(endDate) ? String(endDate) : requestedStartDate;
    const reportStartDate = requestedStartDate <= requestedEndDate ? requestedStartDate : requestedEndDate;
    const reportEndDate = requestedStartDate <= requestedEndDate ? requestedEndDate : requestedStartDate;

    const { data: assignments, error } = await supabase
      .from('tbl_user_reward_coupons')
      .select(`
        turc_id,
        turc_reward_date,
        turc_reward_amount,
        turc_status
      `)
      .gte('turc_reward_date', reportStartDate)
      .lte('turc_reward_date', reportEndDate)
      .in('turc_status', ['available', 'opened', 'liked', 'disliked']);

    if (error) {
      throw error;
    }

    const rows = (assignments || []).map((row: any) => {
      return {
        assignmentId: row.turc_id,
        rewardDate: row.turc_reward_date,
        rewardAmount: toNumber(row.turc_reward_amount),
        status: row.turc_status,
      };
    });

    const creditedRows = rows.filter((row) => row.status === 'liked' || row.status === 'disliked');
    const notRewardedRows = rows.filter((row) => row.status === 'available' || row.status === 'opened');

    const data = {
      startDate: reportStartDate,
      endDate: reportEndDate,
      summary: {
        assignedCount: rows.length,
        assignedAmount: rows.reduce((sum, row) => sum + row.rewardAmount, 0),
        creditedCount: creditedRows.length,
        creditedAmount: creditedRows.reduce((sum, row) => sum + row.rewardAmount, 0),
        notRewardedCount: notRewardedRows.length,
        notRewardedAmount: notRewardedRows.reduce((sum, row) => sum + row.rewardAmount, 0),
      },
    };

    await logAdminAction(supabase, admin.tau_id, 'view_reward_coupon_report', 'coupons', {
      start_date: reportStartDate,
      end_date: reportEndDate,
      credited_count: data.summary.creditedCount,
      not_rewarded_count: data.summary.notRewardedCount,
    });

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    const status = String(error?.message || '').includes('admin session') ? 401 : 500;
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Failed' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
