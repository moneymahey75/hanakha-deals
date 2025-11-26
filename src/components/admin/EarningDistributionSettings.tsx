import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save, AlertCircle, Edit2, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface EarningDistributionRule {
  id: string;
  direct_account_range_start: number;
  direct_account_range_end: number;
  direct_referrer_percentage: number;
  upline_levels_start: number | null;
  upline_levels_end: number | null;
  upline_percentage: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RuleFormData {
  direct_account_range_start: string;
  direct_account_range_end: string;
  direct_referrer_percentage: string;
  upline_levels_start: string;
  upline_levels_end: string;
  upline_percentage: string;
  is_active: boolean;
}

const EarningDistributionSettings: React.FC = () => {
  const [rules, setRules] = useState<EarningDistributionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<RuleFormData>({
    direct_account_range_start: '',
    direct_account_range_end: '',
    direct_referrer_percentage: '10.00',
    upline_levels_start: '',
    upline_levels_end: '',
    upline_percentage: '',
    is_active: true,
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('earning_distribution_settings')
        .select('*')
        .order('direct_account_range_start', { ascending: true });

      if (error) throw error;
      setRules(data || []);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load earning distribution settings');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const resetForm = () => {
    setFormData({
      direct_account_range_start: '',
      direct_account_range_end: '',
      direct_referrer_percentage: '10.00',
      upline_levels_start: '',
      upline_levels_end: '',
      upline_percentage: '',
      is_active: true,
    });
    setEditingRule(null);
    setShowAddForm(false);
  };

  const validateForm = (): boolean => {
    if (!formData.direct_account_range_start || !formData.direct_account_range_end) {
      toast.error('Please enter direct account range');
      return false;
    }

    const start = parseInt(formData.direct_account_range_start);
    const end = parseInt(formData.direct_account_range_end);

    if (start > end) {
      toast.error('Start range must be less than or equal to end range');
      return false;
    }

    if (!formData.direct_referrer_percentage) {
      toast.error('Please enter direct referrer percentage');
      return false;
    }

    const directPercentage = parseFloat(formData.direct_referrer_percentage);
    if (directPercentage < 0 || directPercentage > 100) {
      toast.error('Direct referrer percentage must be between 0 and 100');
      return false;
    }

    if (formData.upline_levels_start || formData.upline_levels_end || formData.upline_percentage) {
      if (!formData.upline_levels_start || !formData.upline_levels_end || !formData.upline_percentage) {
        toast.error('Please fill all upline level fields or leave them all empty');
        return false;
      }

      const uplineStart = parseInt(formData.upline_levels_start);
      const uplineEnd = parseInt(formData.upline_levels_end);
      const uplinePercentage = parseFloat(formData.upline_percentage);

      if (uplineStart > uplineEnd) {
        toast.error('Upline start level must be less than or equal to upline end level');
        return false;
      }

      if (uplinePercentage < 0 || uplinePercentage > 100) {
        toast.error('Upline percentage must be between 0 and 100');
        return false;
      }
    }

    return true;
  };

  const handleAddRule = async () => {
    if (!validateForm()) return;

    try {
      const newRule = {
        direct_account_range_start: parseInt(formData.direct_account_range_start),
        direct_account_range_end: parseInt(formData.direct_account_range_end),
        direct_referrer_percentage: parseFloat(formData.direct_referrer_percentage),
        upline_levels_start: formData.upline_levels_start ? parseInt(formData.upline_levels_start) : null,
        upline_levels_end: formData.upline_levels_end ? parseInt(formData.upline_levels_end) : null,
        upline_percentage: formData.upline_percentage ? parseFloat(formData.upline_percentage) : null,
        is_active: formData.is_active,
      };

      const { error } = await supabase
        .from('earning_distribution_settings')
        .insert([newRule]);

      if (error) throw error;

      toast.success('Earning distribution rule added successfully');
      resetForm();
      fetchRules();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add earning distribution rule');
    }
  };

  const handleUpdateRule = async () => {
    if (!validateForm() || !editingRule) return;

    try {
      const updatedRule = {
        direct_account_range_start: parseInt(formData.direct_account_range_start),
        direct_account_range_end: parseInt(formData.direct_account_range_end),
        direct_referrer_percentage: parseFloat(formData.direct_referrer_percentage),
        upline_levels_start: formData.upline_levels_start ? parseInt(formData.upline_levels_start) : null,
        upline_levels_end: formData.upline_levels_end ? parseInt(formData.upline_levels_end) : null,
        upline_percentage: formData.upline_percentage ? parseFloat(formData.upline_percentage) : null,
        is_active: formData.is_active,
      };

      const { error } = await supabase
        .from('earning_distribution_settings')
        .update(updatedRule)
        .eq('id', editingRule);

      if (error) throw error;

      toast.success('Earning distribution rule updated successfully');
      resetForm();
      fetchRules();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update earning distribution rule');
    }
  };

  const handleEditRule = (rule: EarningDistributionRule) => {
    setFormData({
      direct_account_range_start: rule.direct_account_range_start.toString(),
      direct_account_range_end: rule.direct_account_range_end.toString(),
      direct_referrer_percentage: rule.direct_referrer_percentage.toString(),
      upline_levels_start: rule.upline_levels_start?.toString() || '',
      upline_levels_end: rule.upline_levels_end?.toString() || '',
      upline_percentage: rule.upline_percentage?.toString() || '',
      is_active: rule.is_active,
    });
    setEditingRule(rule.id);
    setShowAddForm(true);
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this earning distribution rule?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('earning_distribution_settings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Earning distribution rule deleted successfully');
      fetchRules();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete earning distribution rule');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Earning Distribution Settings</h2>
          <p className="text-gray-600 mt-1">Configure MLM commission rules for different account levels</p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            Add New Rule
          </button>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-2">How Earning Distribution Works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Direct referrer always receives their percentage from the new user's subscription</li>
              <li>Upline levels receive percentages based on which direct account number this is for the referrer</li>
              <li>Example: If this is the 5th direct account, levels 4-8 in the upline tree each get their configured percentage</li>
              <li>Rules are applied automatically during customer registration</li>
            </ul>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingRule ? 'Edit Rule' : 'Add New Rule'}
            </h3>
            <button
              onClick={resetForm}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direct Account Range Start *
              </label>
              <input
                type="number"
                name="direct_account_range_start"
                value={formData.direct_account_range_start}
                onChange={handleInputChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direct Account Range End *
              </label>
              <input
                type="number"
                name="direct_account_range_end"
                value={formData.direct_account_range_end}
                onChange={handleInputChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Direct Referrer Percentage (%) *
              </label>
              <input
                type="number"
                name="direct_referrer_percentage"
                value={formData.direct_referrer_percentage}
                onChange={handleInputChange}
                min="0"
                max="100"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 10.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upline Levels Start
              </label>
              <input
                type="number"
                name="upline_levels_start"
                value={formData.upline_levels_start}
                onChange={handleInputChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upline Levels End
              </label>
              <input
                type="number"
                name="upline_levels_end"
                value={formData.upline_levels_end}
                onChange={handleInputChange}
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upline Percentage (%)
              </label>
              <input
                type="number"
                name="upline_percentage"
                value={formData.upline_percentage}
                onChange={handleInputChange}
                min="0"
                max="100"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 5.00"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleInputChange}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label className="ml-2 text-sm font-medium text-gray-700">
                Active Rule
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={editingRule ? handleUpdateRule : handleAddRule}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Save className="w-4 h-4" />
              {editingRule ? 'Update Rule' : 'Add Rule'}
            </button>
            <button
              onClick={resetForm}
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
                  Direct Account Range
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Direct Referrer %
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Upline Levels
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Upline %
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
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No earning distribution rules configured yet
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">
                        {rule.direct_account_range_start === rule.direct_account_range_end
                          ? `Account #${rule.direct_account_range_start}`
                          : `Accounts #${rule.direct_account_range_start}-${rule.direct_account_range_end}`}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{rule.direct_referrer_percentage}%</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {rule.upline_levels_start && rule.upline_levels_end ? (
                        <span className="text-sm text-gray-900">
                          {rule.upline_levels_start === rule.upline_levels_end
                            ? `Level ${rule.upline_levels_start}`
                            : `Levels ${rule.upline_levels_start}-${rule.upline_levels_end}`}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {rule.upline_percentage ? (
                        <span className="text-sm text-gray-900">{rule.upline_percentage}%</span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          rule.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditRule(rule)}
                          className="text-blue-600 hover:text-blue-800 transition"
                          title="Edit rule"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Delete rule"
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
    </div>
  );
};

export default EarningDistributionSettings;
