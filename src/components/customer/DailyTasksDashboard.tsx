import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useNotification } from '../ui/NotificationProvider';
import {
    Calendar,
    Gift,
    Share2,
    Video,
    Target,
    Clock,
    CheckCircle,
    X,
    ExternalLink,
    DollarSign,
    ThumbsUp,
    ThumbsDown,
    RefreshCw,
    Eye,
    Lock
} from 'lucide-react';

interface CouponTask {
    tc_id: string;
    tc_title: string;
    tc_description?: string;
    tc_coupon_code: string;
    tc_image_url?: string;
    tc_website_url?: string;
    tc_valid_from: string;
    tc_valid_until: string;
    tc_share_reward_amount: number;
    tc_launch_date: string;
    tc_launch_now: boolean;
}

interface SocialTask {
    tdt_id: string;
    tdt_task_type: 'social_share' | 'video_share' | 'custom';
    tdt_title: string;
    tdt_description?: string;
    tdt_content_url?: string;
    tdt_reward_amount: number;
    tdt_expires_at: string;
    tdt_is_active: boolean;
}

type DailyTask = CouponTask | SocialTask;

interface TaskViewState {
    [key: string]: {
        isCodeVisible: boolean;
        isCountdownActive: boolean;
        countdownSeconds: number;
    };
}

