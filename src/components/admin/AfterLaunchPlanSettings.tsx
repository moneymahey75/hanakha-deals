import React, { useEffect, useMemo, useState } from 'react';
import { Rocket, Save, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { useAdmin } from '../../contexts/AdminContext';
import { adminApi } from '../../lib/adminApi';
import { useNotification } from '../ui/NotificationProvider';

type DirectIncomeRow = {
  label: string;
  percent: number;
  requiresDirect?: number;
};

type LevelIncomeRow = {
  level: number;
  percent: string;
};

type AfterLaunchPlanConfig = {
  planTitle: string;
  joiningPacks: number[];
  couponDays: number;
  roi: {
    dailyPercent: number;
    durationDays: number;
    targetMultiplier: number;
  };
  directIncome: DirectIncomeRow[];
  levelIncome: LevelIncomeRow[];
  packLevelsNote: string;
  levelUnlockRules: string[];
  nonWorkingIncomeDays: number;
  nonWorkingIncomeTargetMultiplier: number;
  workingIncomeTargetMultiplier: number;
};

const normalizeNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
  }
  if (typeof value === 'string') {
    return value
      .split(/[,\n\r]+/g)
      .map((v) => Number(String(v).trim()))
      .filter((n) => Number.isFinite(n));
  }
  return [];
};

const defaultConfig: AfterLaunchPlanConfig = {
  planTitle: 'SHOPCLIX Plan (Launch)',
  joiningPacks: [50, 100, 200],
  couponDays: 200,
  roi: { dailyPercent: 1, durationDays: 200, targetMultiplier: 2 },
  directIncome: [
    { label: '1st level (Direct)', percent: 7, requiresDirect: 0 },
    { label: '2nd level (Direct)', percent: 1.5, requiresDirect: 3 },
    { label: '3rd level (Direct)', percent: 1, requiresDirect: 9 },
  ],
  levelIncome: Array.from({ length: 15 }).map((_, idx) => {
    const level = idx + 1;
    const map: Record<number, string> = {
      1: '10%',
      2: '5%',
      3: '3%',
      4: '2%',
      5: '1%',
      6: '1%',
      7: '1%',
      8: '1%',
      9: '1%',
      10: '2%',
      11: '1%',
      12: '1%',
      13: '2%',
      14: '2%',
      15: '2%',
    };
    return { level, percent: map[level] || '0%' };
  }),
  packLevelsNote: 'Pack levels: 50 USDT pack = 7 levels • 100 USDT pack = 10 levels • 200 USDT pack = 15 levels',
  levelUnlockRules: ['You can open your 1 level with 1 direct only.', '9 direct = 9 levels open.', '10 direct = 15 levels open.'],
  nonWorkingIncomeDays: 200,
  nonWorkingIncomeTargetMultiplier: 2,
  workingIncomeTargetMultiplier: 5,
};

