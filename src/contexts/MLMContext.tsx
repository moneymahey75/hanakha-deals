import React, { createContext, useContext, useState } from 'react';
import { getMLMTreeStructure, getTreeStatistics } from '../lib/supabase';

interface TreeNode {
  id: string;
  userId: string;
  parentId: string | null;
  leftChildId: string | null;
  rightChildId: string | null;
  level: number;
  position: 'left' | 'right' | 'root';
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
  loadTreeData: (userId: string) => Promise<void>;
  refreshTreeData: () => Promise<void>;
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

  const getUserPosition = (userId: string): TreeNode | null => {
    return treeData.find(node => node.userId === userId) || null;
  };

  const getDownline = (userId: string): TreeNode[] => {
    const userNode = getUserPosition(userId);
    if (!userNode) return [];
    
    const result: TreeNode[] = [];
    const nodeId = userNode.id;
    const queue = [nodeId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const node = treeData.find(n => n.id === currentId);
      
      if (node) {
        if (node.id !== nodeId) { // Don't include the user themselves
          result.push(node);
        }
        if (node.leftChildId) queue.push(node.leftChildId);
        if (node.rightChildId) queue.push(node.rightChildId);
      }
    }
    
    return result;
  };

  const getUpline = (userId: string): TreeNode[] => {
    const userNode = getUserPosition(userId);
    if (!userNode) return [];
    
    const result: TreeNode[] = [];
    let currentNode = userNode;
    
    while (currentNode && currentNode.parentId) {
      const parent = treeData.find(n => n.id === currentNode.parentId);
      if (parent) {
        result.push(parent);
        currentNode = parent;
      } else {
        break;
      }
    }
    
    return result;
  };

  const loadTreeData = async (userId: string) => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    setCurrentUserId(userId);
    
    try {
      console.log('🔍 Loading MLM tree data for user:', userId);
      const data = await getMLMTreeStructure(userId, 5);
      
      // Convert database format to TreeNode format
      const treeNodes: TreeNode[] = data.map((node: any) => ({
        id: node.node_id,
        userId: node.user_id,
        parentId: node.parent_id,
        leftChildId: node.left_child_id,
        rightChildId: node.right_child_id,
        level: node.level,
        position: node.position,
        sponsorshipNumber: node.sponsorship_number,
        isActive: node.is_active,
        userData: {
          firstName: node.first_name,
          lastName: node.last_name,
          email: node.user_email,
          username: node.username
        }
      }));
      
      setTreeData(treeNodes);
      console.log('✅ MLM tree data loaded:', treeNodes.length, 'nodes');
    } catch (error) {
      console.error('❌ Failed to load MLM tree data:', error);
      setError('Failed to load tree data');
      setTreeData([]);
    } finally {
      setLoading(false);
    }
  };

  const refreshTreeData = async () => {
    if (currentUserId) {
      await loadTreeData(currentUserId);
    }
  };

  const getTreeStats = async (userId: string): Promise<TreeStats> => {
    try {
      const stats = await getTreeStatistics(userId);
      return {
        totalDownline: stats.total_downline || 0,
        leftSideCount: stats.left_side_count || 0,
        rightSideCount: stats.right_side_count || 0,
        directReferrals: stats.direct_referrals || 0,
        maxDepth: stats.max_depth || 0,
        activeMembers: stats.active_members || 0
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
  };

  const value = {
    treeData,
    loading,
    error,
    getUserPosition,
    getDownline,
    getUpline,
    getTreeStats,
    loadTreeData,
    refreshTreeData
  };

  return (
    <MLMContext.Provider value={value}>
      {children}
    </MLMContext.Provider>
  );
};