const DailyTasksDashboard: React.FC = () => {
    const { user } = useAuth();
    const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [showConfirmationModal, setShowConfirmationModal] = useState(false);
    const [userFeedback, setUserFeedback] = useState({
        feedback: '' as 'liked' | 'disliked' | '',
        note: ''
    });
    const [taskViewStates, setTaskViewStates] = useState<TaskViewState>({});
    const [activeCountdownId, setActiveCountdownId] = useState<string | null>(null);
    const notification = useNotification();

    useEffect(() => {
        if (user?.id) {
            loadDailyTasks();
        }
    }, [user?.id]);

    const loadDailyTasks = async () => {
        if (!user?.id) return;

        try {
            setLoading(true);
            console.log('Loading daily tasks for user:', user.id);

            // First, try to load just the basic data to debug
            const today = new Date().toISOString().split('T')[0];

            // Load today's launched coupons
            const { data: couponsData, error: couponsError } = await supabase
                .from('tbl_coupons')
                .select('*')
                .eq('tc_status', 'approved')
                .eq('tc_is_active', true)
                .lte('tc_valid_from', today)
                .gte('tc_valid_until', today)
                .order('tc_created_at', { ascending: false });

            if (couponsError) {
                console.error('Coupons query error:', couponsError);
                // Continue even if coupons fail
            }

            console.log('Coupons loaded:', couponsData?.length || 0);

            // Load regular tasks
            const { data: tasksData, error: tasksError } = await supabase
                .from('tbl_daily_tasks')
                .select('*')
                .eq('tdt_is_active', true)
                .gte('tdt_expires_at', new Date().toISOString())
                .order('tdt_created_at', { ascending: false });

            if (tasksError) {
                console.error('Tasks query error:', tasksError);
                // Continue even if tasks fail
            }

            console.log('Tasks loaded:', tasksData?.length || 0);

            // Combine both types of tasks
            const combinedTasks: DailyTask[] = [];

            // Add coupon tasks
            if (couponsData) {
                couponsData.forEach(coupon => {
                    combinedTasks.push({
                        tc_id: coupon.tc_id,
                        tc_title: coupon.tc_title,
                        tc_description: coupon.tc_description,
                        tc_coupon_code: coupon.tc_coupon_code,
                        tc_image_url: coupon.tc_image_url,
                        tc_website_url: coupon.tc_website_url,
                        tc_valid_from: coupon.tc_valid_from,
                        tc_valid_until: coupon.tc_valid_until,
                        tc_share_reward_amount: coupon.tc_share_reward_amount,
                        tc_launch_date: coupon.tc_launch_date,
                        tc_launch_now: coupon.tc_launch_now,
                    });

                    // Initialize view state
                    if (!taskViewStates[coupon.tc_id]) {
                        setTaskViewStates(prev => ({
                            ...prev,
                            [coupon.tc_id]: {
                                isCodeVisible: false,
                                isCountdownActive: false,
                                countdownSeconds: 30
                            }
                        }));
                    }
                });
            }

            // Add regular tasks
            if (tasksData) {
                tasksData.forEach(task => {
                    combinedTasks.push({
                        tdt_id: task.tdt_id,
                        tdt_task_type: task.tdt_task_type,
                        tdt_title: task.tdt_title,
                        tdt_description: task.tdt_description,
                        tdt_content_url: task.tdt_content_url,
                        tdt_reward_amount: task.tdt_reward_amount,
                        tdt_expires_at: task.tdt_expires_at,
                        tdt_is_active: task.tdt_is_active,
                    });
                });
            }

            setDailyTasks(combinedTasks);
            console.log('Total tasks loaded:', combinedTasks.length);

        } catch (error: any) {
            console.error('Failed to load daily tasks:', error);
            notification.showError('Error', 'Failed to load daily tasks. Please check console for details.');
        } finally {
            setLoading(false);
        }
    };

    const handleViewCouponCode = (taskId: string) => {
        if (activeCountdownId && activeCountdownId !== taskId) {
            notification.showError('Please wait', 'Please finish viewing the current coupon first');
            return;
        }

        setActiveCountdownId(taskId);
        setTaskViewStates(prev => ({
            ...prev,
            [taskId]: {
                ...prev[taskId],
                isCountdownActive: true,
                countdownSeconds: 30
            }
        }));

        // Start countdown timer
        const timer = setInterval(() => {
            setTaskViewStates(prev => {
                const currentState = prev[taskId];
                if (!currentState || !currentState.isCountdownActive) {
                    clearInterval(timer);
                    setActiveCountdownId(null);
                    return prev;
                }

                if (currentState.countdownSeconds > 1) {
                    return {
                        ...prev,
                        [taskId]: {
                            ...currentState,
                            countdownSeconds: currentState.countdownSeconds - 1
                        }
                    };
                } else {
                    clearInterval(timer);
                    setActiveCountdownId(null);
                    return {
                        ...prev,
                        [taskId]: {
                            isCodeVisible: true,
                            isCountdownActive: false,
                            countdownSeconds: 0
                        }
                    };
                }
            });
        }, 1000);

        saveCouponInteraction(taskId, 'viewed');
    };

    const saveCouponInteraction = async (couponId: string, interactionType: 'viewed' | 'liked' | 'disliked' | 'used' | 'unused', feedbackText: string = '') => {
        if (!user?.id) return;

        try {
            // First check if the table exists
            const { error } = await supabase
                .from('tbl_coupon_interactions')
                .insert({
                    tci_user_id: user.id,
                    tci_coupon_id: couponId,
                    tci_interaction_type: interactionType,
                    tci_feedback_text: feedbackText,
                });

            if (error) {
                console.warn('Could not save interaction (table might not exist):', error);
            }
        } catch (error) {
            console.warn('Error saving coupon interaction:', error);
        }
    };

    const handleCouponFeedback = async (feedback: 'liked' | 'disliked', note: string = '') => {
        if (!selectedTask || !user?.id || !('tc_id' in selectedTask)) return;

        try {
            await saveCouponInteraction(selectedTask.tc_id, feedback, note);

            notification.showSuccess(
                'Feedback Submitted!',
                `Thank you for your feedback on "${selectedTask.tc_title}"`
            );

            setShowFeedbackModal(false);
            setSelectedTask(null);
            setUserFeedback({ feedback: '', note: '' });

        } catch (error: any) {
            console.error('Failed to submit feedback:', error);
            notification.showError('Submission Failed', 'Failed to submit feedback');
        }
    };

    const handleUseCoupon = async () => {
        if (!selectedTask || !user?.id || !('tc_id' in selectedTask)) return;

        if (selectedTask.tc_website_url) {
            window.open(selectedTask.tc_website_url, '_blank');
        }

        setShowConfirmationModal(true);
    };

    const confirmCouponUsage = async () => {
        if (!selectedTask || !user?.id || !('tc_id' in selectedTask)) return;

        try {
            await saveCouponInteraction(selectedTask.tc_id, 'used');

            notification.showSuccess(
                'Coupon Used!',
                `Thank you for using "${selectedTask.tc_title}"`
            );

            setShowConfirmationModal(false);
            setSelectedTask(null);

        } catch (error: any) {
            console.error('Failed to complete task:', error);
            notification.showError('Task Failed', 'Failed to complete task');
        }
    };

    const handleSocialTaskCompletion = async (task: SocialTask) => {
        if (!user?.id) return;

        try {
            notification.showSuccess(
                'Task Completed!',
                `You earned ${task.tdt_reward_amount} USDT for completing the task!`
            );
        } catch (error: any) {
            console.error('Failed to complete task:', error);
            notification.showError('Task Failed', 'Failed to complete task');
        }
    };

    const getTaskIcon = (task: DailyTask) => {
        if ('tc_id' in task) return Gift;
        return Share2;
    };

    const getTaskType = (task: DailyTask): string => {
        if ('tc_id' in task) return 'coupon_share';
        return 'social_share';
    };

    const isCouponTask = (task: DailyTask): task is CouponTask => {
        return 'tc_id' in task;
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="animate-pulse">
                        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                        <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <h3 className="text-lg font-semibold text-gray-900">Today's Tasks</h3>
                    <button
                        onClick={loadDailyTasks}
                        className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                        title="Refresh tasks"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
                <div className="text-sm text-gray-500">
                    {dailyTasks.length} tasks available
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dailyTasks.map((task) => {
                    const TaskIcon = getTaskIcon(task);
                    const taskType = getTaskType(task);
                    const taskId = isCouponTask(task) ? task.tc_id : task.tdt_id;
                    const viewState = taskViewStates[taskId] || {
                        isCodeVisible: false,
                        isCountdownActive: false,
                        countdownSeconds: 30
                    };

                    const isCountdownActive = activeCountdownId !== null;
                    const isThisCouponActive = activeCountdownId === taskId;
                    const canViewCode = !isCountdownActive || isThisCouponActive;

                    return (
                        <div key={taskId} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-lg ${
                                        taskType === 'coupon_share' ? 'bg-orange-100' : 'bg-blue-100'
                                    }`}>
                                        <TaskIcon className={`h-5 w-5 ${
                                            taskType === 'coupon_share' ? 'text-orange-600' : 'text-blue-600'
                                        }`} />
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-gray-900">
                                            {isCouponTask(task) ? task.tc_title : task.tdt_title}
                                        </h5>
                                        <p className="text-sm text-gray-500 capitalize">{taskType.replace('_', ' ')}</p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-gray-600 text-sm mb-4">
                                {isCouponTask(task) ? task.tc_description : task.tdt_description}
                            </p>

                            {isCouponTask(task) && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                                    <div className="flex items-center space-x-2">
                                        <Gift className="h-4 w-4 text-orange-600" />
                                        <span className="text-sm font-medium text-orange-800">
                                            {task.tc_title}
                                        </span>
                                    </div>

                                    {viewState.isCodeVisible ? (
                                        <>
                                            <p className="text-xs text-orange-600 font-mono mt-1">
                                                Code: {task.tc_coupon_code}
                                            </p>
                                            {task.tc_website_url && (
                                                <div className="mt-2">
                                                    <a
                                                        href={task.tc_website_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                                                    >
                                                        <ExternalLink className="h-3 w-3 mr-1" />
                                                        Visit Website
                                                    </a>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="mt-2 flex items-center justify-between">
                                            <div className="flex items-center text-orange-600">
                                                <Lock className="h-3 w-3 mr-1" />
                                                <span className="text-xs">Code hidden</span>
                                            </div>
                                            {!viewState.isCountdownActive ? (
                                                <button
                                                    onClick={() => handleViewCouponCode(taskId)}
                                                    disabled={!canViewCode}
                                                    className={`flex items-center text-xs ${
                                                        canViewCode
                                                            ? 'text-blue-600 hover:text-blue-800'
                                                            : 'text-gray-400 cursor-not-allowed'
                                                    }`}
                                                >
                                                    <Eye className="h-3 w-3 mr-1" />
                                                    View Code
                                                </button>
                                            ) : (
                                                <div className="text-xs text-orange-600">
                                                    Unlocking in {viewState.countdownSeconds}s...
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-2 text-xs text-orange-700">
                                        <div>Valid: {new Date(task.tc_valid_from).toLocaleDateString()} - {new Date(task.tc_valid_until).toLocaleDateString()}</div>
                                        <div>Share Reward: {task.tc_share_reward_amount} USDT</div>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-2">
                                    <DollarSign className="h-4 w-4 text-green-600" />
                                    <span className="font-medium text-green-600">
                                        {isCouponTask(task) ? task.tc_share_reward_amount : (task as SocialTask).tdt_reward_amount} USDT
                                    </span>
                                </div>
                            </div>

                            {isCouponTask(task) && viewState.isCodeVisible ? (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setUserFeedback({ feedback: 'liked', note: '' });
                                                setShowFeedbackModal(true);
                                            }}
                                            className="flex items-center justify-center space-x-2 bg-green-100 text-green-700 py-2 px-4 rounded-lg font-medium hover:bg-green-200 transition-colors"
                                        >
                                            <ThumbsUp className="h-4 w-4" />
                                            <span>Like</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setUserFeedback({ feedback: 'disliked', note: '' });
                                                setShowFeedbackModal(true);
                                            }}
                                            className="flex items-center justify-center space-x-2 bg-red-100 text-red-700 py-2 px-4 rounded-lg font-medium hover:bg-red-200 transition-colors"
                                        >
                                            <ThumbsDown className="h-4 w-4" />
                                            <span>Dislike</span>
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSelectedTask(task);
                                            handleUseCoupon();
                                        }}
                                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2"
                                    >
                                        Use Coupon
                                    </button>
                                </>
                            ) : isCouponTask(task) ? (
                                <div className="text-center py-4 text-gray-500">
                                    {viewState.isCountdownActive ? (
                                        <div className="flex items-center justify-center">
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600 mr-2"></div>
                                            <span>Unlocking coupon code... {viewState.countdownSeconds}s</span>
                                        </div>
                                    ) : (
                                        <span>Click "View Code" to reveal coupon</span>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={() => handleSocialTaskCompletion(task as SocialTask)}
                                    className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
                                >
                                    Complete Task
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {dailyTasks.length === 0 && !loading && (
                <div className="text-center py-12">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks available</h3>
                    <p className="text-gray-600">Check back later for new daily tasks!</p>
                </div>
            )}

            {/* Feedback Modal */}
            {showFeedbackModal && selectedTask && isCouponTask(selectedTask) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">Share Your Feedback</h3>
                            <button
                                onClick={() => {
                                    setShowFeedbackModal(false);
                                    setSelectedTask(null);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                            <h4 className="font-medium text-blue-900">{selectedTask.tc_title}</h4>
                            <p className="text-sm text-blue-700 mt-1">Coupon Code: {selectedTask.tc_coupon_code}</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Why did you {userFeedback.feedback} this coupon?
                                </label>
                                <textarea
                                    value={userFeedback.note}
                                    onChange={(e) => setUserFeedback(prev => ({ ...prev, note: e.target.value }))}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Share your thoughts about this coupon..."
                                />
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowFeedbackModal(false);
                                        setSelectedTask(null);
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleCouponFeedback(userFeedback.feedback as 'liked' | 'disliked', userFeedback.note)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Submit Feedback
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {showConfirmationModal && selectedTask && isCouponTask(selectedTask) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">Confirm Coupon Usage</h3>
                            <button
                                onClick={() => {
                                    setShowConfirmationModal(false);
                                    setSelectedTask(null);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="mb-6 p-4 bg-green-50 rounded-lg">
                            <h4 className="font-medium text-green-900">Did you use the coupon?</h4>
                            <p className="text-sm text-green-700 mt-1">
                                Please confirm if you successfully used the coupon "{selectedTask.tc_title}" on the merchant's website.
                            </p>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowConfirmationModal(false);
                                    setSelectedTask(null);
                                }}
                                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                No, I didn't use it
                            </button>
                            <button
                                onClick={confirmCouponUsage}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                                Yes, I used the coupon
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DailyTasksDashboard;