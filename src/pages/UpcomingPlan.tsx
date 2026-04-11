import React from 'react';
import { Link } from 'react-router-dom';
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
            <span className="text-sm font-semibold">Prelaunch • Upcoming Plan</span>
          </div>

          <h1 className="mt-5 text-3xl sm:text-5xl font-extrabold text-white leading-tight">
            A big opportunity for all MLM leaders
          </h1>
          <p className="mt-3 text-white/80 text-lg">
            ShopClick is in a prelaunch period. Join early and build your team before launch.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              to="/customer/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600 transition-colors"
            >
              Register Now
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://www.shopclick.live"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 font-semibold text-white hover:bg-white/15 transition-colors border border-white/15"
            >
              Visit website: shopclick.live
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
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

          {/* SHOPCLICK PLAN */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <Rocket className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">SHOPCLICK Plan (Launch)</h2>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <h3 className="font-semibold text-gray-900">Joining Packs</h3>
                <p className="mt-1 text-sm text-gray-600">50 USDT • 100 USDT • 200 USDT</p>
                <div className="mt-4 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-gray-900">Daily shopping coupons</div>
                    <div className="text-sm text-gray-600">System provides coupons for <span className="font-semibold">200 days</span>.</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gradient-to-b from-indigo-50 to-white p-5">
                <h3 className="font-semibold text-gray-900">1st Income: ROI</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white border border-gray-100 p-4">
                    <div className="text-xs text-gray-600">Daily return</div>
                    <div className="text-xl font-extrabold text-gray-900">1%</div>
                  </div>
                  <div className="rounded-xl bg-white border border-gray-100 p-4">
                    <div className="text-xs text-gray-600">Duration</div>
                    <div className="text-xl font-extrabold text-gray-900">200 days</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  Target: <span className="font-semibold text-gray-900">2x</span> in 200 days.
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
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <div className="text-sm text-gray-600">1st level (Direct)</div>
                <div className="mt-1 text-2xl font-extrabold text-gray-900">7%</div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <div className="text-sm text-gray-600">2nd level (Direct)</div>
                <div className="mt-1 text-2xl font-extrabold text-gray-900">1.5%</div>
                <div className="mt-1 text-xs text-gray-500">Requires 3 direct</div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
                <div className="text-sm text-gray-600">3rd level (Direct)</div>
                <div className="mt-1 text-2xl font-extrabold text-gray-900">1%</div>
                <div className="mt-1 text-xs text-gray-500">Requires 9 direct</div>
              </div>
            </div>
          </div>

          {/* Level income */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">3rd Income: Level Income (ROI to ROI)</h2>
            </div>

            <div className="mt-3 rounded-2xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-900">
              <span className="font-semibold">Pack levels:</span> 50 USDT pack = 7 levels • 100 USDT pack = 10 levels • 200 USDT pack = 15 levels
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
                  {levelIncome.map((row) => (
                    <tr key={row.level} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-medium text-gray-900">Level {row.level}</td>
                      <td className="px-4 py-3 text-gray-700">{row.percent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 rounded-2xl bg-emerald-50 border border-emerald-100 p-5">
              <div className="font-semibold text-emerald-900">Level Unlocking Rules</div>
              <ul className="mt-3 space-y-2 text-sm text-emerald-900">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-700" />
                  <span>You can open your 1st level with 1 direct only.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-700" />
                  <span>9 direct = 9 levels open.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-700" />
                  <span>10 direct = 15 levels open.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-900 px-6 py-8 text-white shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="text-xl font-extrabold">Ready for prelaunch?</div>
                <div className="text-white/80 text-sm mt-1">Register now and start building your network.</div>
              </div>
              <Link
                to="/customer/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white hover:bg-emerald-600 transition-colors"
              >
                Register with 5 USDT
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

