import React, { useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { getReferralNetworkPage } from '../../lib/supabase';
import { useScrollToTopOnChange } from '../../hooks/useScrollToTopOnChange';

interface MyNetworkProps {
  userId: string;
}

type ReferralRow = {
  user_id: string;
  parent_user_id: string | null;
  level: number;
  sponsorship_number: string;
  parent_account: string | null;
  parent_sponsorship_number: string | null;
  is_active: boolean;
  is_registration_paid?: boolean;
  mobile_verified?: boolean;
  is_active_member?: boolean;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  total_count?: number | null;
  direct_referrals?: number | null;
  max_depth?: number | null;
};

const MyNetwork: React.FC<MyNetworkProps> = ({ userId }) => {
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [maxLevels, setMaxLevels] = useState(10);
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const topRef = useScrollToTopOnChange([page], { smooth: true });
  const VIEW_STORAGE_KEY = 'customer.network.viewMode';

  const loadPage = async (opts?: { resetPage?: boolean }) => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const nextPage = opts?.resetPage ? 1 : page;
      const offset = (nextPage - 1) * pageSize;
      const data = await getReferralNetworkPage({
        userId,
        maxLevels,
        level: levelFilter,
        searchTerm: searchTerm.trim() || null,
        offset,
        limit: pageSize
      });
      setRows((data || []) as ReferralRow[]);
      if (opts?.resetPage) setPage(1);
    } catch (e: any) {
      setError(e?.message || 'Failed to load referrals');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => loadPage();

  useEffect(() => {
    loadPage({ resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, maxLevels, levelFilter, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  useEffect(() => {
    loadPage({ resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'tree') {
        localStorage.setItem(VIEW_STORAGE_KEY, 'table');
        setViewMode('table');
        return;
      }
      if (stored === 'table' || stored === 'list') {
        setViewMode(stored);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleViewChange = (mode: 'table' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const sortedTreeData = useMemo(() => {
    return [...rows].sort((a, b) => Number(a.level || 0) - Number(b.level || 0));
  }, [rows]);

  const listByLevel = useMemo(() => {
    const map = new Map<number, ReferralRow[]>();
    for (const node of rows) {
      const list = map.get(node.level) || [];
      list.push(node);
      map.set(node.level, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [rows]);


  const renderStatus = (node: ReferralRow) => {
    const activeMember =
      node.is_active_member ??
      (Boolean(node.is_active) && Boolean(node.is_registration_paid) && Boolean(node.mobile_verified));

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs ${
          activeMember ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
        }`}
      >
        {activeMember ? 'Active' : 'Pending'}
      </span>
    );
  };

  const renderName = (node: ReferralRow) => {
    return `${node.first_name || ''} ${node.last_name || ''}`.trim()
      || node.username
      || 'User';
  };

  const renderParent = (node: ReferralRow) => {
    if (!node.parent_user_id) return '—';
    if (node.parent_user_id === userId) return 'You';
    return node.parent_sponsorship_number || node.parent_user_id;
  };

  const totalNetwork = rows[0]?.total_count ?? 0;
  const directReferrals = rows[0]?.direct_referrals ?? 0;
  const maxDepth = rows[0]?.max_depth ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalNetwork / pageSize)), [totalNetwork, pageSize]);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
      <div ref={topRef} />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
          <h3 className="text-lg font-semibold text-gray-900">Referral Network</h3>
        </div>
      </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white w-44 md:w-56"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={maxLevels}
              onChange={(e) => setMaxLevels(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
              title="How deep to traverse"
            >
              <option value={5}>Depth 5</option>
              <option value={10}>Depth 10</option>
              <option value={20}>Depth 20</option>
              <option value={50}>Depth 50</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={levelFilter ?? ''}
              onChange={(e) => setLevelFilter(e.target.value ? Number(e.target.value) : null)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
              title="Filter by a single level"
            >
              <option value="">All levels</option>
              {Array.from({ length: Math.min(50, maxLevels) }).map((_, idx) => {
                const level = idx + 1;
                return (
                  <option key={level} value={level}>
                    Level {level}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              id="network-view"
              value={viewMode}
              onChange={(e) => handleViewChange(e.target.value as 'table' | 'list')}
              className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 bg-white"
            >
              <option value="list">List View</option>
              <option value="table">Table View</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
              title="Rows per page"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={refresh}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-indigo-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-semibold text-indigo-600">{totalNetwork}</div>
          <div className="text-sm text-gray-600">Total Network</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-semibold text-purple-600">{directReferrals}</div>
          <div className="text-sm text-gray-600">Direct Referrals</div>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-semibold text-yellow-600">{maxDepth}</div>
          <div className="text-sm text-gray-600">Depth Levels</div>
        </div>
      </div>

      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sponsorship
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Under
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading referrals...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No referrals yet.
                  </td>
                </tr>
              ) : (
                sortedTreeData.map((ref) => (
                  <tr key={ref.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {renderName(ref)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">{ref.sponsorship_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{renderParent(ref)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Level {ref.level}</td>
                    <td className="px-4 py-3 text-sm">
                      {renderStatus(ref)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-4">
          {loading && (
            <div className="text-center text-sm text-gray-500 py-6">Loading referrals...</div>
          )}
          {!loading && error && (
            <div className="text-center text-sm text-red-600 py-6">{error}</div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-6">No referrals yet.</div>
          )}
          {!loading && !error && rows.length > 0 && levelFilter === null && (
            <div className="border border-blue-200 bg-blue-50 text-blue-800 rounded-lg px-4 py-3 text-sm">
              Showing paginated results across all levels. For a cleaner view, filter by a specific level.
            </div>
          )}
          {!loading && !error && rows.length > 0 && listByLevel.map(([level, nodes]) => (
            <div key={level} className="border border-gray-200 rounded-lg">
              <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">
                Level {level} • {nodes.length} member{nodes.length === 1 ? '' : 's'}
              </div>
              <div className="divide-y divide-gray-100">
                {nodes.map(node => (
                  <div key={node.user_id} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{renderName(node)}</div>
                      <div className="text-xs text-gray-500">Under: {renderParent(node)}</div>
                      <div className="text-xs text-gray-500">{node.email || ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-500 font-mono">{node.sponsorship_number}</div>
                      {renderStatus(node)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <div className="text-xs text-gray-500">
          Total: {totalNetwork} member{totalNetwork === 1 ? '' : 's'} • Page {page} / {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(1)}
            className="px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            disabled={loading || !canPrev}
          >
            First
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            disabled={loading || !canPrev}
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            disabled={loading || !canNext}
          >
            Next
          </button>
          <button
            onClick={() => setPage(totalPages)}
            className="px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 disabled:opacity-50"
            disabled={loading || !canNext}
          >
            Last
          </button>
        </div>
      </div>

      {/* Tree view removed per request */}
    </div>
  );
};

export default MyNetwork;