const AfterLaunchPlanSettings: React.FC = () => {
  const notification = useNotification();
  const { settings, refreshSettings, updateSettings } = useAdmin();

  const initialConfig = useMemo<AfterLaunchPlanConfig>(() => {
    const raw = (settings as any)?.afterLaunchPlanConfig;
    if (!raw || typeof raw !== 'object') return defaultConfig;

    const joiningPacks = normalizeNumberArray((raw as any).joiningPacks);
    const directIncome = Array.isArray((raw as any).directIncome) ? (raw as any).directIncome : [];
    const levelIncome = Array.isArray((raw as any).levelIncome) ? (raw as any).levelIncome : [];

    return {
      ...defaultConfig,
      ...raw,
      joiningPacks: joiningPacks.length > 0 ? joiningPacks : defaultConfig.joiningPacks,
      couponDays: Number.isFinite(Number((raw as any).couponDays)) ? Number((raw as any).couponDays) : defaultConfig.couponDays,
      nonWorkingIncomeDays: Number.isFinite(Number((raw as any).nonWorkingIncomeDays)) ? Number((raw as any).nonWorkingIncomeDays) : defaultConfig.nonWorkingIncomeDays,
      nonWorkingIncomeTargetMultiplier: Number.isFinite(Number((raw as any).nonWorkingIncomeTargetMultiplier)) ? Number((raw as any).nonWorkingIncomeTargetMultiplier) : defaultConfig.nonWorkingIncomeTargetMultiplier,
      workingIncomeTargetMultiplier: Number.isFinite(Number((raw as any).workingIncomeTargetMultiplier)) ? Number((raw as any).workingIncomeTargetMultiplier) : defaultConfig.workingIncomeTargetMultiplier,
      roi: {
        dailyPercent: Number.isFinite(Number((raw as any)?.roi?.dailyPercent)) ? Number((raw as any).roi.dailyPercent) : defaultConfig.roi.dailyPercent,
        durationDays: Number.isFinite(Number((raw as any)?.roi?.durationDays)) ? Number((raw as any).roi.durationDays) : defaultConfig.roi.durationDays,
        targetMultiplier: Number.isFinite(Number((raw as any)?.roi?.targetMultiplier)) ? Number((raw as any).roi.targetMultiplier) : defaultConfig.roi.targetMultiplier,
      },
      directIncome: directIncome
        .map((row: any) => ({
          label: String(row?.label || '').trim(),
          percent: Number(row?.percent),
          requiresDirect: Number.isFinite(Number(row?.requiresDirect)) ? Number(row?.requiresDirect) : 0,
        }))
        .filter((row: any) => row.label && Number.isFinite(row.percent)),
      levelIncome: levelIncome
        .map((row: any) => ({
          level: Number(row?.level),
          percent: String(row?.percent || '').trim(),
        }))
        .filter((row: any) => Number.isFinite(row.level) && row.level > 0 && row.percent),
      levelUnlockRules: Array.isArray((raw as any).levelUnlockRules)
        ? (raw as any).levelUnlockRules.map((s: any) => String(s || '').trim()).filter(Boolean)
        : defaultConfig.levelUnlockRules,
    };
  }, [settings]);

  const [form, setForm] = useState<AfterLaunchPlanConfig>(initialConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initialConfig);
  }, [initialConfig]);

  const save = async () => {
    if (!form.planTitle.trim()) {
      notification.showError('Validation', 'Plan title is required');
      return;
    }
    if (!Array.isArray(form.joiningPacks) || form.joiningPacks.length === 0) {
      notification.showError('Validation', 'Joining packs are required');
      return;
    }
    if (!Number.isFinite(form.couponDays) || form.couponDays <= 0) {
      notification.showError('Validation', 'Coupon days must be a valid number');
      return;
    }
    if (!Number.isFinite(form.roi.dailyPercent) || form.roi.dailyPercent <= 0) {
      notification.showError('Validation', 'ROI daily percent must be valid');
      return;
    }
    if (!Number.isFinite(form.roi.durationDays) || form.roi.durationDays <= 0) {
      notification.showError('Validation', 'ROI duration days must be valid');
      return;
    }
    if (!Number.isFinite(form.nonWorkingIncomeDays) || form.nonWorkingIncomeDays <= 0) {
      notification.showError('Validation', 'Non-working income days must be valid');
      return;
    }
    if (!Number.isFinite(form.nonWorkingIncomeTargetMultiplier) || form.nonWorkingIncomeTargetMultiplier <= 0) {
      notification.showError('Validation', 'Non-working income target multiplier must be valid');
      return;
    }
    if (!Number.isFinite(form.workingIncomeTargetMultiplier) || form.workingIncomeTargetMultiplier <= 0) {
      notification.showError('Validation', 'Working income target multiplier must be valid');
      return;
    }

    setSaving(true);
    try {
        const payload: AfterLaunchPlanConfig = {
          ...form,
          joiningPacks: (form.joiningPacks || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)),
          directIncome: (form.directIncome || []).filter((r) => r.label && Number.isFinite(r.percent)),
          levelIncome: (form.levelIncome || []).filter((r) => Number.isFinite(r.level) && r.percent),
          levelUnlockRules: (form.levelUnlockRules || []).map((s) => String(s || '').trim()).filter(Boolean),
        };

      await adminApi.post('admin-upsert-settings', {
        updates: [
          {
            key: 'after_launch_plan_config',
            value: payload,
            description: 'Configurable content for the After Launch Plan section shown on the Plans page',
          },
        ],
      });

      updateSettings({ afterLaunchPlanConfig: payload } as any);
      await refreshSettings();
      notification.showSuccess('Saved', 'After Launch Plan updated');
    } catch (error: any) {
      notification.showError('Save Failed', error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addDirectIncomeRow = () => {
    setForm((prev) => ({
      ...prev,
      directIncome: [...(prev.directIncome || []), { label: 'New level', percent: 0, requiresDirect: 0 }],
    }));
  };

  const removeDirectIncomeRow = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      directIncome: (prev.directIncome || []).filter((_, i) => i !== idx),
    }));
  };

  const addLevelIncomeRow = () => {
    const nextLevel = Math.max(0, ...(form.levelIncome || []).map((r) => r.level)) + 1;
    setForm((prev) => ({
      ...prev,
      levelIncome: [...(prev.levelIncome || []), { level: nextLevel, percent: '0%' }],
    }));
  };

  const removeLevelIncomeRow = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      levelIncome: (prev.levelIncome || []).filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-3 rounded-lg">
              <Rocket className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">After Launch Plan</h3>
              <p className="text-sm text-gray-600">Controls what users see in the After Launch section on the Plans page.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshSettings}
              className="flex items-center space-x-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            <button
              onClick={save}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
              type="button"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving…' : 'Save'}</span>
            </button>
          </div>
        </div>

        <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded-lg px-4 py-3 text-sm">
          Note: When <span className="font-semibold">Launch Phase</span> is set to <span className="font-semibold">Launched</span>, the system uses
          <span className="font-semibold"> Direct Income</span> rules from this config to distribute upgrade incomes automatically.
          ROI and Level Income parts are currently used for display and will be wired into automation when those earning modules are enabled.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Plan Title</label>
            <input
              value={form.planTitle}
              onChange={(e) => setForm((p) => ({ ...p, planTitle: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Joining Packs</label>
            <input
              value={(form.joiningPacks || []).join(', ')}
              onChange={(e) => setForm((p) => ({ ...p, joiningPacks: normalizeNumberArray(e.target.value) }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="50, 100, 200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Coupon Days</label>
            <input
              type="number"
              value={form.couponDays}
              onChange={(e) => setForm((p) => ({ ...p, couponDays: Number(e.target.value) }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Pack Levels Note</label>
            <input
              value={form.packLevelsNote}
              onChange={(e) => setForm((p) => ({ ...p, packLevelsNote: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-6 border border-gray-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Income Targets (Level Income)</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Non-working income days</label>
              <input
                type="number"
                min={1}
                value={form.nonWorkingIncomeDays}
                onChange={(e) => setForm((p) => ({ ...p, nonWorkingIncomeDays: Number(e.target.value) }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Non-working target (x)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.nonWorkingIncomeTargetMultiplier}
                onChange={(e) => setForm((p) => ({ ...p, nonWorkingIncomeTargetMultiplier: Number(e.target.value) }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Working target (x)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.workingIncomeTargetMultiplier}
                onChange={(e) => setForm((p) => ({ ...p, workingIncomeTargetMultiplier: Number(e.target.value) }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Non-working income runs for fixed days (example 200 days for 2x). Working income target is based on multiplier (example 5x) and does not depend on days.
          </p>
        </div>

        <div className="mt-6 border border-gray-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">ROI</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Daily %</label>
              <input
                type="number"
                step="0.01"
                value={form.roi.dailyPercent}
                onChange={(e) => setForm((p) => ({ ...p, roi: { ...p.roi, dailyPercent: Number(e.target.value) } }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Duration (days)</label>
              <input
                type="number"
                value={form.roi.durationDays}
                onChange={(e) => setForm((p) => ({ ...p, roi: { ...p.roi, durationDays: Number(e.target.value) } }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={1}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Multiplier</label>
              <input
                type="number"
                step="0.01"
                value={form.roi.targetMultiplier}
                onChange={(e) => setForm((p) => ({ ...p, roi: { ...p.roi, targetMultiplier: Number(e.target.value) } }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                min={0}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-900">Direct Income</h4>
            <button
              type="button"
              onClick={addDirectIncomeRow}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-3">
            {(form.directIncome || []).map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <input
                  value={row.label}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      directIncome: p.directIncome.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)),
                    }))
                  }
                  className="md:col-span-6 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Label"
                />
                <input
                  type="number"
                  step="0.01"
                  value={row.percent}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      directIncome: p.directIncome.map((r, i) => (i === idx ? { ...r, percent: Number(e.target.value) } : r)),
                    }))
                  }
                  className="md:col-span-3 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="%"
                />
                <input
                  type="number"
                  step="1"
                  value={row.requiresDirect ?? 0}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      directIncome: p.directIncome.map((r, i) => (i === idx ? { ...r, requiresDirect: Number(e.target.value) } : r)),
                    }))
                  }
                  className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Req direct"
                />
                <button
                  type="button"
                  onClick={() => removeDirectIncomeRow(idx)}
                  className="md:col-span-1 p-2 text-red-600 hover:text-red-800"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-900">Level Income</h4>
            <button
              type="button"
              onClick={addLevelIncomeRow}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>

          <div className="space-y-3">
            {(form.levelIncome || []).map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                <input
                  type="number"
                  value={row.level}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      levelIncome: p.levelIncome.map((r, i) => (i === idx ? { ...r, level: Number(e.target.value) } : r)),
                    }))
                  }
                  className="md:col-span-3 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Level"
                  min={1}
                />
                <input
                  value={row.percent}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      levelIncome: p.levelIncome.map((r, i) => (i === idx ? { ...r, percent: e.target.value } : r)),
                    }))
                  }
                  className="md:col-span-8 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Percent (e.g. 2%)"
                />
                <button
                  type="button"
                  onClick={() => removeLevelIncomeRow(idx)}
                  className="md:col-span-1 p-2 text-red-600 hover:text-red-800"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border border-gray-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Level Unlock Rules</h4>
          <textarea
            value={(form.levelUnlockRules || []).join('\n')}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                levelUnlockRules: e.target.value
                  .split(/\n/g)
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            placeholder="One rule per line"
          />
        </div>
      </div>
    </div>
  );
};

export default AfterLaunchPlanSettings;
