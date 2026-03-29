import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getMLMTreeStructure } from '../lib/supabase';

interface TreeNode {
  id: string;
  userId: string;
  parentId: string | null;
  leftChildId: string | null;
  rightChildId: string | null;
  level: number;
  position: 'left' | 'right' | 'root' | 'direct';
  sponsorshipNumber: string;
  isActive: boolean;
  userData?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    username?: string;
  };
}

interface TreeStats {
  totalDownline: number;
  leftSideCount: number;
  rightSideCount: number;
  directReferrals: number;
  maxDepth: number;
  activeMembers: number;
}

interface MLMContextType {
  tree: MLMNode[];
  treeData: TreeNode[];
  loading: boolean;
  error: string | null;
  getUserPosition: (userId: string) => TreeNode | null;
  getDownline: (userId: string) => TreeNode[];
  getUpline: (userId: string) => TreeNode[];
  getTreeStats: (userId: string) => Promise<TreeStats>;
  loadTreeData: (userId: string) => Promise<TreeNode[]>;
  refreshTreeData: () => Promise<TreeNode[]>;
}

const MLMContext = createContext<MLMContextType | undefined>(undefined);

export const useMLM = () => {
  const context = useContext(MLMContext);
  if (!context) {
    throw new Error('useMLM must be used within an MLMProvider');
  }
  return context;
};

