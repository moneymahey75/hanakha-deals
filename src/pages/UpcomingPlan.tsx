import React from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../contexts/AdminContext';
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  Gift,
  Layers,
  Rocket,
  ShieldCheck,
  Users
} from 'lucide-react';

const UpcomingPlan: React.FC = () => {
  const { settings } = useAdmin();
  const launchPhase = (settings?.launchPhase || 'prelaunch') as 'prelaunch' | 'launched';
  const isLaunched = launchPhase === 'launched';
  const afterLaunchConfig = (settings as any)?.afterLaunchPlanConfig || null;
  const rewards = [
    {
      title: 'Team Reward 1',
      highlight: '50 USDT reward',
      conditions: [
        { label: 'Direct', value: '5 persons' },
        { label: '2nd level', value: '15 persons' },
        { label: '3rd level', value: '30 persons' },
      ],
      note: 'Reward: 50 USDT cash OR 50 USDT joining at launch time',
    },
    {
      title: 'Team Reward 2',
      highlight: '100 USDT reward',
      conditions: [
        { label: 'Direct', value: '15 persons' },
        { label: '2nd level', value: '45 persons' },
        { label: '3rd level', value: '90 persons' },
      ],
      note: 'Reward: 100 USDT cash OR 100 USDT joining at launch time',
    },
  ];

  const levelIncome = [
    { level: 1, percent: '10%' },
    { level: 2, percent: '5%' },
    { level: 3, percent: '3%' },
    { level: 4, percent: '2%' },
    { level: 5, percent: '1%' },
    { level: 6, percent: '1%' },
    { level: 7, percent: '1%' },
    { level: 8, percent: '1%' },
    { level: 9, percent: '1%' },
    { level: 10, percent: '2%' },
    { level: 11, percent: '1%' },
    { level: 12, percent: '1%' },
    { level: 13, percent: '2%' },
    { level: 14, percent: '2%' },
    { level: 15, percent: '2%' },
  ];

  const effectiveAfterLaunch = {
    planTitle: afterLaunchConfig?.planTitle || 'SHOPCLIX Plan (Launch)',
    joiningPacks: Array.isArray(afterLaunchConfig?.joiningPacks) ? afterLaunchConfig.joiningPacks : [50, 100, 200],
    couponDays: Number.isFinite(Number(afterLaunchConfig?.couponDays)) ? Number(afterLaunchConfig.couponDays) : 200,
    roi: {
      dailyPercent: Number.isFinite(Number(afterLaunchConfig?.roi?.dailyPercent)) ? Number(afterLaunchConfig.roi.dailyPercent) : 1,
      durationDays: Number.isFinite(Number(afterLaunchConfig?.roi?.durationDays)) ? Number(afterLaunchConfig.roi.durationDays) : 200,
      targetMultiplier: Number.isFinite(Number(afterLaunchConfig?.roi?.targetMultiplier)) ? Number(afterLaunchConfig.roi.targetMultiplier) : 2,
    },
    directIncome: Array.isArray(afterLaunchConfig?.directIncome)
      ? afterLaunchConfig.directIncome
      : [
          { label: '1st level (Direct)', percent: 7, requiresDirect: 0 },
          { label: '2nd level (Direct)', percent: 1.5, requiresDirect: 3 },
          { label: '3rd level (Direct)', percent: 1, requiresDirect: 9 },
        ],
    levelIncome: Array.isArray(afterLaunchConfig?.levelIncome) ? afterLaunchConfig.levelIncome : levelIncome,
    packLevelsNote:
      String(afterLaunchConfig?.packLevelsNote || '').trim() ||
      'Pack levels: 50 USDT pack = 7 levels • 100 USDT pack = 10 levels • 200 USDT pack = 15 levels',
    levelUnlockRules: Array.isArray(afterLaunchConfig?.levelUnlockRules)
      ? afterLaunchConfig.levelUnlockRules
      : ['You can open your 1 level with 1 direct only.', '9 direct = 9 levels open.', '10 direct = 15 levels open.'],
    nonWorkingIncomeDays: Number.isFinite(Number(afterLaunchConfig?.nonWorkingIncomeDays)) ? Number(afterLaunchConfig.nonWorkingIncomeDays) : 200,
    nonWorkingIncomeTargetMultiplier: Number.isFinite(Number(afterLaunchConfig?.nonWorkingIncomeTargetMultiplier)) ? Number(afterLaunchConfig.nonWorkingIncomeTargetMultiplier) : 2,
    workingIncomeTargetMultiplier: Number.isFinite(Number(afterLaunchConfig?.workingIncomeTargetMultiplier)) ? Number(afterLaunchConfig.workingIncomeTargetMultiplier) : 5,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-gray-50">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-emerald-500 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-indigo-500 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white">
            <Rocket className="h-4 w-4 text-emerald-300" />
            <span className="text-sm font-semibold">{isLaunched ? 'Launched' : 'Prelaunch'} • Plans</span>
          </div>

          <h1 className="mt-5 text-3xl sm:text-5xl font-extrabold text-white leading-tight">
            A big opportunity for all MLM leaders
          </h1>
          <p className="mt-3 text-white/80 text-lg">
            {isLaunched
              ? 'ShopClix has launched. Choose a plan to activate coupons and earning benefits.'
              : 'ShopClix is in a prelaunch period. Join early and build your team before launch.'}
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              to={isLaunched ? '/subscription-plans' : '/customer/register'}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600 transition-colors"
            >
              {isLaunched ? 'Choose Plan' : 'Register Now'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
          {!isLaunched && (
          <section className="rounded-3xl border border-emerald-100 bg-gradient-to-b from-emerald-50/60 to-white shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-6 pt-6">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <h2 className="text-xl font-extrabold text-gray-900">Pre Launch Plan</h2>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-600/10 text-emerald-800 px-3 py-1 text-xs font-semibold border border-emerald-200">
                Before launch
              </div>
            </div>
            <div className="px-6 pb-6 pt-5 space-y-6">

          {/* Prelaunch highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3">
                <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold text-gray-900">Just Register</h2>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-gray-900">5 USDT</div>
              <p className="mt-2 text-sm text-gray-600">Prelaunch registration amount</p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-indigo-600" />
                <h2 className="font-semibold text-gray-900">Direct Income</h2>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-gray-900">40%</div>
              <p className="mt-2 text-sm text-gray-600">On registration: <span className="font-semibold">2 USDT</span></p>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3">
                <Gift className="h-5 w-5 text-amber-600" />
                <h2 className="font-semibold text-gray-900">Team Rewards</h2>
              </div>
              <div className="mt-3 text-3xl font-extrabold text-gray-900">50–100 USDT</div>
              <p className="mt-2 text-sm text-gray-600">Rewards based on team registrations</p>
            </div>
          </div>

          {/* Rewards */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-gray-900">Rewards on Team Registration</h2>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {rewards.map((reward) => (
                <div key={reward.title} className="rounded-2xl border border-gray-100 bg-gradient-to-b from-emerald-50 to-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-gray-900">{reward.title}</div>
                    <div className="text-sm font-semibold text-emerald-700">{reward.highlight}</div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {reward.conditions.map((c) => (
                      <div key={c.label} className="flex items-center justify-between rounded-xl bg-white border border-gray-100 px-4 py-2">
                        <span className="text-sm text-gray-600">{c.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{c.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">System:</span> {reward.note}
                  </div>
                </div>
              ))}
            </div>
          </div>
            </div>
          </section>
          )}

          <section className="rounded-3xl border border-indigo-100 bg-gradient-to-b from-indigo-50/60 to-white shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-6 pt-6">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                <h2 className="text-xl font-extrabold text-gray-900">After Launch Plan</h2>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-indigo-600/10 text-indigo-800 px-3 py-1 text-xs font-semibold border border-indigo-200">
                After launch
              </div>
            </div>
            <div className="px-6 pb-6 pt-5 space-y-6">

          {/* SHOPCLIX PLAN */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <Rocket className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">{effectiveAfterLaunch.planTitle}</h2>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <h3 className="font-semibold text-gray-900">Joining Packs</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {(effectiveAfterLaunch.joiningPacks || [])
                    .map((p: any) => `${Number(p)} USDT`)
                    .filter((s: string) => s !== 'NaN USDT')
                    .join(' • ') || '—'}
                </p>
                <div className="mt-4 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-gray-900">Daily shopping coupons</div>
                    <div className="text-sm text-gray-600">
                      System provides coupons for <span className="font-semibold">{effectiveAfterLaunch.couponDays} days</span>.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-indigo-50 to-white p-5">
                <h3 className="font-semibold text-gray-900">1st Income: ROI</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white border border-gray-100 p-4">
                    <div className="text-xs text-gray-600">Daily return</div>
                    <div className="text-xl font-extrabold text-gray-900">{effectiveAfterLaunch.roi.dailyPercent}%</div>
                  </div>
                  <div className="rounded-xl bg-white border border-gray-100 p-4">
                    <div className="text-xs text-gray-600">Duration</div>
                    <div className="text-xl font-extrabold text-gray-900">{effectiveAfterLaunch.roi.durationDays} days</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  Target: <span className="font-semibold text-gray-900">{effectiveAfterLaunch.roi.targetMultiplier}x</span> in {effectiveAfterLaunch.roi.durationDays} days.
                </p>
              </div>
            </div>
          </div>

          {/* Direct income */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-gray-900">2nd Income: Direct Income</h2>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {(effectiveAfterLaunch.directIncome || []).slice(0, 6).map((row: any) => {
                const percentValue = Number(row?.percent);
                const requiresDirect = Number(row?.requiresDirect || 0);
                return (
                  <div key={String(row?.label || Math.random())} className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                    <div className="text-sm text-gray-600">{String(row?.label || '').trim() || 'Direct income'}</div>
                    <div className="mt-1 text-2xl font-extrabold text-gray-900">
                      {Number.isFinite(percentValue) ? `${percentValue}%` : '—'}
                    </div>
                    {requiresDirect > 0 && (
                      <div className="mt-1 text-xs text-gray-500">Requires {requiresDirect} direct</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Level income */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">3rd Income: Level Income (ROI to ROI)</h2>
            </div>

            <div className="mt-3 rounded-2xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-900">
              <span className="font-semibold">Pack levels:</span> {effectiveAfterLaunch.packLevelsNote.replace(/^Pack levels:\\s*/i, '')}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3">Income</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveAfterLaunch.levelIncome.map((row: any) => (
                    <tr key={row.level} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">Level {row.level}</td>
                      <td className="px-4 py-3 text-gray-700">{row.percent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 rounded-2xl bg-indigo-50 border border-indigo-100 p-5">
              <div className="font-semibold text-indigo-900">Level Unlocking Rules</div>
              <ul className="mt-3 space-y-2 text-sm text-indigo-900">
                {(effectiveAfterLaunch.levelUnlockRules || []).map((rule: any) => (
                  <li key={String(rule)} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-indigo-700" />
                    <span>{String(rule)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm">
                <div className="font-semibold text-gray-900">Non-working income</div>
                <div className="mt-1 text-sm text-gray-700">
                  Runs for <span className="font-semibold">{effectiveAfterLaunch.nonWorkingIncomeDays} days</span> and targets{' '}
                  <span className="font-semibold text-indigo-700">{effectiveAfterLaunch.nonWorkingIncomeTargetMultiplier}x</span>.
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-200 p-5 shadow-sm">
                <div className="font-semibold text-indigo-900">Working income</div>
                <div className="mt-1 text-sm text-indigo-900">
                  Targets <span className="font-semibold">{effectiveAfterLaunch.workingIncomeTargetMultiplier}x</span>. Days do not matter for working income.
                  Customer will upgrade the account after receiving <span className="font-semibold">{effectiveAfterLaunch.workingIncomeTargetMultiplier}x</span> working income from the system.
                </div>
              </div>
            </div>
          </div>
            </div>
          </section>

          {/* CTA */}
          <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-900 px-6 py-8 text-white shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="text-xl font-extrabold">{isLaunched ? 'Ready to start?' : 'Ready for prelaunch?'}</div>
                <div className="text-white/80 text-sm mt-1">
                  {isLaunched ? 'Choose a plan and activate your account.' : 'Register now and start building your network.'}
                </div>
              </div>
              <Link
                to={isLaunched ? '/subscription-plans' : '/customer/register'}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600 transition-colors"
              >
                {isLaunched ? 'Choose Plan' : 'Register with 5 USDT'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpcomingPlan;
