import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../components/ui/NotificationProvider';
import {
    Users,
    TrendingUp,
    ChevronLeft,
    Home,
    Plus,
    Minus,
    RotateCcw,
    Eye,
    Grid3X3,
} from 'lucide-react';
import { BinaryTreeManager, TreeNode } from '../../utils/binaryTreeUtils';

interface DashboardStats {
    totalReferrals: number;
    monthlyEarnings: number;
    currentLevel: number;
    achievementPoints: number;
    leftSideCount: number;
    rightSideCount: number;
    directReferrals: number;
    totalDownline: number;
}

interface NodeWithParent extends TreeNode {
    parentUserId?: string;
    parentName?: string;
}

interface MyNetworkProps {
    treeData: any;
    dashboardStats: any;
    userId: string;
}

type ViewMode = 'tree' | 'levels';

const MyNetwork: React.FC<MyNetworkProps> = ({ treeData, dashboardStats, userId }) => {
    const { user } = useAuth();
    const notification = useNotification();
    const [treeManager] = useState(() => new BinaryTreeManager(treeData || []));
    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [viewMode, setViewMode] = useState<ViewMode>('tree');
    const [visibleLevels, setVisibleLevels] = useState<number[]>([]);
    const [focusedNode, setFocusedNode] = useState<TreeNode | null>(null);
    const [allLevelsData, setAllLevelsData] = useState<Map<number, NodeWithParent[]>>(new Map());
    const [actualMaxDepth, setActualMaxDepth] = useState(0);
    const [navigationHistory, setNavigationHistory] = useState<{node: TreeNode, levels: number[]}[]>([]);
    const [loading, setLoading] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Calculate all levels data
    const calculateTreeData = useCallback(() => {
        if (!treeData || treeData.length === 0) return { levelData: new Map(), maxDepth: 0 };

        const levelData = new Map<number, NodeWithParent[]>();
        let maxDepth = 0;

        const userNode = treeManager.getUserPosition(userId);
        if (!userNode) return { levelData: new Map(), maxDepth: 0 };

        const queue: { node: TreeNode, level: number, parent?: TreeNode }[] = [
            { node: userNode, level: 0 }
        ];

        while (queue.length > 0) {
            const { node, level, parent } = queue.shift()!;

            if (!node) continue;

            maxDepth = Math.max(maxDepth, level);

            // Add node to level data
            if (!levelData.has(level)) {
                levelData.set(level, []);
            }

            const nodeWithParent: NodeWithParent = {
                ...node,
                parentUserId: parent?.userId,
                parentName: parent?.userData?.firstName || 'Root'
            };

            levelData.get(level)!.push(nodeWithParent);

            // Add children to queue
            const children = treeManager.getDirectChildren(node.userId);
            if (children.left) {
                queue.push({ node: children.left, level: level + 1, parent: node });
            }
            if (children.right) {
                queue.push({ node: children.right, level: level + 1, parent: node });
            }
        }

        setAllLevelsData(levelData);
        setActualMaxDepth(maxDepth);
        return { levelData, maxDepth };
    }, [treeManager, userId, treeData]);

    useEffect(() => {
        if (treeData && treeData.length > 0) {
            setLoading(true);
            try {
                treeManager.loadTree(treeData);
                const userNode = treeManager.getUserPosition(userId);

                if (userNode) {
                    calculateTreeData();
                    setFocusedNode(userNode);
                    // Show first 3 levels initially
                    const initialLevels = [0, 1, 2];
                    setVisibleLevels(initialLevels);
                    // Add to navigation history
                    setNavigationHistory([{node: userNode, levels: initialLevels}]);
                }
            } catch (error) {
                console.error('Failed to process tree data:', error);
                notification.showError('Error', 'Failed to process network data.');
            } finally {
                setLoading(false);
            }
        }
    }, [treeData, treeManager, userId, calculateTreeData, notification]);

    // Handle node click to show next 3 levels
    const handleNodeClick = useCallback((node: TreeNode, level: number) => {
        setSelectedNode(node);
        setFocusedNode(node);

        // Show the next 3 levels from the clicked node's level
        const startLevel = level;
        const newVisibleLevels = [];

        for (let i = startLevel; i < startLevel + 3 && i <= actualMaxDepth; i++) {
            newVisibleLevels.push(i);
        }

        setVisibleLevels(newVisibleLevels);

        // Add to navigation history
        setNavigationHistory(prev => [...prev, {node, levels: newVisibleLevels}]);
    }, [actualMaxDepth]);

    // Navigate to previous levels in history
    const navigateToPreviousLevels = useCallback(() => {
        if (navigationHistory.length <= 1) return;

        // Remove current state from history
        const newHistory = [...navigationHistory];
        newHistory.pop();

        // Get the previous state
        const previousState = newHistory[newHistory.length - 1];

        // Update view with previous state
        setFocusedNode(previousState.node);
        setVisibleLevels(previousState.levels);
        setSelectedNode(null); // Remove highlight

        // Update history
        setNavigationHistory(newHistory);
    }, [navigationHistory]);

    // Navigate back to root
    const navigateToRoot = useCallback(() => {
        const userNode = treeManager.getUserPosition(userId);
        if (userNode) {
            setFocusedNode(userNode);
            setVisibleLevels([0, 1, 2]);
            setSelectedNode(null);
            // Reset navigation history to just the root
            setNavigationHistory([{node: userNode, levels: [0, 1, 2]}]);
        }
    }, [treeManager, userId]);

    // Check if a level should be visible
    const isLevelVisible = useCallback((level: number) => {
        return visibleLevels.includes(level);
    }, [visibleLevels]);

    // Get nodes at specific level from pre-computed data
    const getNodesAtLevel = useCallback((level: number): NodeWithParent[] => {
        return allLevelsData.get(level) || [];
    }, [allLevelsData]);

    // Detailed node component with 3-level constraint
    const DetailedNode: React.FC<{
        node: TreeNode | null;
        position: 'left' | 'right' | 'root';
        level: number;
    }> = ({ node, position, level }) => {
        if (!node || !isLevelVisible(level)) {
            return (
                <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: '120px' }}>
                    <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                        <Plus className="h-5 w-5 text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Available</p>
                </div>
            );
        }

        const isSelected = selectedNode?.id === node.id;
        const isCurrentUser = node.userId === userId;
        const isFocused = focusedNode?.id === node.id;
        const nodeChildren = treeManager.getDirectChildren(node.userId);
        const hasChildren = nodeChildren.left || nodeChildren.right;

        return (
            <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: '120px' }}>
                <div
                    onClick={() => handleNodeClick(node, level)}
                    className={`relative w-20 h-20 rounded-lg cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                        isCurrentUser ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' :
                            isFocused ? 'bg-gradient-to-r from-yellow-500 to-orange-600 text-white shadow-lg' :
                                isSelected ? 'bg-gradient-to-r from-green-500 to-teal-600 text-white shadow-lg' :
                                    'bg-white border-2 border-gray-200 hover:border-indigo-300 hover:shadow-md'
                    }`}
                >
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
                        <Users className={`h-4 w-4 mb-1 ${
                            isCurrentUser || isSelected || isFocused ? 'text-white' : 'text-gray-600'
                        }`} />
                        <p className={`text-xs font-medium text-center leading-tight ${
                            isCurrentUser || isSelected || isFocused ? 'text-white' : 'text-gray-900'
                        }`}>
                            {(node.userData?.firstName || 'User').substring(0, 8)}
                        </p>
                    </div>

                    <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        position === 'left' ? 'bg-blue-500 text-white' :
                            position === 'right' ? 'bg-green-500 text-white' :
                                'bg-purple-500 text-white'
                    }`}>
                        {position === 'left' ? 'L' : position === 'right' ? 'R' : 'R'}
                    </div>
                </div>

                {/* Show children only if they're within the next 2 levels */}
                {hasChildren && level < Math.max(...visibleLevels) && (
                    <div className="mt-4 flex justify-center" style={{ minWidth: '200px' }}>
                        <div className="flex items-start" style={{ gap: '40px' }}>
                            {nodeChildren.left && (
                                <div className="flex flex-col items-center">
                                    <div className="w-px h-4 bg-gray-300 mb-2"></div>
                                    <DetailedNode node={nodeChildren.left} position="left" level={level + 1} />
                                </div>
                            )}
                            {nodeChildren.right && (
                                <div className="flex flex-col items-center">
                                    <div className="w-px h-4 bg-gray-300 mb-2"></div>
                                    <DetailedNode node={nodeChildren.right} position="right" level={level + 1} />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Improved level view with parent information
    const LevelView: React.FC<{ level: number }> = ({ level }) => {
        const nodesAtLevel = getNodesAtLevel(level);

        if (nodesAtLevel.length === 0 || !isLevelVisible(level)) return null;

        return (
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium mr-3">
              Level {level}
            </span>
                        <span className="text-gray-600 text-sm">{nodesAtLevel.length} members</span>
                    </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {nodesAtLevel.map((node, index) => {
                        const isSelected = selectedNode?.id === node.id;
                        const isCurrentUser = node.userId === userId;
                        const isFocused = focusedNode?.id === node.id;

                        return (
                            <div
                                key={`${node.userId}-${index}`}
                                onClick={() => handleNodeClick(node, level)}
                                className={`bg-white border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                                    isCurrentUser ? 'bg-indigo-100 border-2 border-indigo-300' :
                                        isFocused ? 'bg-yellow-100 border-2 border-yellow-300' :
                                            isSelected ? 'bg-green-100 border-2 border-green-300' : 'hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center space-x-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                        isCurrentUser ? 'bg-indigo-500 text-white' :
                                            isFocused ? 'bg-yellow-500 text-white' :
                                                isSelected ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        <Users className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-medium text-gray-900">
                                            {node.userData?.firstName || 'User'} {node.userData?.lastName || ''}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            ID: {node.sponsorshipNumber}
                                        </div>

                                        {/* Parent information */}
                                        {level > 0 && node.parentName && (
                                            <div className="text-xs text-gray-500 mt-1">
                                                Parent: {node.parentName}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    Level {level}
                  </span>
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                        node.position === 'left' ? 'bg-blue-100 text-blue-700' :
                                            node.position === 'right' ? 'bg-green-100 text-green-700' :
                                                'bg-purple-100 text-purple-700'
                                    }`}>
                    {node.position === 'left' ? 'Left' : node.position === 'right' ? 'Right' : 'Root'}
                  </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderTreeView = () => {
        switch (viewMode) {
            case 'levels':
                return (
                    <div className="space-y-6">
                        {visibleLevels.map(level => (
                            <LevelView key={level} level={level} />
                        ))}
                    </div>
                );

            case 'tree':
            default:
                return (
                    <div className="space-y-8">
                        <DetailedNode node={focusedNode} position="root" level={focusedNode?.level || 0} />
                    </div>
                );
        }
    };

    const userNode = treeManager.getUserPosition(userId);
    const stats = treeManager.getTreeStats(userId);

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading network data...</p>
            </div>
        );
    }

    if (!userNode || !treeData || treeData.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Network Data</h3>
                <p className="text-gray-600">User not found in the MLM network or no data available.</p>
            </div>
        );
    }

    return (
        <div>
            {/* Network Overview */}
            <div className="bg-white rounded-xl shadow-sm mb-8">
                <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Network Overview</h3>
                </div>

                <div className="p-6">
                    {/* Network Balance */}
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <div className="flex items-center space-x-4">
                            <div className="flex-1">
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Left Side</span>
                                    <span>{dashboardStats.leftSideCount} members</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-blue-600 h-2 rounded-full"
                                        style={{
                                            width: `${dashboardStats.totalDownline > 0 ? (dashboardStats.leftSideCount / dashboardStats.totalDownline) * 100 : 0}%`
                                        }}
                                    ></div>
                                </div>
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Right Side</span>
                                    <span>{dashboardStats.rightSideCount} members</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-green-600 h-2 rounded-full"
                                        style={{
                                            width: `${dashboardStats.totalDownline > 0 ? (dashboardStats.rightSideCount / dashboardStats.totalDownline) * 100 : 0}%`
                                        }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="p-6 bg-gray-50 border-b border-gray-200">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-indigo-600">{stats.totalDownline}</div>
                                <div className="text-sm text-gray-600">Total Network</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-600">{stats.directReferrals}</div>
                                <div className="text-sm text-gray-600">Direct Referrals</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-yellow-600">{actualMaxDepth + 1}</div>
                                <div className="text-sm text-gray-600">Total Levels</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-red-600">{visibleLevels.length}</div>
                                <div className="text-sm text-gray-600">Visible Levels</div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Binary Tree Visualization */}
            <div className="bg-white rounded-xl shadow-sm">
                {/* Enhanced Header with View Controls */}
                <div className="p-6 border-b border-gray-200">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                        <div>
                            <p className="text-gray-600">Showing {visibleLevels.length} levels at a time</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                            {/* View Mode Selector */}
                            <div className="flex items-center space-x-2">
                                <label className="text-sm font-medium text-gray-700">View:</label>
                                <select
                                    value={viewMode}
                                    onChange={(e) => setViewMode(e.target.value as ViewMode)}
                                    className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="tree">Tree View</option>
                                    <option value="levels">Level View</option>
                                </select>
                            </div>

                            {/* Navigation Controls */}
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={navigateToPreviousLevels}
                                    disabled={navigationHistory.length <= 1}
                                    className={`p-2 rounded-lg flex items-center ${
                                        navigationHistory.length <= 1
                                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                    }`}
                                    title="Previous Levels"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>

                                <button
                                    onClick={navigateToRoot}
                                    disabled={focusedNode?.userId === userNode.userId}
                                    className={`p-2 rounded-lg flex items-center ${
                                        focusedNode?.userId === userNode.userId
                                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                    }`}
                                    title="Back to Root"
                                >
                                    <Home className="h-4 w-4" />
                                </button>
                            </div>

                            {/* Zoom Controls */}
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
                                    className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    <Minus className="h-4 w-4" />
                                </button>
                                <span className="text-sm font-medium text-gray-700 min-w-[50px] text-center">
                                  {Math.round(zoomLevel * 100)}%
                                </span>
                                <button
                                    onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
                                    className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>

                                <button
                                    onClick={() => {
                                        setZoomLevel(1);
                                        navigateToRoot();
                                    }}
                                    className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                    title="Reset View"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tree Visualization */}
                <div className="relative">
                    <div
                        ref={scrollContainerRef}
                        className="p-8 overflow-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200"
                        style={{
                            minHeight: '500px',
                            maxHeight: '800px',
                            scrollBehavior: 'smooth'
                        }}
                    >
                        <div
                            style={{
                                transform: `scale(${zoomLevel})`,
                                transformOrigin: 'top center',
                                width: 'fit-content',
                                minWidth: '100%'
                            }}
                        >
                            {renderTreeView()}
                        </div>
                    </div>

                    {/* Navigation Helper */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 border-t border-gray-200">
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <div className="flex items-center space-x-1">
                                <Eye className="h-4 w-4" />
                                <span>Viewing levels {Math.min(...visibleLevels)} - {Math.max(...visibleLevels)}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                                <Grid3X3 className="h-4 w-4" />
                                <span>Total depth: {actualMaxDepth + 1}</span>
                            </div>
                            {focusedNode && focusedNode.userId !== userNode.userId && (
                                <div className="flex items-center space-x-1">
                                    <Users className="h-4 w-4" />
                                    <span>Focused on: {focusedNode.userData?.firstName}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                            <button
                                onClick={navigateToPreviousLevels}
                                disabled={navigationHistory.length <= 1}
                                className={`px-2 py-1 rounded ${
                                    navigationHistory.length <= 1
                                        ? 'text-gray-400 cursor-not-allowed'
                                        : 'text-indigo-600 hover:bg-indigo-100'
                                }`}
                            >
                                Previous
                            </button>
                        </div>
                    </div>
                </div>

                {/* Selected Node Details */}
                {selectedNode && (
                    <div className="p-6 bg-indigo-50 border-t border-gray-200">
                        <h4 className="text-lg font-semibold text-indigo-900 mb-4">Node Details</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-sm font-medium text-indigo-700">Name</label>
                                <p className="text-gray-900">
                                    {selectedNode.userData?.firstName} {selectedNode.userData?.lastName}
                                </p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-indigo-700">Sponsorship Number</label>
                                <p className="text-gray-900 font-mono">{selectedNode.sponsorshipNumber}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-indigo-700">Level</label>
                                <p className="text-gray-900">{selectedNode.level}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-indigo-700">Position</label>
                                <p className="text-gray-900 capitalize">{selectedNode.position}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MyNetwork;