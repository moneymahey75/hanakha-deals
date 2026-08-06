import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LockKeyhole, Network, RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AutopoolLevelProgress {
  level: number;
  user_count: number;
  required_count: number;
  progress_percent: number;
  reward_amount: number;
  earned: boolean;
  earned_amount: number;
  earned_at: string | null;
}

interface AutopoolProgressResponse {
  enabled: boolean;
  is_member: boolean;
  membership_position?: number;
  matrix_level?: number;
  joined_at?: string | null;
  total_earned: number;
  levels: AutopoolLevelProgress[];
}

const AutopoolMatrixProgress: React.FC = () => {
  const [progress, setProgress] = useState<AutopoolProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: progressError } = await supabase.rpc('get_my_autopool_20_progress');
      if (progressError) throw progressError;
      setProgress(data as AutopoolProgressResponse);
    } catch (loadError) {
      console.error('Failed to load AutoPool progress:', loadError);
      setError('Unable to load your AutoPool matrix progress. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-medium text-red-800">{error}</p>
        <button onClick={() => void loadProgress()} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
          Try Again
        </button>
      </div>
    );
  }

  if (!progress?.enabled) {
    return <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">AutoPool level counts are currently disabled.</div>;
  }

  if (!progress.is_member) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <Network className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-4 text-xl font-bold text-gray-900">AutoPool Matrix</h2>
        <p className="mt-2 text-gray-600">You are not enrolled in the 20 USDT AutoPool Matrix yet.</p>
      </div>
    );
  }

  const earnedLevels = progress.levels.filter((level) => level.earned).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Network className="h-7 w-7 text-amber-300" />
            <h2 className="text-2xl font-bold">My AutoPool Matrix</h2>
          </div>
          <p className="mt-2 text-sm text-emerald-100">Your personal member counts and milestone earnings across all eight levels.</p>
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

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Level</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Users</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Progress</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Reward</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {progress.levels.map((level) => (
              <tr key={level.level} className={level.earned ? 'bg-emerald-50/50' : ''}>
                <td className="whitespace-nowrap px-4 py-4 font-bold text-gray-900">Level {level.level}</td>
                <td className="whitespace-nowrap px-4 py-4">
                  <div className="flex items-center gap-2 text-gray-800">
                    <Users className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold">{Number(level.user_count).toLocaleString()}</span>
                    <span className="text-gray-400">/ {Number(level.required_count).toLocaleString()}</span>
                  </div>
                </td>
                <td className="min-w-48 px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div className={`h-full rounded-full ${level.earned ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, Number(level.progress_percent || 0))}%` }} />
                    </div>
                    <span className="w-14 text-right text-xs font-semibold text-gray-600">{Number(level.progress_percent || 0).toFixed(2)}%</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold text-amber-700">{Number(level.reward_amount).toLocaleString()} USDT</td>
                <td className="whitespace-nowrap px-4 py-4">
                  {level.earned ? (
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4" /> Earned
                      </span>
                      {level.earned_at && <p className="mt-1 text-xs text-gray-500">{new Date(level.earned_at).toLocaleDateString()}</p>}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      <LockKeyhole className="h-3.5 w-3.5" /> Not earned
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AutopoolMatrixProgress;
