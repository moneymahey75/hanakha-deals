import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../ui/NotificationProvider';
import { Calendar, Clock, ExternalLink, Gift, RefreshCw, Send, ThumbsDown, ThumbsUp, Wallet } from 'lucide-react';

type RewardCouponStatus = 'available' | 'opened' | 'liked' | 'disliked' | 'expired';

interface RewardCoupon {
  assignment_id: string;
  coupon_id: string;
  title: string;
  description?: string | null;
  coupon_code?: string | null;
  image_url?: string | null;
  website_url?: string | null;
  reward_amount: number;
  reward_date: string;
  day_number: number;
  daily_target_amount: number;
  assigned_total_amount: number;
  status: RewardCouponStatus;
  opened_at?: string | null;
  reaction_available_at?: string | null;
  reacted_at?: string | null;
  reaction?: 'liked' | 'disliked' | null;
  timer_seconds: number;
  feedback_enabled: boolean;
  feedback_samples: string[];
  coupon_valid_until?: string | null;
  is_expired: boolean;
  expires_at: string;
}

const filterOptions = [
  { id: 'today', label: 'Today' },
  { id: 'liked', label: 'Liked' },
  { id: 'disliked', label: 'Disliked' },
] as const;

const formatAmount = (value: number) => `${Number(value || 0).toFixed(2)} USDT`;
const FEEDBACK_POPUP_DELAY_SECONDS = 3;
const HISTORY_PAGE_SIZE = 10;
type CouponFilter = (typeof filterOptions)[number]['id'];

const normalizeFeedbackSamples = (samples?: string[] | null) =>
  Array.isArray(samples)
    ? samples.map((sample) => String(sample || '').trim()).filter(Boolean).slice(0, 5)
    : [];

const secondsUntil = (value?: string | null) => {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 1000));
};

const addSeconds = (value: string, seconds: number) => new Date(new Date(value).getTime() + seconds * 1000).toISOString();

const formatDate = (value?: string | null) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getExpiryLabel = (coupon: RewardCoupon) => {
  if (coupon.is_expired || coupon.status === 'expired') {
    return 'Coupon expired';
  }

  if (coupon.opened_at) {
    return `Expiry Date ${formatDate(coupon.coupon_valid_until || coupon.expires_at)}`;
  }

  return `Expires ${new Date(coupon.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const renderDescription = (description?: string | null) => {
  if (!description) return null;
  const lines = description
    .split(/\r?\n+/)
    .map((item) => item.replace(/^[\s\-*•\d.]+/, '').trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return <p className="mt-2 text-sm text-gray-600">{description}</p>;
  }

  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`}>{line}</li>
      ))}
    </ul>
  );
};

