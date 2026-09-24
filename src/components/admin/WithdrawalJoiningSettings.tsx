import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { WithdrawalJoiningRules } from '../../utils/withdrawalJoiningRules';

export default function WithdrawalJoiningSettings({ value, onChange }: {
  value: WithdrawalJoiningRules;
  onChange: (value: WithdrawalJoiningRules) => void;
}) {
  const [autopoolAmounts, setAutopoolAmounts] = useState([20]);
  useEffect(() => {
    supabase.from('tbl_subscription_plans').select('tsp_price, tsp_product_code')
      .eq('tsp_is_active', true).then(({ data }) => {
        const amounts = (data || []).filter((plan) => String(plan.tsp_product_code || '').startsWith('autopool_'))
          .map((plan) => Number(plan.tsp_price));
        if (amounts.length) setAutopoolAmounts([...new Set(amounts)].sort((a, b) => a - b));
      });
  }, []);
  return <div className="md:col-span-2 space-y-4 rounded-lg border border-gray-200 p-4">
    <h4 className="font-semibold text-gray-900">New joinings required for withdrawal</h4>
    <p className="text-sm text-gray-600">Applies to every user. Only distinct direct referrals registered on or after the date below with a paid qualifying joining plan count. Dates start at midnight India time (Asia/Kolkata). Existing members, upgrades, renewals and matrix spillover do not count. Once met, the requirement unlocks future withdrawals until the admin changes these rules.</p>
    {(['launch', 'autopool'] as const).map((category) => {
      const rule = value[category];
      const update = (patch: Partial<typeof rule>) => onChange({ ...value, [category]: { ...rule, ...patch } });
      const amounts = [...new Set([...(category === 'launch' ? [50, 100, 200] : autopoolAmounts), ...rule.plan_amounts])].sort((a, b) => a - b);
      return <fieldset key={category} className="space-y-3 border-t pt-3">
        <legend className="font-medium">{category === 'launch' ? 'Launch — Working, ROI and non-working wallets' : 'AutoPool wallet'}</legend>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.enabled} onChange={(e) => update({ enabled: e.target.checked })} />Require new joinings</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Joining cutoff date (India time)
            <input aria-label={`${category} joining cutoff date`} type="date" required value={rule.from_date} onChange={(e) => update({ from_date: e.target.value })} className="mt-1 block w-full rounded border p-2" />
          </label>
          <label className="text-sm">Required direct joinings
            <input aria-label={`${category} required joinings`} type="number" required min="1" max="100000" step="1" value={rule.required_count} onChange={(e) => update({ required_count: Number(e.target.value) })} className="mt-1 block w-full rounded border p-2" />
          </label>
        </div>
        <div className="text-sm">Qualifying joining plans (any selected exact amount)</div>
        <div className="flex flex-wrap gap-4">{amounts.map((amount) => <label key={amount} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rule.plan_amounts.includes(amount)} onChange={(e) => update({ plan_amounts: e.target.checked ? [...rule.plan_amounts, amount] : rule.plan_amounts.filter((v) => v !== amount) })} />{amount} USDT
        </label>)}</div>
        {rule.plan_amounts.length === 0 && <p className="text-sm text-red-600">Select at least one qualifying plan before saving.</p>}
      </fieldset>;
    })}
  </div>;
}
