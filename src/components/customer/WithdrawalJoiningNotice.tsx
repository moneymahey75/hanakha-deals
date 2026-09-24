import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { WithdrawalJoiningRules } from '../../utils/withdrawalJoiningRules';

export default function WithdrawalJoiningNotice() {
  const [rules, setRules] = useState<WithdrawalJoiningRules | null>(null);

  useEffect(() => {
    let current = true;
    const load = async () => {
      const { data, error } = await supabase.from('tbl_system_settings')
        .select('tss_setting_value').eq('tss_setting_key', 'withdrawal_joining_rules').maybeSingle();
      if (!current || error || !data) return;
      try {
        const value = typeof data.tss_setting_value === 'string'
          ? JSON.parse(data.tss_setting_value) : data.tss_setting_value;
        if (value?.launch && value?.autopool) setRules(value);
      } catch {
        // Do not advertise default rules when the configured rules cannot be read.
      }
    };
    void load();
    window.addEventListener('focus', load);
    return () => { current = false; window.removeEventListener('focus', load); };
  }, []);

  const enabledRules = (['launch', 'autopool'] as const)
    .flatMap((category) => rules?.[category]?.enabled ? [{ category, rule: rules[category] }] : []);
  if (!enabledRules.length) return null;

  return (
    <section aria-labelledby="withdrawal-joining-notice-title" className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6 text-amber-950">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 space-y-3">
          <h2 id="withdrawal-joining-notice-title" className="text-lg font-semibold">Important withdrawal notice</h2>
          {enabledRules.map(({ category, rule }) => {
            const date = new Date(`${rule.from_date}T00:00:00+05:30`).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
            });
            return <p key={category} className="text-sm sm:text-base">
              <strong>{category === 'launch' ? 'Launch' : 'AutoPool'}:</strong> From <strong>{date}</strong>, every user must directly refer at least{' '}
              <strong>{rule.required_count} new {rule.required_count === 1 ? 'member' : 'members'}</strong> who{' '}
              {rule.required_count === 1 ? 'joins' : 'join'} a qualifying{' '}
              <strong>{rule.plan_amounts.map((amount) => `${amount} USDT`).join(' or ')}</strong> plan to become eligible for withdrawals.
            </p>;
          })}
          <p className="text-sm">Earlier members do not count. Once you meet the requirement, it applies to future withdrawals without needing a new joining for each request.</p>
          <details className="text-sm">
            <summary className="w-fit cursor-pointer font-semibold underline underline-offset-4">Terms and conditions apply</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Both the new member’s registration and qualifying joining purchase must be on or after the specified date, starting at midnight India time.</li>
              <li>Only distinct, active, paid direct referrals count. Upgrades, renewals, repeat purchases and matrix spillover do not add qualifying members.</li>
              <li>Launch rules apply to Working, ROI and non-working wallets. AutoPool rules apply to the AutoPool wallet.</li>
              <li>If the admin changes the date, count or qualifying plans, eligibility is recalculated under the updated rules.</li>
              <li>Other withdrawal conditions, including available balance, minimum amount and applicable charges, still apply.</li>
            </ul>
          </details>
        </div>
      </div>
    </section>
  );
}
