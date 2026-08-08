import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Users, Wallet } from 'lucide-react';
import { adminApi } from '../../lib/adminApi';

type UserRow = { user_id: string; email: string; username: string; sponsor_number: string; is_active: boolean | null; position: number; matrix_level: number; joined_at: string; earned: number; matrix_earned: number; direct_earned: number; levels_earned: number };
type Analytics = { summary: { members: number; active_members: number; gross_collected: number; user_rewards_credited: number; direct_income_credited: number; total_user_income: number; admin_retained_before_costs: number; reward_events: number; matrix_capacity: number }; level_summary: Array<{ level: number; rewards_count: number; amount: number }>; users: UserRow[]; total_users: number; offset: number; limit: number };
type UserDetail = { user: { tu_email?: string }; membership: { position_display: number; ta20_level: number; ta20_created_at: string }; levels: Array<{ level: number; members: number; required: number; reward: number; earned: boolean }>; rewards: Array<{ ta20mr_level: number; ta20mr_amount: number; ta20mr_created_at: string }>; total_earned: number; direct_earned: number };

const money = (value: number) => `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

const AutopoolAnalytics: React.FC = () => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [sponsorNumber, setSponsorNumber] = useState('');
  const pageSize = 25;

  const load = async () => {
    setLoading(true);
    try { setError(''); setAnalytics(await adminApi.post<Analytics>('admin-get-autopool-analytics', { email, username, sponsorNumber, offset: (page - 1) * pageSize, limit: pageSize })); } catch (requestError: any) { setError(requestError?.message || 'Unable to load AutoPool analytics'); } finally { setLoading(false); }
  };
  const loadDetail = async (userId: string) => {
    setSelectedUserId(userId);
    setDetailLoading(true);
    setError('');
    try { setDetail(await adminApi.post<UserDetail>('admin-get-autopool-analytics', { userId })); } catch (requestError: any) { setError(requestError?.message || 'Unable to load user AutoPool details'); } finally { setDetailLoading(false); }
  };
  useEffect(() => { void load(); }, [page, email, username, sponsorNumber]);

  const sortedUsers = useMemo(() => [...(analytics?.users || [])].sort((a, b) => b.earned - a.earned), [analytics]);
  if (loading && !analytics) return <div className="flex items-center justify-center py-24"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (!analytics) return <div className="rounded-xl bg-white p-8 text-center text-red-600">{error || 'No AutoPool analytics available.'}</div>;
  const { summary } = analytics;
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold text-gray-900">20 USDT AutoPool Analytics</h2><p className="text-sm text-gray-500">Revenue, payouts, matrix progress, and user-level audit.</p></div><button onClick={() => void load()} className="rounded-lg bg-indigo-50 p-2 text-indigo-700"><RefreshCw className="h-5 w-5" /></button></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[['Members', `${summary.members.toLocaleString()} / ${summary.matrix_capacity.toLocaleString()}`, Users], ['Gross collected', money(summary.gross_collected), Wallet], ['Matrix rewards', money(summary.user_rewards_credited), BarChart3], ['Direct parent income', money(summary.direct_income_credited), Users], ['Total user income', money(summary.total_user_income), BarChart3], ['Admin retained before costs', money(summary.admin_retained_before_costs), Wallet]].map(([label, value, Icon]: any) => <div key={label} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex justify-between"><div><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-xl font-bold text-gray-900">{value}</p></div><Icon className="h-6 w-6 text-indigo-600" /></div></div>)}
    </div>
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><div className="grid grid-cols-1 gap-3 md:grid-cols-3"><input value={email} onChange={(event) => { setEmail(event.target.value); setPage(1); }} placeholder="Search email" className="rounded-lg border px-3 py-2 text-sm" /><input value={username} onChange={(event) => { setUsername(event.target.value); setPage(1); }} placeholder="Search username" className="rounded-lg border px-3 py-2 text-sm" /><input value={sponsorNumber} onChange={(event) => { setSponsorNumber(event.target.value); setPage(1); }} placeholder="Search sponsor number" className="rounded-lg border px-3 py-2 text-sm" /></div></div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-1"><h3 className="font-semibold text-gray-900">Level payout summary</h3><div className="mt-4 space-y-2">{analytics.level_summary.map((row) => <div key={row.level} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"><span>Level {row.level}</span><span className="text-gray-500">{row.rewards_count} rewards</span><strong>{money(row.amount)}</strong></div>)}</div></div>
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-gray-900">AutoPool members</h3><p className="text-xs text-gray-500">Showing {analytics.total_users ? analytics.offset + 1 : 0}-{Math.min(analytics.offset + analytics.users.length, analytics.total_users)} of {analytics.total_users.toLocaleString()}. Select a user to inspect all eight levels.</p></div><span className="text-sm text-gray-500">{summary.reward_events} reward events</span></div><div className="mt-4 overflow-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="px-2 py-3">User</th><th>Username</th><th>Sponsor</th><th>Position</th><th>Matrix level</th><th>Levels earned</th><th>Total earned</th><th /></tr></thead><tbody>{sortedUsers.map((row) => <tr key={row.user_id} className="border-b last:border-0"><td className="px-2 py-3"><div className="font-medium text-gray-900">{row.email || row.user_id.slice(0, 8)}</div><div className="text-xs text-gray-400">{row.is_active ? 'Active' : 'Inactive'}</div></td><td>{row.username || '—'}</td><td>{row.sponsor_number || '—'}</td><td>#{row.position}</td><td>{row.matrix_level}</td><td>{row.levels_earned} / 8</td><td className="font-semibold">{money(row.earned)}</td><td><button type="button" onClick={() => void loadDetail(row.user_id)} className="text-indigo-600 hover:underline">Details</button></td></tr>)}</tbody></table></div><div className="mt-4 flex items-center justify-between border-t pt-4"><button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-gray-500">Page {page} of {Math.max(1, Math.ceil(analytics.total_users / pageSize))}</span><button disabled={page >= Math.ceil(analytics.total_users / pageSize) || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button></div></div>
    </div>
    {detailLoading && <div className="rounded-xl bg-white p-6 text-center text-gray-500">Loading user AutoPool details…</div>}
    {detail && !detailLoading && <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-gray-900">User AutoPool detail</h3><p className="text-sm text-gray-500">{detail.user?.tu_email || selectedUserId} · Position #{detail.membership.position_display} · Matrix earned {money(detail.total_earned)} · Direct earned {money(detail.direct_earned)}</p></div><button onClick={() => setDetail(null)} className="text-sm text-gray-500">Close</button></div><div className="mt-4 overflow-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="px-2 py-3">Level</th><th>Members filled</th><th>Required</th><th>Milestone reward</th><th>Status</th></tr></thead><tbody>{detail.levels.map((row) => <tr key={row.level} className="border-b last:border-0"><td className="px-2 py-3 font-semibold">Level {row.level}</td><td>{row.members.toLocaleString()}</td><td>{row.required.toLocaleString()}</td><td>{money(row.reward)}</td><td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.earned ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{row.earned ? 'Earned' : 'In progress'}</span></td></tr>)}</tbody></table></div></div>}
  </div>;
};

export default AutopoolAnalytics;
