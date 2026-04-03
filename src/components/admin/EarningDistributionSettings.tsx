import React, { useEffect, useState } from 'react';
import { adminApi } from '../../lib/adminApi';
import { useNotification } from '../ui/NotificationProvider';
import { Plus, Save, Edit2, Trash2, RefreshCw } from 'lucide-react';

let inFlightMilestonesRequest: Promise<Milestone[]> | null = null;
let inFlightLevelCountsRequest: Promise<LevelCountRow[]> | null = null;

interface Milestone {
  tmm_id: string;
  tmm_title: string;
  tmm_level1_required: number;
  tmm_level2_required: number;
  tmm_level3_required: number;
  tmm_reward_amount: number;
  tmm_currency: string;
  tmm_is_active: boolean;
}

interface LevelCountRow {
  tmlc_user_id: string;
  tmlc_sponsorship_number: string;
  tmlc_level1_count: number;
  tmlc_level2_count: number;
  tmlc_level3_count: number;
  tmlc_updated_at: string;
}

const EarningDistributionSettings: React.FC = () => {
  const notification = useNotification();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [counts, setCounts] = useState<LevelCountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    level1: '',
    level2: '',
    level3: '',
    amount: '',
    isActive: true
  });

  const resetForm = () => {
    setForm({
      title: '',
      level1: '',
      level2: '',
      level3: '',
      amount: '',
      isActive: true
    });
    setEditingId(null);
  };

  const loadMilestones = async () => {
    setLoading(true);
    try {
      const requestPromise = inFlightMilestonesRequest ?? adminApi.post<Milestone[]>('admin-get-earning-milestones');
      inFlightMilestonesRequest = requestPromise;
      const data = await requestPromise;
      setMilestones((data || []) as Milestone[]);
    } catch (error: any) {
      notification.showError('Load Failed', error.message || 'Failed to load milestones');
    } finally {
      inFlightMilestonesRequest = null;
      setLoading(false);
    }
  };

  const loadCounts = async () => {
    setCountsLoading(true);
    try {
      const requestPromise = inFlightLevelCountsRequest ?? adminApi.post<LevelCountRow[]>('admin-get-earning-level-counts');
      inFlightLevelCountsRequest = requestPromise;
      const data = await requestPromise;
      setCounts((data || []) as LevelCountRow[]);
    } catch (error: any) {
      notification.showError('Load Failed', error.message || 'Failed to load level counts');
    } finally {
      inFlightLevelCountsRequest = null;
      setCountsLoading(false);
    }
  };

  useEffect(() => {
    loadMilestones();
    loadCounts();
  }, []);

  const saveMilestone = async () => {
    const level1 = parseInt(form.level1, 10);
    const level2 = parseInt(form.level2, 10);
    const level3 = parseInt(form.level3, 10);
    const amount = parseFloat(form.amount);

    if (!form.title.trim()) {
      notification.showError('Validation', 'Title is required');
      return;
    }
    if (![level1, level2, level3, amount].every((v) => Number.isFinite(v) && v >= 0)) {
      notification.showError('Validation', 'Levels and amount must be valid numbers');
      return;
    }

    try {
      await adminApi.post('admin-save-earning-milestone', {
        id: editingId,
        title: form.title,
        level1,
        level2,
        level3,
        amount,
        isActive: form.isActive
      });
      notification.showSuccess(editingId ? 'Updated' : 'Created', editingId ? 'Milestone updated' : 'Milestone created');

      resetForm();
      loadMilestones();
    } catch (error: any) {
      notification.showError('Save Failed', error.message || 'Failed to save milestone');
    }
  };

  const editMilestone = (milestone: Milestone) => {
    setEditingId(milestone.tmm_id);
    setForm({
      title: milestone.tmm_title,
      level1: String(milestone.tmm_level1_required),
      level2: String(milestone.tmm_level2_required),
      level3: String(milestone.tmm_level3_required),
      amount: String(milestone.tmm_reward_amount),
      isActive: milestone.tmm_is_active
    });
  };

  const deleteMilestone = async (id: string) => {
    if (!confirm('Delete this milestone?')) return;
    try {
      await adminApi.post('admin-delete-earning-milestone', { id });
      notification.showSuccess('Deleted', 'Milestone deleted');
      loadMilestones();
    } catch (error: any) {
      notification.showError('Delete Failed', error.message || 'Failed to delete milestone');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Level Reward Milestones</h3>
            <p className="text-sm text-gray-600">Rewards for upline levels based on network growth</p>
          </div>
          <button
            onClick={loadMilestones}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
          <input
            value={form.title}
            onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Title"
            className="md:col-span-2 px-3 py-2 border border-gray-200 rounded"
          />
          <input
            value={form.level1}
            onChange={(e) => setForm(prev => ({ ...prev, level1: e.target.value }))}
            placeholder="Level 1"
            className="px-3 py-2 border border-gray-200 rounded"
          />
          <input
            value={form.level2}
            onChange={(e) => setForm(prev => ({ ...prev, level2: e.target.value }))}
            placeholder="Level 2"
            className="px-3 py-2 border border-gray-200 rounded"
          />
          <input
            value={form.level3}
            onChange={(e) => setForm(prev => ({ ...prev, level3: e.target.value }))}
            placeholder="Level 3"
            className="px-3 py-2 border border-gray-200 rounded"
          />
          <input
            value={form.amount}
            onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
            placeholder="Reward Amount"
            className="px-3 py-2 border border-gray-200 rounded"
          />
        </div>

        <div className="flex items-center space-x-3 mb-4">
          <label className="flex items-center space-x-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm(prev => ({ ...prev, isActive: e.target.checked }))}
            />
            <span>Active</span>
          </label>
          <button
            onClick={saveMilestone}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{editingId ? 'Update' : 'Add'}</span>
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">L1</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">L2</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">L3</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">Loading...</td></tr>
              ) : milestones.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">No milestones configured.</td></tr>
              ) : (
                milestones.map((row) => (
                  <tr key={row.tmm_id}>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmm_title}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmm_level1_required}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmm_level2_required}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmm_level3_required}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmm_reward_amount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmm_is_active ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => editMilestone(row)} className="p-1 text-blue-600 hover:text-blue-800">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteMilestone(row.tmm_id)} className="p-1 text-red-600 hover:text-red-800">
                          <Trash2 className="h-4 w-4" />
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

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Level Counts</h3>
            <p className="text-sm text-gray-600">Current level counts for sponsors</p>
          </div>
          <button
            onClick={loadCounts}
            className="flex items-center space-x-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sponsor ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level 1</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level 2</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level 3</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {countsLoading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">Loading...</td></tr>
              ) : counts.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">No counts available.</td></tr>
              ) : (
                counts.map((row) => (
                  <tr key={row.tmlc_user_id}>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">{row.tmlc_sponsorship_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmlc_level1_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmlc_level2_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.tmlc_level3_count}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{new Date(row.tmlc_updated_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EarningDistributionSettings;