const DailyTasksDashboard: React.FC = () => {
  const { user } = useAuth();
  const notification = useNotification();
  const [coupons, setCoupons] = useState<RewardCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CouponFilter>('today');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [feedbackCoupon, setFeedbackCoupon] = useState<RewardCoupon | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedReaction, setSelectedReaction] = useState<'liked' | 'disliked' | null>(null);
  const [promptedCouponIds, setPromptedCouponIds] = useState<Record<string, boolean>>({});
  const [revealRefreshIds, setRevealRefreshIds] = useState<Record<string, boolean>>({});
  const [historyPages, setHistoryPages] = useState<Record<'liked' | 'disliked', number>>({
    liked: 1,
    disliked: 1,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadCoupons();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    setFeedbackText('');
    setSelectedReaction(null);
  }, [feedbackCoupon?.assignment_id]);

  useEffect(() => {
    if (feedbackCoupon) return;

    const codeReadyCoupon = coupons.find(
      (coupon) =>
        coupon.status === 'opened' &&
        coupon.opened_at &&
        coupon.reaction_available_at &&
        secondsUntil(coupon.reaction_available_at) <= 0 &&
        !revealRefreshIds[coupon.assignment_id]
    );

    if (codeReadyCoupon) {
      setRevealRefreshIds((prev) => ({ ...prev, [codeReadyCoupon.assignment_id]: true }));
      loadCoupons(true);
      return;
    }

    const readyCoupon = coupons.find(
      (coupon) =>
        coupon.status === 'opened' &&
        coupon.opened_at &&
        coupon.reaction_available_at &&
        secondsUntil(addSeconds(coupon.reaction_available_at, FEEDBACK_POPUP_DELAY_SECONDS)) <= 0 &&
        revealRefreshIds[coupon.assignment_id] &&
        !promptedCouponIds[coupon.assignment_id]
    );

    if (readyCoupon) {
      setFeedbackCoupon(readyCoupon);
      setPromptedCouponIds((prev) => ({ ...prev, [readyCoupon.assignment_id]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupons, feedbackCoupon, promptedCouponIds, revealRefreshIds, tick]);

  const loadCoupons = async (silent = false) => {
    if (!user?.id) return;
    if (!silent) {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase.rpc('get_user_reward_coupons');
      if (error) throw error;

      setCoupons(
        (data || []).map((row: any) => ({
          ...row,
          reward_amount: Number(row.reward_amount || 0),
          daily_target_amount: Number(row.daily_target_amount || 0),
          assigned_total_amount: Number(row.assigned_total_amount || 0),
          day_number: Number(row.day_number || 0),
          timer_seconds: Number(row.timer_seconds ?? 30),
          feedback_enabled: Boolean(row.feedback_enabled ?? false),
          feedback_samples: normalizeFeedbackSamples(row.feedback_samples),
          coupon_valid_until: row.coupon_valid_until ?? null,
          is_expired: Boolean(row.is_expired ?? row.status === 'expired'),
        }))
      );
    } catch (error: any) {
      notification.showError('Load Failed', error.message || 'Failed to load daily coupons');
    } finally {
      setLoading(false);
    }
  };

  const openCoupon = async (coupon: RewardCoupon) => {
    const openedCoupon = coupons.find((item) => item.status === 'opened');
    if (openedCoupon && openedCoupon.assignment_id !== coupon.assignment_id) {
      notification.showError('Coupon Already Opened', 'Finish the opened coupon first, then open the next one.');
      return;
    }

    setBusyId(coupon.assignment_id);
    try {
      const { error } = await supabase.rpc('open_reward_coupon', {
        p_assignment_id: coupon.assignment_id,
      });
      if (error) throw error;

      notification.showSuccess('Opening Coupon', 'The coupon code will appear after the timer completes.');
      await loadCoupons();
    } catch (error: any) {
      notification.showError('Open Failed', error.message || 'Unable to open this coupon');
    } finally {
      setBusyId(null);
    }
  };

  const reactCoupon = async (coupon: RewardCoupon, reaction: 'liked' | 'disliked', writtenFeedback?: string) => {
    setBusyId(coupon.assignment_id);
    try {
      const { data, error } = await supabase.rpc('react_reward_coupon', {
        p_assignment_id: coupon.assignment_id,
        p_reaction: reaction,
        p_feedback_text: writtenFeedback?.trim() || null,
      });
      if (error) throw error;

      const creditedAmount = Number(data?.reward_amount ?? coupon.reward_amount ?? 0);
      notification.showSuccess(
        reaction === 'liked' ? 'Coupon Liked' : 'Coupon Disliked',
        data?.reward_credited === false
          ? 'Saved to My Coupons.'
          : `${formatAmount(creditedAmount)} credited to your ROI Wallet.`
      );
      setFeedbackCoupon(null);
      setFeedbackText('');
      setSelectedReaction(null);
      await loadCoupons();
    } catch (error: any) {
      notification.showError('Action Failed', error.message || 'Unable to save your choice');
    } finally {
      setBusyId(null);
    }
  };

  const filteredCoupons = useMemo(() => {
    if (filter === 'today') {
      return coupons.filter((coupon) => coupon.status === 'available' || coupon.status === 'opened');
    }
    return coupons.filter((coupon) => coupon.status === filter);
  }, [coupons, filter]);

  const todayCoupons = coupons.filter((coupon) => coupon.status === 'available' || coupon.status === 'opened');
  const openedCoupon = coupons.find((coupon) => coupon.status === 'opened');
  const creditedRewards = coupons
    .filter((coupon) => coupon.status === 'liked' || coupon.status === 'disliked')
    .reduce((sum, coupon) => sum + coupon.reward_amount, 0);
  const dailyTarget = todayCoupons[0]?.daily_target_amount || coupons[0]?.daily_target_amount || 0;
  const assignedTotal = todayCoupons[0]?.assigned_total_amount || 0;
  const isHistoryFilter = filter === 'liked' || filter === 'disliked';
  const historyPage = isHistoryFilter ? historyPages[filter] : 1;
  const totalHistoryPages = isHistoryFilter ? Math.max(1, Math.ceil(filteredCoupons.length / HISTORY_PAGE_SIZE)) : 1;
  const visibleCoupons = isHistoryFilter
    ? filteredCoupons.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE)
    : filteredCoupons;

  const changeHistoryPage = (page: number) => {
    if (!isHistoryFilter) return;
    setHistoryPages((prev) => ({
      ...prev,
      [filter]: Math.min(Math.max(page, 1), totalHistoryPages),
    }));
  };

  const submitFeedbackForm = () => {
    if (!feedbackCoupon) return;
    if (!selectedReaction) {
      notification.showError('Select Like or Dislike', 'Choose your coupon reaction first.');
      return;
    }

    const trimmedFeedback = feedbackText.trim();
    if (!trimmedFeedback) {
      notification.showError('Feedback Required', 'Write your feedback before submitting.');
      return;
    }

    const matchesSample = feedbackCoupon.feedback_samples.some(
      (sample) => sample.trim().toLowerCase() === trimmedFeedback.toLowerCase()
    );
    if (matchesSample) {
      notification.showError('Write Your Own Feedback', 'Please write a different message instead of using a sample exactly.');
      return;
    }

    reactCoupon(feedbackCoupon, selectedReaction, trimmedFeedback);
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 rounded bg-gray-200" />
          <div className="h-28 rounded bg-gray-200" />
          <div className="h-28 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-100 p-3">
            <Gift className="h-6 w-6 text-indigo-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Daily Coupons</h3>
            <p className="text-sm text-gray-600">Open today&apos;s coupons before midnight, then like or dislike after the timer to claim.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadCoupons}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-semibold uppercase text-indigo-700">Daily Target</p>
          <p className="mt-1 text-2xl font-bold text-indigo-950">{formatAmount(dailyTarget)}</p>
          <p className="text-xs text-indigo-700">1% of the full plan price</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase text-emerald-700">Assigned Today</p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">{formatAmount(assignedTotal)}</p>
          <p className="text-xs text-emerald-700">Single or split coupons</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase text-amber-700">ROI Wallet Credits</p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{formatAmount(creditedRewards)}</p>
          <p className="text-xs text-amber-700">Credited after like/dislike</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              filter === option.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filteredCoupons.length === 0 ? (
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <Gift className="mx-auto h-10 w-10 text-gray-300" />
          <h4 className="mt-3 font-semibold text-gray-900">No coupons here</h4>
          <p className="mt-1 text-sm text-gray-600">
            {filter === 'today'
              ? 'No launched daily coupons are available for you today.'
              : `No ${filter} coupons yet.`}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4">
	          {visibleCoupons.map((coupon) => {
            const waitSeconds = secondsUntil(coupon.reaction_available_at) + tick * 0;
            const isOpened = Boolean(coupon.opened_at);
	            const isCodeVisible = isOpened && waitSeconds <= 0 && !coupon.is_expired;
	            const isBusy = busyId === coupon.assignment_id;
            const isBlockedByOpenedCoupon =
              coupon.status === 'available' &&
              Boolean(openedCoupon) &&
              openedCoupon?.assignment_id !== coupon.assignment_id;

	            return (
              <div key={coupon.assignment_id} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                {coupon.image_url && (
                  <img src={coupon.image_url} alt={coupon.title} className="h-44 w-full object-cover" />
                )}
                <div className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-semibold text-gray-900">{coupon.title}</h4>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold capitalize text-gray-700">
                          {coupon.is_expired ? 'expired' : coupon.status}
                        </span>
                      </div>
                      {renderDescription(coupon.description)}
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-4 py-3 text-right">
                      <p className="text-xs font-semibold uppercase text-emerald-700">ROI</p>
                      <p className="text-xl font-bold text-emerald-950">{formatAmount(coupon.reward_amount)}</p>
                    </div>
                  </div>

	                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="h-4 w-4" />
                      Day {coupon.day_number} of 200
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      {getExpiryLabel(coupon)}
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Wallet className="h-4 w-4" />
                      ROI Wallet
	                    </div>
	                  </div>

                  {coupon.status === 'opened' && waitSeconds > 0 && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold text-amber-800">Opening the coupon in {waitSeconds}s</p>
                    </div>
                  )}

		                  {isCodeVisible && coupon.coupon_code && (
                    <div className="mt-4 rounded-lg border border-dashed border-indigo-200 bg-indigo-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase text-indigo-700">Coupon Code</p>
                      <p className="mt-1 font-mono text-lg font-bold text-indigo-950">{coupon.coupon_code}</p>
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
	                      {!isOpened && (
	                        <button
	                          type="button"
	                          onClick={() => openCoupon(coupon)}
	                          disabled={isBusy || isBlockedByOpenedCoupon}
	                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                            title={isBlockedByOpenedCoupon ? 'Finish the opened coupon first' : 'Open coupon'}
	                        >
	                          {isBlockedByOpenedCoupon ? 'Finish Opened Coupon First' : 'Open Coupon'}
	                        </button>
	                      )}
                      {isCodeVisible && coupon.website_url && (
                        <a
                          href={coupon.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Visit
                        </a>
                      )}
                    </div>
                  </div>
                </div>
	              </div>
	            );
	          })}
          </div>

          {isHistoryFilter && totalHistoryPages > 1 && (
            <div className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                Page {historyPage} of {totalHistoryPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => changeHistoryPage(historyPage - 1)}
                  disabled={historyPage <= 1}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => changeHistoryPage(historyPage + 1)}
                  disabled={historyPage >= totalHistoryPages}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {feedbackCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
	            <div className="flex items-start justify-between gap-4">
	              <div>
	                <h4 className="text-lg font-semibold text-gray-900">How is this coupon code?</h4>
	                <p className="mt-1 text-sm text-gray-600">{feedbackCoupon.title}</p>
	              </div>
	            </div>

            {feedbackCoupon.coupon_code && (
              <div className="mt-5 rounded-lg border border-dashed border-indigo-200 bg-indigo-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase text-indigo-700">Coupon Code</p>
                <p className="mt-1 font-mono text-lg font-bold text-indigo-950">{feedbackCoupon.coupon_code}</p>
              </div>
            )}

            {feedbackCoupon.feedback_enabled ? (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedReaction('liked')}
                    disabled={busyId === feedbackCoupon.assignment_id}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60 ${
                      selectedReaction === 'liked'
                        ? 'bg-emerald-600 text-white'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    Like
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedReaction('disliked')}
                    disabled={busyId === feedbackCoupon.assignment_id}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-60 ${
                      selectedReaction === 'disliked'
                        ? 'bg-rose-600 text-white'
                        : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    Dislike
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800">Feedback</label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={4}
                    maxLength={500}
                    disabled={busyId === feedbackCoupon.assignment_id}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                    placeholder="Write your feedback about this coupon"
                  />
                </div>

                {feedbackCoupon.feedback_samples.length > 0 && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">Sample feedback</p>
                    <ul className="mt-2 space-y-1 text-sm text-gray-600">
                      {feedbackCoupon.feedback_samples.map((sample, index) => (
                        <li key={`${sample}-${index}`}>{sample}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={submitFeedbackForm}
                  disabled={busyId === feedbackCoupon.assignment_id}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  Submit Feedback
                </button>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => reactCoupon(feedbackCoupon, 'liked')}
                  disabled={busyId === feedbackCoupon.assignment_id}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <ThumbsUp className="h-4 w-4" />
                  Like
                </button>
                <button
                  type="button"
                  onClick={() => reactCoupon(feedbackCoupon, 'disliked')}
                  disabled={busyId === feedbackCoupon.assignment_id}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  <ThumbsDown className="h-4 w-4" />
                  Dislike
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyTasksDashboard;
