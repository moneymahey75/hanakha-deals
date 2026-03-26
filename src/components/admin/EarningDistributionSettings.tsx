import React, { useEffect, useMemo, useState } from 'react';
import { adminSupabase as supabase } from '../../lib/adminSupabase';
import { Plus, Trash2, Save, Edit2, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface MlmRewardMilestone {
  tmm_id: string;
  tmm_title: string;
  tmm_level1_required: number;
  tmm_level2_required: number;
  tmm_level3_required: number;
  tmm_reward_amount: number;
  tmm_currency: string;
  tmm_is_active: boolean;
  tmm_created_at: string;
  tmm_updated_at: string;
}

interface MilestoneFormData {
  title: string;
  level1_required: string;
  level2_required: string;
  level3_required: string;
  reward_amount: string;
  is_active: boolean;
}

interface LevelCountRow {
  tmlc_user_id: string;
  tmlc_sponsorship_number: string;
  tmlc_level1_count: number;
  tmlc_level2_count: number;
  tmlc_level3_count: number;
  tmlc_updated_at: string;
}

interface ProfileRow {
  tup_user_id: string;
  tup_username: string | null;
  tup_first_name: string | null;
  tup_last_name: string | null;
}

const EarningDistributionSettings: React.FC = () => {
  const [milestones, setMilestones] = useState<MlmRewardMilestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(true);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState<MilestoneFormData>({
    title: '',
    level1_required: '',
    level2_required: '',
    level3_required: '',
    reward_amount: '',
    is_active: true,
  });
  const [counts, setCounts] = useState<LevelCountRow[]>([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [profileMap, setProfileMap] = useState<Map<string, ProfileRow>>(new Map());
  const [recomputeLoading, setRecomputeLoading] = useState(false);

  useEffect(() => {
    fetchMilestones();
    fetchCounts();
  }, []);

  const fetchMilestones = async () => {
    try {
      setMilestonesLoading(true);
      const { data, error } = await supabase
        .from('tbl_mlm_reward_milestones')
        .select('*')
        .order('tmm_reward_amount', { ascending: true });

      if (error) throw error;
      setMilestones(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load MLM reward milestones');
    } finally {
      setMilestonesLoading(false);
    }
  };

  const fetchCounts = async () => {
    try {
      setCountsLoading(true);
      const { data, error } = await supabase
        .from('tbl_mlm_level_counts')
        .select('*')
        .order('tmlc_level1_count', { ascending: false });

      if (error) throw error;
      const rows = data || [];
      setCounts(rows as LevelCountRow[]);

      const userIds = Array.from(new Set(rows.map((row: LevelCountRow) => row.tmlc_user_id).filter(Boolean)));
      if (userIds.length === 0) {
        setProfileMap(new Map());
        return;
      }

      const { data: profiles, error: profileError } = await supabase
        .from('tbl_user_profiles')
        .select('tup_user_id, tup_username, tup_first_name, tup_last_name')
        .in('tup_user_id', userIds);

      if (profileError) throw profileError;

      const map = new Map<string, ProfileRow>();
      (profiles || []).forEach((profile: ProfileRow) => {
        map.set(profile.tup_user_id, profile);
      });
      setProfileMap(map);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load MLM level counts');
    } finally {
      setCountsLoading(false);
    }
  };

  const handleMilestoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setMilestoneForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const resetMilestoneForm = () => {
    setMilestoneForm({
      title: '',
      level1_required: '',
      level2_required: '',
      level3_required: '',
      reward_amount: '',
      is_active: true,
    });
    setEditingMilestone(null);
    setShowMilestoneForm(false);
  };

  const validateMilestoneForm = (): boolean => {
    if (!milestoneForm.title.trim()) {
      toast.error('Please enter a title for the milestone');
      return false;
    }

    const level1 = parseInt(milestoneForm.level1_required);
    const level2 = parseInt(milestoneForm.level2_required);
    const level3 = parseInt(milestoneForm.level3_required);

    if (!Number.isFinite(level1) || !Number.isFinite(level2) || !Number.isFinite(level3)) {
      toast.error('Please enter valid level requirements');
      return false;
    }

    if (level1 <= 0 || level2 <= 0 || level3 <= 0) {
      toast.error('Level requirements must be greater than 0');
      return false;
    }

    const rewardAmount = parseFloat(milestoneForm.reward_amount);
    if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
      toast.error('Please enter a valid reward amount');
      return false;
    }

    return true;
  };

  const handleAddMilestone = async () => {
    if (!validateMilestoneForm()) return;

    try {
      const newMilestone = {
        tmm_title: milestoneForm.title.trim(),
        tmm_level1_required: parseInt(milestoneForm.level1_required),
        tmm_level2_required: parseInt(milestoneForm.level2_required),
        tmm_level3_required: parseInt(milestoneForm.level3_required),
        tmm_reward_amount: parseFloat(milestoneForm.reward_amount),
        tmm_currency: 'USDT',
        tmm_is_active: milestoneForm.is_active,
      };

      const { error } = await supabase
        .from('tbl_mlm_reward_milestones')
        .insert([newMilestone]);

      if (error) throw error;

      toast.success('MLM reward milestone added successfully');
      resetMilestoneForm();
      fetchMilestones();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add MLM reward milestone');
    }
  };

  const handleUpdateMilestone = async () => {
    if (!validateMilestoneForm() || !editingMilestone) return;

    try {
      const updatedMilestone = {
        tmm_title: milestoneForm.title.trim(),
        tmm_level1_required: parseInt(milestoneForm.level1_required),
        tmm_level2_required: parseInt(milestoneForm.level2_required),
        tmm_level3_required: parseInt(milestoneForm.level3_required),
        tmm_reward_amount: parseFloat(milestoneForm.reward_amount),
        tmm_is_active: milestoneForm.is_active,
      };

      const { error } = await supabase
        .from('tbl_mlm_reward_milestones')
        .update(updatedMilestone)
        .eq('tmm_id', editingMilestone);

      if (error) throw error;

      toast.success('MLM reward milestone updated successfully');
      resetMilestoneForm();
      fetchMilestones();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update MLM reward milestone');
    }
  };

  const handleEditMilestone = (milestone: MlmRewardMilestone) => {
    setMilestoneForm({
      title: milestone.tmm_title,
      level1_required: milestone.tmm_level1_required.toString(),
      level2_required: milestone.tmm_level2_required.toString(),
      level3_required: milestone.tmm_level3_required.toString(),
      reward_amount: milestone.tmm_reward_amount.toString(),
      is_active: milestone.tmm_is_active,
    });
    setEditingMilestone(milestone.tmm_id);
    setShowMilestoneForm(true);
  };

  const handleDeleteMilestone = async (id: string) => {
    if (!confirm('Are you sure you want to delete this MLM reward milestone?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tbl_mlm_reward_milestones')
        .delete()
        .eq('tmm_id', id);

      if (error) throw error;

      toast.success('MLM reward milestone deleted successfully');
      fetchMilestones();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete MLM reward milestone');
    }
  };

  const handleRecomputeCounts = async () => {
    if (!confirm('Recompute counts for all users? This may take a moment.')) return;

    try {
      setRecomputeLoading(true);
      const { data, error } = await supabase.rpc('recompute_all_mlm_level_counts');
      if (error) throw error;

      const processed = typeof data === 'number' ? data : 0;
      toast.success(`Recomputed counts for ${processed} users`);
      fetchCounts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to recompute MLM counts');
    } finally {
      setRecomputeLoading(false);
    }
  };

  const countRows = useMemo(() => counts, [counts]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">MLM Level Rewards</h2>
          <p className="text-gray-600 mt-1">Manage milestone rewards and level counts</p>
        </div>
        {!showMilestoneForm && (
          <button
            onClick={() => setShowMilestoneForm(true)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
          >
            <Plus className="w-5 h-5" />
            Add Milestone
          </button>
        )}
      </div>

      {showMilestoneForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingMilestone ? 'Edit Milestone' : 'Add Milestone'}
            </h3>
            <button
              onClick={resetMilestoneForm}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Milestone Title *
              </label>
              <input
                type="text"
                name="title"
                value={milestoneForm.title}
                onChange={handleMilestoneInputChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="Level reward for 5 direct / 15 level-2 / 30 level-3 members"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Level 1 Required *
              </label>
              <input
                type="number"
                name="level1_required"
                value={milestoneForm.level1_required}
                onChange={handleMilestoneInputChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="e.g., 5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Level 2 Required *
              </label>
              <input
                type="number"
                name="level2_required"
                value={milestoneForm.level2_required}
                onChange={handleMilestoneInputChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="e.g., 15"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Level 3 Required *
              </label>
              <input
                type="number"
                name="level3_required"
                value={milestoneForm.level3_required}
                onChange={handleMilestoneInputChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="e.g., 30"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reward Amount (USDT) *
              </label>
              <input
                type="number"
                name="reward_amount"
                value={milestoneForm.reward_amount}
                onChange={handleMilestoneInputChange}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                placeholder="e.g., 50"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="is_active"
                checked={milestoneForm.is_active}
                onChange={handleMilestoneInputChange}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <label className="ml-2 text-sm font-medium text-gray-700">
                Active Milestone
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={editingMilestone ? handleUpdateMilestone : handleAddMilestone}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition"
            >
              <Save className="w-4 h-4" />
              {editingMilestone ? 'Update Milestone' : 'Add Milestone'}
            </button>
            <button
              onClick={resetMilestoneForm}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level 1
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level 2
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level 3
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reward (USDT)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {milestonesLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Loading milestones...
                  </td>
                </tr>
              ) : milestones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No MLM reward milestones configured yet
                  </td>
                </tr>
              ) : (
                milestones.map((milestone) => (
                  <tr key={milestone.tmm_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{milestone.tmm_title}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{milestone.tmm_level1_required}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{milestone.tmm_level2_required}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{milestone.tmm_level3_required}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{milestone.tmm_reward_amount}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          milestone.tmm_is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {milestone.tmm_is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditMilestone(milestone)}
                          className="text-blue-600 hover:text-blue-800 transition"
                          title="Edit milestone"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMilestone(milestone.tmm_id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Delete milestone"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center pt-6 border-t border-gray-200">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">MLM Level Counts</h2>
          <p className="text-gray-600 mt-1">Paid and active members only, updated on payment</p>
        </div>
        <button
          onClick={handleRecomputeCounts}
          disabled={recomputeLoading}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-5 h-5 ${recomputeLoading ? 'animate-spin' : ''}`} />
          Recompute All
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sponsorship
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level 1
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level 2
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level 3
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {countsLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Loading counts...
                  </td>
                </tr>
              ) : countRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No MLM level counts available yet
                  </td>
                </tr>
              ) : (
                countRows.map((row) => {
                  const profile = profileMap.get(row.tmlc_user_id);
                  const displayName = profile?.tup_username
                    || [profile?.tup_first_name, profile?.tup_last_name].filter(Boolean).join(' ')
                    || 'Unknown';

                  return (
                    <tr key={row.tmlc_user_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">{displayName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 font-mono">{row.tmlc_sponsorship_number}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{row.tmlc_level1_count}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{row.tmlc_level2_count}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{row.tmlc_level3_count}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{new Date(row.tmlc_updated_at).toLocaleString()}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EarningDistributionSettings;
