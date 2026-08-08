import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Lock, Network, RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AutopoolLevelProgress {
  level: number;
  user_count: number;
  required_count: number;
  progress_percent: number;
  reward_amount: number;
  earned: boolean;
  earned_amount: number;
  earned_at?: string | null;
}

interface AutopoolProgressResponse {
  is_member: boolean;
  membership_position?: number;
  total_earned: number;
  enabled?: boolean;
  levels: AutopoolLevelProgress[];
}

const AutopoolMatrixProgress: React.FC = () => {
  const [progress, setProgress] = useState<AutopoolProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_autopool_20_progress');
    if (!error) setProgress(data as AutopoolProgressResponse);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  }

  if (!progress?.is_member) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <Network className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-4 text-xl font-bold text-gray-900">AutoPool Matrix</h2>
        <p className="mt-2 text-gray-600">You are not enrolled in the 20 USDT AutoPool Matrix yet.</p>
      </div>
    );
  }

  const earnedLevels = (progress.levels || []).filter((level) => level.earned).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Network className="h-7 w-7 text-amber-300" />
            <h2 className="text-2xl font-bold">My AutoPool Income</h2>
          </div>
          <p className="mt-2 text-sm text-emerald-100">Your personal AutoPool summary.</p>
        </div>
        <button onClick={() => void loadProgress()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Matrix Position</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">#{Number(progress.membership_position ?? 0) + 1}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm text-emerald-700">Levels Earned</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{earnedLevels} / 8</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm text-amber-700">Milestone Rewards Earned</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{Number(progress.total_earned || 0).toFixed(2)} USDT</p>
        </div>
      </div>

      {progress.enabled !== false && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-4">Level</th>
                  <th className="px-5 py-4">Users</th>
                  <th className="px-5 py-4 min-w-64">Progress</th>
                  <th className="px-5 py-4">Reward</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(progress.levels || []).map((level) => (
                  <tr key={level.level} className={level.earned ? 'bg-emerald-50/60' : ''}>
                    <td className="whitespace-nowrap px-5 py-5 font-semibold text-gray-900">Level {level.level}</td>
                    <td className="whitespace-nowrap px-5 py-5 text-gray-700">
                      <span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-indigo-500" /> {level.user_count.toLocaleString()} / {level.required_count.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-5">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-gray-200">
                          <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, level.progress_percent))}%` }} />
                        </div>
                        <span className="w-16 text-right text-sm text-gray-600">{Number(level.progress_percent || 0).toFixed(2)}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-5 font-semibold text-amber-700">{Number(level.reward_amount || 0).toLocaleString()} USDT</td>
                    <td className="whitespace-nowrap px-5 py-5">
                      {level.earned ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700"><CheckCircle className="h-4 w-4" /> Earned</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600"><Lock className="h-4 w-4" /> Not earned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
        Detailed level-by-level counts, progress, and reward schedules are currently available to administrators only.
      </div> */}
    </div>
  );
};

export default AutopoolMatrixProgress;