export const MLMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const getUserPosition = useCallback((userId: string): TreeNode | null => {
    return treeData.find(node => node.userId === userId) || null;
  }, [treeData]);

  const getDownline = useCallback((userId: string): TreeNode[] => {
    const userNode = getUserPosition(userId);
    if (!userNode) return [];

    return treeData.filter(node => node.parentId === userNode.userId || node.parentId === userId);
  }, [getUserPosition, treeData]);

  const getUpline = useCallback((userId: string): TreeNode[] => {
    const userNode = getUserPosition(userId);
    if (!userNode?.parentId) return [];
    const parent = treeData.find(node => node.userId === userNode.parentId);
    return parent ? [parent] : [];
  }, [getUserPosition, treeData]);

  const loadTreeData = useCallback(async (userId: string): Promise<TreeNode[]> => {
    if (!userId) return [];
    
    setLoading(true);
    setError(null);
    setCurrentUserId(userId);
    
    try {
      console.log('🔍 Loading full referral network for user:', userId);

      // Prefer RPC-based tree structure (works even when RLS blocks direct table reads)
      try {
        const rpcData = await getMLMTreeStructure(userId, 10);
        if (Array.isArray(rpcData)) {
          const rpcNodes: TreeNode[] = rpcData
            .map((row: any) => {
              const resolvedUserId =
                row.tmt_user_id ||
                row.user_id ||
                row.userId ||
                row.tup_user_id ||
                row.id;
              const resolvedSponsorship =
                row.tmt_sponsorship_number ||
                row.sponsorship_number ||
                row.sponsorshipNumber ||
                row.tup_sponsorship_number;
              if (!resolvedUserId || !resolvedSponsorship) return null;

              const resolvedParentId =
                row.tmt_parent_id ||
                row.parent_id ||
                row.parentId ||
                row.parent_user_id ||
                null;

              return {
                id: row.id || resolvedUserId,
                userId: resolvedUserId,
                parentId: resolvedParentId,
                leftChildId: row.tmt_left_child_id || row.left_child_id || null,
                rightChildId: row.tmt_right_child_id || row.right_child_id || null,
                level: row.tmt_level ?? row.level ?? row.node_level ?? 0,
                position: row.tmt_position || row.position || 'direct',
                sponsorshipNumber: resolvedSponsorship,
                isActive: row.tmt_is_active ?? row.is_active ?? row.tu_is_active ?? false,
                userData: {
                  firstName: row.first_name || row.tup_first_name || row.firstName || '',
                  lastName: row.last_name || row.tup_last_name || row.lastName || '',
                  email: row.email || row.tu_email || '',
                  username: row.username || row.tup_username || ''
                }
              } as TreeNode;
            })
            .filter(Boolean) as TreeNode[];

          if (rpcNodes.length > 0 || rpcData.length === 0) {
            setTreeData(rpcNodes);
            console.log('✅ Network loaded via RPC:', rpcNodes.length);
            return rpcNodes;
          }
        }
      } catch (rpcError) {
        console.warn('RPC tree load failed, falling back to direct queries:', rpcError);
      }

      const { data: profileData, error: profileError } = await supabase
        .from('tbl_user_profiles')
        .select('tup_sponsorship_number')
        .eq('tup_user_id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      const rootSponsorship = profileData?.tup_sponsorship_number?.trim();
      if (!rootSponsorship) {
        setTreeData([]);
        return [];
      }

      const nodes: TreeNode[] = [];
      const sponsorshipToUserId = new Map<string, string>([[rootSponsorship, userId]]);
      const queue: Array<{ sponsorship: string; level: number; parentUserId: string }> = [
        { sponsorship: rootSponsorship, level: 0, parentUserId: userId }
      ];

      const fetchProfilesByParent = async (parents: string[]) => {
        const { data, error } = await supabase
          .from('tbl_user_profiles')
          .select('tup_user_id, tup_first_name, tup_last_name, tup_username, tup_sponsorship_number, tup_parent_account')
          .in('tup_parent_account', parents);
        if (error) throw error;
        return data || [];
      };

      while (queue.length > 0) {
        const levelGroups = new Map<number, string[]>();
        queue.splice(0, queue.length).forEach((item) => {
          const list = levelGroups.get(item.level) || [];
          list.push(item.sponsorship);
          levelGroups.set(item.level, list);
        });

        for (const [level, parents] of levelGroups.entries()) {
          if (parents.length === 0) continue;
          const childProfiles = await fetchProfilesByParent(parents);
          if (childProfiles.length === 0) continue;

          const childIds = childProfiles.map((row: any) => row.tup_user_id).filter(Boolean);
          const { data: childUsers } = await supabase
            .from('tbl_users')
            .select('tu_id, tu_email, tu_is_active')
            .in('tu_id', childIds);

          const userMap = new Map((childUsers || []).map((u: any) => [u.tu_id, u]));

          for (const row of childProfiles) {
            if (!row.tup_user_id || !row.tup_sponsorship_number) continue;
            sponsorshipToUserId.set(row.tup_sponsorship_number, row.tup_user_id);

            const userRow = userMap.get(row.tup_user_id);
            const parentUserId = sponsorshipToUserId.get(row.tup_parent_account || '') || null;

            nodes.push({
              id: row.tup_user_id,
              userId: row.tup_user_id,
              parentId: parentUserId,
              leftChildId: null,
              rightChildId: null,
              level: level + 1,
              position: 'direct',
              sponsorshipNumber: row.tup_sponsorship_number,
              isActive: userRow?.tu_is_active === true,
              userData: {
                firstName: row.tup_first_name || '',
                lastName: row.tup_last_name || '',
                email: userRow?.tu_email || '',
                username: row.tup_username || ''
              }
            });
          }

          for (const row of childProfiles) {
            if (!row.tup_sponsorship_number || !row.tup_user_id) continue;
            queue.push({
              sponsorship: row.tup_sponsorship_number,
              level: level + 1,
              parentUserId: row.tup_user_id
            });
          }
        }
      }

      setTreeData(nodes);
      console.log('✅ Network loaded:', nodes.length);
      return nodes;
    } catch (error) {
      console.error('❌ Failed to load MLM tree data:', error);
      setError('Failed to load tree data');
      setTreeData([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTreeData = useCallback(async () => {
    if (currentUserId) {
      return await loadTreeData(currentUserId);
    }
    return [];
  }, [currentUserId, loadTreeData]);

  const getTreeStats = useCallback(async (userId: string): Promise<TreeStats> => {
    try {
      const downline = (treeData && treeData.length > 0)
        ? treeData
        : await loadTreeData(userId);
      const totalDownline = downline.length;
      const directReferrals = downline.filter(node => node.level === 1).length;
      const activeMembers = downline.filter(node => node.isActive).length;
      const maxDepth = downline.reduce((max, node) => Math.max(max, node.level), 0);

      return {
        totalDownline,
        leftSideCount: 0,
        rightSideCount: 0,
        directReferrals,
        maxDepth,
        activeMembers
      };
    } catch (error) {
      console.error('Failed to get tree stats:', error);
      return {
        totalDownline: 0,
        leftSideCount: 0,
        rightSideCount: 0,
        directReferrals: 0,
        maxDepth: 0,
        activeMembers: 0
      };
    }
  }, [treeData, loadTreeData]);

  const value = useMemo(() => ({
    treeData,
    loading,
    error,
    getUserPosition,
    getDownline,
    getUpline,
    getTreeStats,
    loadTreeData,
    refreshTreeData
  }), [
    treeData,
    loading,
    error,
    getUserPosition,
    getDownline,
    getUpline,
    getTreeStats,
    loadTreeData,
    refreshTreeData
  ]);

  return (
    <MLMContext.Provider value={value}>
      {children}
    </MLMContext.Provider>
  );
};
