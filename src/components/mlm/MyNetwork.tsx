import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../components/ui/NotificationProvider';
import { supabase } from '../../lib/supabase';
import {
    Users,
    ChevronLeft,
    ChevronDown,
    ChevronRight,
    Home,
    Plus,
    Minus,
    RotateCcw,
    Eye,
    Grid3X3,
    Loader2,
} from 'lucide-react';

interface UserNode {
    id: string;
    userId: string;
    parentId: string | null;
    level: number;
    sponsorshipNumber: string;
    isActive: boolean;
    userData: {
        firstName: string;
        lastName: string;
        email: string;
        mobile?: string;
    };
    children: UserNode[];
    childrenCount: number;
}

interface DashboardStats {
    totalReferrals: number;
    totalDownline: number;
    directReferrals: number;
    maxDepth: number;
}

interface MyNetworkProps {
    treeData?: any;
    dashboardStats?: any;
    userId: string;
}

type ViewMode = 'tree' | 'list';

const MyNetwork: React.FC<MyNetworkProps> = ({ userId }) => {
    const { user } = useAuth();
    const notification = useNotification();

    const [loading, setLoading] = useState(true);
    const [treeData, setTreeData] = useState<UserNode | null>(null);
    const [stats, setStats] = useState<DashboardStats>({
        totalReferrals: 0,
        totalDownline: 0,
        directReferrals: 0,
        maxDepth: 0
    });
    const [selectedNode, setSelectedNode] = useState<UserNode | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [zoomLevel, setZoomLevel] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('tree');
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [maxVisibleDepth, setMaxVisibleDepth] = useState(3);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Fetch MLM tree data from database
    const fetchTreeData = useCallback(async () => {
        setLoading(true);
        try {
            console.log('🔍 Fetching MLM tree data for user:', userId);

            // Fetch all MLM tree nodes
            const { data: mlmNodes, error: mlmError } = await supabase
                .from('tbl_mlm_tree')
                .select(`
                    tmt_id,
                    tmt_user_id,
                    tmt_parent_id,
                    tmt_level,
                    tmt_sponsorship_number,
                    tmt_is_active
                `)
                .eq('tmt_is_active', true)
                .order('tmt_level');

            if (mlmError) throw mlmError;

            // Fetch user profiles for all nodes
            const userIds = mlmNodes?.map(node => node.tmt_user_id).filter(Boolean) || [];

            const { data: profiles, error: profileError } = await supabase
                .from('tbl_user_profiles')
                .select('tup_user_id, tup_first_name, tup_last_name, tup_sponsorship_number')
                .in('tup_user_id', userIds);

            if (profileError) throw profileError;

            // Fetch user emails
            const { data: users, error: userError } = await supabase
                .from('tbl_users')
                .select('tu_id, tu_email')
                .in('tu_id', userIds);

            if (userError) throw userError;

            // Create lookup maps
            const profileMap = new Map(profiles?.map(p => [p.tup_user_id, p]) || []);
            const userMap = new Map(users?.map(u => [u.tu_id, u]) || []);

            // Build node map
            const nodeMap = new Map<string, UserNode>();

            mlmNodes?.forEach(node => {
                if (!node.tmt_user_id) return;

                const profile = profileMap.get(node.tmt_user_id);
                const userInfo = userMap.get(node.tmt_user_id);

                const userNode: UserNode = {
                    id: node.tmt_id,
                    userId: node.tmt_user_id,
                    parentId: node.tmt_parent_id,
                    level: node.tmt_level,
                    sponsorshipNumber: node.tmt_sponsorship_number,
                    isActive: node.tmt_is_active,
                    userData: {
                        firstName: profile?.tup_first_name || 'User',
                        lastName: profile?.tup_last_name || '',
                        email: userInfo?.tu_email || '',
                    },
                    children: [],
                    childrenCount: 0
                };

                nodeMap.set(node.tmt_id, userNode);
            });

            // Build tree structure
            let rootNode: UserNode | null = null;
            let currentUserNode: UserNode | null = null;

            nodeMap.forEach(node => {
                if (!node.parentId) {
                    // This is root
                    rootNode = node;
                } else {
                    // Add to parent's children
                    const parent = nodeMap.get(node.parentId);
                    if (parent) {
                        parent.children.push(node);
                        parent.childrenCount = parent.children.length;
                    }
                }

                // Track current user's node
                if (node.userId === userId) {
                    currentUserNode = node;
                }
            });

            // Calculate stats
            const calculateStats = (node: UserNode): DashboardStats => {
                let totalDownline = 0;
                let maxDepth = node.level;
                let directReferrals = node.children.length;

                const traverse = (n: UserNode) => {
                    totalDownline++;
                    maxDepth = Math.max(maxDepth, n.level);
                    n.children.forEach(child => traverse(child));
                };

                node.children.forEach(child => traverse(child));

                return {
                    totalReferrals: directReferrals,
                    totalDownline,
                    directReferrals,
                    maxDepth: maxDepth - node.level
                };
            };

            // Use current user's node if found, otherwise use root
            const displayNode = currentUserNode || rootNode;

            if (displayNode) {
                setTreeData(displayNode);
                setFocusedNodeId(displayNode.id);
                setStats(calculateStats(displayNode));

                // Auto-expand first level
                setExpandedNodes(new Set([displayNode.id]));
            }

            console.log('✅ Tree data loaded successfully');
        } catch (error: any) {
            console.error('❌ Failed to fetch tree data:', error);
            notification.showError('Error', 'Failed to load network data: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [userId, notification]);

    useEffect(() => {
        fetchTreeData();
    }, [fetchTreeData]);

    // Toggle node expansion
    const toggleNodeExpansion = useCallback((nodeId: string) => {
        setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId);
            } else {
                newSet.add(nodeId);
            }
            return newSet;
        });
    }, []);

    // Expand all nodes up to a certain depth
    const expandToDepth = useCallback((depth: number) => {
        if (!treeData) return;

        const newExpanded = new Set<string>();
        const traverse = (node: UserNode, currentDepth: number) => {
            if (currentDepth < depth) {
                newExpanded.add(node.id);
                node.children.forEach(child => traverse(child, currentDepth + 1));
            }
        };

        traverse(treeData, 0);
        setExpandedNodes(newExpanded);
    }, [treeData]);

    // Collapse all nodes
    const collapseAll = useCallback(() => {
        if (treeData) {
            setExpandedNodes(new Set([treeData.id]));
        }
    }, [treeData]);

    // Reset view
    const resetView = useCallback(() => {
        setZoomLevel(1);
        setSelectedNode(null);
        if (treeData) {
            setExpandedNodes(new Set([treeData.id]));
            setFocusedNodeId(treeData.id);
        }
    }, [treeData]);

    // Render tree node
    const TreeNode: React.FC<{
        node: UserNode;
        depth: number;
        isLast: boolean;
    }> = ({ node, depth, isLast }) => {
        const isExpanded = expandedNodes.has(node.id);
        const isSelected = selectedNode?.id === node.id;
        const isFocused = focusedNodeId === node.id;
        const isCurrentUser = node.userId === userId;
        const hasChildren = node.children.length > 0;

        // Don't render if beyond max visible depth
        if (depth > maxVisibleDepth) return null;

        return (
            <div className="relative">
                {/* Node Card */}
                <div className="flex items-start mb-2">
                    {/* Expand/Collapse Button */}
                    {hasChildren && (
                        <button
                            onClick={() => toggleNodeExpansion(node.id)}
                            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 mr-2 mt-2"
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </button>
                    )}
                    {!hasChildren && <div className="w-6 mr-2"></div>}

                    {/* Node Content */}
                    <div
                        onClick={() => setSelectedNode(node)}
                        className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                            isCurrentUser
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-indigo-700 shadow-lg'
                                : isFocused
                                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-yellow-700 shadow-lg'
                                    : isSelected
                                        ? 'bg-green-50 border-green-500'
                                        : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-md'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                    isCurrentUser || isFocused
                                        ? 'bg-white/20 text-white'
                                        : 'bg-indigo-100 text-indigo-600'
                                }`}>
                                    <Users className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className={`font-semibold ${
                                        isCurrentUser || isFocused ? 'text-white' : 'text-gray-900'
                                    }`}>
                                        {node.userData.firstName} {node.userData.lastName}
                                        {isCurrentUser && <span className="ml-2 text-xs">(You)</span>}
                                    </div>
                                    <div className={`text-sm ${
                                        isCurrentUser || isFocused ? 'text-white/80' : 'text-gray-500'
                                    }`}>
                                        ID: {node.sponsorshipNumber}
                                    </div>
                                </div>
                            </div>

                            {hasChildren && (
                                <div className={`flex items-center space-x-2 ${
                                    isCurrentUser || isFocused ? 'text-white' : 'text-gray-600'
                                }`}>
                                    <Users className="h-4 w-4" />
                                    <span className="text-sm font-medium">{node.children.length}</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-2 flex items-center space-x-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                                isCurrentUser || isFocused
                                    ? 'bg-white/20 text-white'
                                    : 'bg-gray-100 text-gray-600'
                            }`}>
                                Level {node.level}
                            </span>
                            {node.children.length > 0 && (
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                    isCurrentUser || isFocused
                                        ? 'bg-white/20 text-white'
                                        : 'bg-indigo-100 text-indigo-600'
                                }`}>
                                    {node.children.length} {node.children.length === 1 ? 'child' : 'children'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Children */}
                {isExpanded && hasChildren && (
                    <div className="ml-8 border-l-2 border-gray-300 pl-4 space-y-2">
                        {node.children.map((child, index) => (
                            <TreeNode
                                key={child.id}
                                node={child}
                                depth={depth + 1}
                                isLast={index === node.children.length - 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // List view component
    const ListView: React.FC = () => {
        if (!treeData) return null;

        const allNodes: UserNode[] = [];
        const traverse = (node: UserNode) => {
            allNodes.push(node);
            node.children.forEach(child => traverse(child));
        };
        traverse(treeData);

        // Group by level
        const nodesByLevel = allNodes.reduce((acc, node) => {
            if (!acc[node.level]) acc[node.level] = [];
            acc[node.level].push(node);
            return acc;
        }, {} as Record<number, UserNode[]>);

        return (
            <div className="space-y-6">
                {Object.entries(nodesByLevel)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([level, nodes]) => (
                        <div key={level}>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                                    <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium mr-3">
                                        Level {level}
                                    </span>
                                    <span className="text-gray-600 text-sm">{nodes.length} members</span>
                                </h4>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {nodes.map(node => {
                                    const isSelected = selectedNode?.id === node.id;
                                    const isCurrentUser = node.userId === userId;

                                    return (
                                        <div
                                            key={node.id}
                                            onClick={() => setSelectedNode(node)}
                                            className={`bg-white border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                                                isCurrentUser
                                                    ? 'bg-indigo-50 border-2 border-indigo-500'
                                                    : isSelected
                                                        ? 'bg-green-50 border-2 border-green-500'
                                                        : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-center space-x-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                                    isCurrentUser
                                                        ? 'bg-indigo-500 text-white'
                                                        : isSelected
                                                            ? 'bg-green-500 text-white'
                                                            : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                    <Users className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-900">
                                                        {node.userData.firstName} {node.userData.lastName}
                                                        {isCurrentUser && <span className="ml-2 text-xs text-indigo-600">(You)</span>}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        ID: {node.sponsorshipNumber}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between">
                                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                                    Level {node.level}
                                                </span>
                                                {node.children.length > 0 && (
                                                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium flex items-center">
                                                        <Users className="h-3 w-3 mr-1" />
                                                        {node.children.length}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="text-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
                <p className="text-gray-500">Loading your network...</p>
            </div>
        );
    }

    if (!treeData) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Network Data</h3>
                <p className="text-gray-600">You don't have any referrals yet. Start building your network!</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Network Overview */}
            <div className="bg-white rounded-xl shadow-sm">
                <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Network Overview</h3>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-indigo-50 rounded-lg">
                            <div className="text-3xl font-bold text-indigo-600">{stats.totalDownline}</div>
                            <div className="text-sm text-gray-600 mt-1">Total Network</div>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                            <div className="text-3xl font-bold text-purple-600">{stats.directReferrals}</div>
                            <div className="text-sm text-gray-600 mt-1">Direct Referrals</div>
                        </div>
                        <div className="text-center p-4 bg-yellow-50 rounded-lg">
                            <div className="text-3xl font-bold text-yellow-600">{stats.maxDepth + 1}</div>
                            <div className="text-sm text-gray-600 mt-1">Depth Levels</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                            <div className="text-3xl font-bold text-green-600">{expandedNodes.size}</div>
                            <div className="text-sm text-gray-600 mt-1">Expanded Nodes</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Network Visualization */}
            <div className="bg-white rounded-xl shadow-sm">
                {/* Controls */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                        <div className="flex items-center space-x-4">
                            {/* View Mode */}
                            <select
                                value={viewMode}
                                onChange={(e) => setViewMode(e.target.value as ViewMode)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="tree">Tree View</option>
                                <option value="list">List View</option>
                            </select>

                            {/* Depth Control */}
                            {viewMode === 'tree' && (
                                <select
                                    value={maxVisibleDepth}
                                    onChange={(e) => setMaxVisibleDepth(parseInt(e.target.value))}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value={1}>Show 1 Level</option>
                                    <option value={2}>Show 2 Levels</option>
                                    <option value={3}>Show 3 Levels</option>
                                    <option value={5}>Show 5 Levels</option>
                                    <option value={10}>Show 10 Levels</option>
                                    <option value={999}>Show All</option>
                                </select>
                            )}
                        </div>

                        <div className="flex items-center space-x-2">
                            {/* Expand/Collapse */}
                            <button
                                onClick={() => expandToDepth(maxVisibleDepth)}
                                className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm"
                            >
                                Expand All
                            </button>
                            <button
                                onClick={collapseAll}
                                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                            >
                                Collapse All
                            </button>

                            {/* Zoom Controls */}
                            {viewMode === 'tree' && (
                                <>
                                    <button
                                        onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
                                        className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                                    >
                                        <Minus className="h-4 w-4" />
                                    </button>
                                    <span className="text-sm font-medium text-gray-700 min-w-[50px] text-center">
                                        {Math.round(zoomLevel * 100)}%
                                    </span>
                                    <button
                                        onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
                                        className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </>
                            )}

                            <button
                                onClick={resetView}
                                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                                title="Reset View"
                            >
                                <RotateCcw className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tree Content */}
                <div
                    ref={scrollContainerRef}
                    className="p-8 overflow-auto"
                    style={{
                        minHeight: '500px',
                        maxHeight: '800px'
                    }}
                >
                    <div
                        style={{
                            transform: viewMode === 'tree' ? `scale(${zoomLevel})` : 'none',
                            transformOrigin: 'top left',
                            transition: 'transform 0.2s'
                        }}
                    >
                        {viewMode === 'tree' ? (
                            <TreeNode node={treeData} depth={0} isLast={false} />
                        ) : (
                            <ListView />
                        )}
                    </div>
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                            <Grid3X3 className="h-4 w-4" />
                            <span>Total Depth: {stats.maxDepth + 1}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                            <Users className="h-4 w-4" />
                            <span>Total Members: {stats.totalDownline}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Selected Node Details */}
            {selectedNode && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Member Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-600">Name</label>
                            <p className="text-gray-900 font-medium">
                                {selectedNode.userData.firstName} {selectedNode.userData.lastName}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600">Sponsorship ID</label>
                            <p className="text-gray-900 font-mono">{selectedNode.sponsorshipNumber}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600">Email</label>
                            <p className="text-gray-900">{selectedNode.userData.email}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600">Level</label>
                            <p className="text-gray-900">{selectedNode.level}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600">Direct Children</label>
                            <p className="text-gray-900">{selectedNode.children.length}</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-600">Status</label>
                            <p className="text-gray-900">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                    selectedNode.isActive
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                }`}>
                                    {selectedNode.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyNetwork;