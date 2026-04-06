import React, { useEffect, useMemo, useState } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { useMLM } from '../../contexts/MLMContext';

interface MyNetworkProps {
  userId: string;
}

const MyNetwork: React.FC<MyNetworkProps> = ({ userId }) => {
  const { treeData, loading, error, loadTreeData, refreshTreeData } = useMLM();
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  const VIEW_STORAGE_KEY = 'customer.network.viewMode';

  useEffect(() => {
    if (!userId) return;
    loadTreeData(userId);
  }, [userId, loadTreeData]);

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
    return [...treeData].sort((a, b) => a.level - b.level);
  }, [treeData]);

  const listByLevel = useMemo(() => {
    const map = new Map<number, typeof treeData>();
    for (const node of treeData) {
      const list = map.get(node.level) || [];
      list.push(node);
      map.set(node.level, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [treeData]);


  const renderStatus = (isActive: boolean) => (
    <span className={`px-2 py-1 rounded-full text-xs ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );

  const renderName = (node: typeof treeData[number]) => {
    return `${node.userData?.firstName || ''} ${node.userData?.lastName || ''}`.trim()
      || node.userData?.username
      || 'User';
  };

  const totalNetwork = treeData.length;
  const directReferrals = treeData.filter(node => node.level === 1).length;
  const maxDepth = treeData.reduce((max, node) => Math.max(max, node.level), 0);

  return (
    <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
          <h3 className="text-lg font-semibold text-gray-900">Referral Network</h3>
          <p className="text-sm text-gray-600">All referrals under your account (multi-level)</p>
        </div>
      </div>
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={refreshTreeData}
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
              ) : treeData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No referrals yet.
                  </td>
                </tr>
              ) : (
                sortedTreeData.map((ref) => (
                  <tr key={ref.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {renderName(ref)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 font-mono">{ref.sponsorshipNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Level {ref.level}</td>
                    <td className="px-4 py-3 text-sm">
                      {renderStatus(ref.isActive)}
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
          {!loading && !error && treeData.length === 0 && (
            <div className="text-center text-sm text-gray-500 py-6">No referrals yet.</div>
          )}
          {!loading && !error && treeData.length > 0 && listByLevel.map(([level, nodes]) => (
            <div key={level} className="border border-gray-200 rounded-lg">
              <div className="px-4 py-2 bg-gray-50 text-sm font-medium text-gray-700">
                Level {level} • {nodes.length} member{nodes.length === 1 ? '' : 's'}
              </div>
              <div className="divide-y divide-gray-100">
                {nodes.map(node => (
                  <div key={node.userId} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{renderName(node)}</div>
                      <div className="text-xs text-gray-500">{node.userData?.email || ''}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-500 font-mono">{node.sponsorshipNumber}</div>
                      {renderStatus(node.isActive)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tree view removed per request */}
    </div>
  );
};

export default MyNetwork;
