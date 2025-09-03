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
    DollarSign
} from 'lucide-react';

interface DailyTask {
    tdt_id: string;
    tdt_task_type: 'coupon_share' | 'social_share' | 'video_share' | 'custom';
    tdt_title: string;
    tdt_description?: string;
    tdt_content_url?: string;
    tdt_reward_amount: number;
    tdt_expires_at: string;
    tdt_is_active: boolean;
    tdt_target_platforms: string[];
    coupon_info?: {
        title: string;
        coupon_code: string;
        image_url?: string;
    };
    user_task?: {
        completion_status: 'assigned' | 'in_progress' | 'completed' | 'verified' | 'expired' | 'failed';
        completed_at?: string;
    };
}

const DailyTasksDashboard: React.FC = () => {
    const { user } = useAuth();
    const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [taskSubmission, setTaskSubmission] = useState({
        share_url: '',
        platform: 'facebook',
        screenshot_url: ''
    });
    const notification = useNotification();

    useEffect(() => {
        if (user?.id) {
            loadDailyTasks();
        }
    }, [user?.id]);

    const loadDailyTasks = async () => {
        if (!user?.id) return;

        try {
            const today = new Date().toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('tbl_daily_tasks')
                .select(`
          *,
          tbl_coupons(tc_title, tc_coupon_code, tc_image_url),
          tbl_user_tasks(tut_completion_status, tut_completed_at)
        `)
                .eq('tdt_task_date', today)
                .eq('tdt_is_active', true)
                .gte('tdt_expires_at', new Date().toISOString())
                .order('tdt_created_at', { ascending: false });

            if (error) throw error;

            const formattedTasks = (data || []).map(task => ({
                ...task,
                coupon_info: task.tbl_coupons ? {
                    title: task.tbl_coupons.tc_title,
                    coupon_code: task.tbl_coupons.tc_coupon_code,
                    image_url: task.tbl_coupons.tc_image_url
                } : undefined,
                user_task: task.tbl_user_tasks?.[0] ? {
                    completion_status: task.tbl_user_tasks[0].tut_completion_status,
                    completed_at: task.tbl_user_tasks[0].tut_completed_at
                } : undefined
            }));

            setDailyTasks(formattedTasks);
        } catch (error) {
            console.error('Failed to load daily tasks:', error);
            notification.showError('Error', 'Failed to load daily tasks');
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTask || !user?.id) return;

        try {
            const { data, error } = await supabase.rpc('complete_user_task', {
                p_user_id: user.id,
                p_task_id: selectedTask.tdt_id,
                p_share_url: taskSubmission.share_url,
                p_platform: taskSubmission.platform,
                p_screenshot_url: taskSubmission.screenshot_url
            });

            if (error) throw error;

            notification.showSuccess(
                'Task Completed!',
                `You earned ${selectedTask.tdt_reward_amount} USDT for completing this task.`
            );

            setShowTaskModal(false);
            setSelectedTask(null);
            setTaskSubmission({ share_url: '', platform: 'facebook', screenshot_url: '' });

            // Refresh tasks
            loadDailyTasks();
        } catch (error: any) {
            console.error('Failed to complete task:', error);
            notification.showError('Task Failed', error.message || 'Failed to complete task');
        }
    };

    const getTaskIcon = (taskType: string) => {
        switch (taskType) {
            case 'coupon_share': return Gift;
            case 'social_share': return Share2;
            case 'video_share': return Video;
            default: return Target;
        }
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
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Today's Tasks</h3>
                <div className="text-sm text-gray-500">
                    {dailyTasks.filter(t => t.user_task?.completion_status === 'completed' || t.user_task?.completion_status === 'verified').length} / {dailyTasks.length} completed
                </div>
            </div>

            {/* Tasks Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dailyTasks.map((task) => {
                    const TaskIcon = getTaskIcon(task.tdt_task_type);
                    const isCompleted = task.user_task?.completion_status === 'completed' || task.user_task?.completion_status === 'verified';
                    const isExpired = new Date(task.tdt_expires_at) < new Date();

                    return (
                        <div key={task.tdt_id} className={`border rounded-xl p-6 transition-all ${
                            isCompleted ? 'border-green-200 bg-green-50' :
                                isExpired ? 'border-red-200 bg-red-50' :
                                    'border-gray-200 hover:shadow-lg'
                        }`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-lg ${
                                        task.tdt_task_type === 'coupon_share' ? 'bg-orange-100' :
                                            task.tdt_task_type === 'social_share' ? 'bg-blue-100' :
                                                task.tdt_task_type === 'video_share' ? 'bg-red-100' :
                                                    'bg-purple-100'
                                    }`}>
                                        <TaskIcon className={`h-5 w-5 ${
                                            task.tdt_task_type === 'coupon_share' ? 'text-orange-600' :
                                                task.tdt_task_type === 'social_share' ? 'text-blue-600' :
                                                    task.tdt_task_type === 'video_share' ? 'text-red-600' :
                                                        'text-purple-600'
                                        }`} />
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-gray-900">{task.tdt_title}</h5>
                                        <p className="text-sm text-gray-500 capitalize">{task.tdt_task_type.replace('_', ' ')}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    isCompleted ? 'bg-green-100 text-green-800' :
                                        isExpired ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                }`}>
                  {isCompleted ? 'Completed' : isExpired ? 'Expired' : 'Available'}
                </span>
                            </div>

                            <p className="text-gray-600 text-sm mb-4">{task.tdt_description}</p>

                            {task.coupon_info && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                                    <div className="flex items-center space-x-2">
                                        <Gift className="h-4 w-4 text-orange-600" />
                                        <span className="text-sm font-medium text-orange-800">
                      {task.coupon_info.title}
                    </span>
                                    </div>
                                    <p className="text-xs text-orange-600 font-mono mt-1">
                                        Code: {task.coupon_info.coupon_code}
                                    </p>
                                </div>
                            )}

                            {task.tdt_content_url && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                    <div className="flex items-center space-x-2">
                                        <ExternalLink className="h-4 w-4 text-blue-600" />
                                        <a
                                            href={task.tdt_content_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm text-blue-600 hover:text-blue-800 truncate"
                                        >
                                            View Content
                                        </a>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-2">
                                    <DollarSign className="h-4 w-4 text-green-600" />
                                    <span className="font-medium text-green-600">{task.tdt_reward_amount} USDT</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Clock className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm text-gray-500">
                    Expires: {new Date(task.tdt_expires_at).toLocaleTimeString()}
                  </span>
                                </div>
                            </div>

                            {!isCompleted && !isExpired && (
                                <button
                                    onClick={() => {
                                        setSelectedTask(task);
                                        setShowTaskModal(true);
                                    }}
                                    className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors"
                                >
                                    Complete Task
                                </button>
                            )}

                            {isCompleted && task.user_task?.completed_at && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                    <div className="flex items-center space-x-2">
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-sm text-green-800">
                      Completed on {new Date(task.user_task.completed_at).toLocaleDateString()}
                    </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {dailyTasks.length === 0 && (
                <div className="text-center py-12">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks available</h3>
                    <p className="text-gray-600">Check back later for new daily tasks!</p>
                </div>
            )}

            {/* Task Completion Modal */}
            {showTaskModal && selectedTask && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-gray-900">Complete Task</h3>
                            <button
                                onClick={() => {
                                    setShowTaskModal(false);
                                    setSelectedTask(null);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                            <h4 className="font-medium text-blue-900">{selectedTask.tdt_title}</h4>
                            <p className="text-sm text-blue-700 mt-1">{selectedTask.tdt_description}</p>
                            <div className="flex items-center space-x-4 mt-3">
                                <span className="text-sm text-blue-600">Reward: {selectedTask.tdt_reward_amount} USDT</span>
                                <span className="text-sm text-blue-600">
                  Expires: {new Date(selectedTask.tdt_expires_at).toLocaleTimeString()}
                </span>
                            </div>
                        </div>

                        <form onSubmit={handleCompleteTask} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Share URL *
                                </label>
                                <input
                                    type="url"
                                    required
                                    value={taskSubmission.share_url}
                                    onChange={(e) => setTaskSubmission(prev => ({ ...prev, share_url: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="Paste the URL of your social media post"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Platform *
                                </label>
                                <select
                                    value={taskSubmission.platform}
                                    onChange={(e) => setTaskSubmission(prev => ({ ...prev, platform: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                >
                                    {selectedTask.tdt_target_platforms.map(platform => (
                                        <option key={platform} value={platform} className="capitalize">
                                            {platform}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Screenshot URL (Optional)
                                </label>
                                <input
                                    type="url"
                                    value={taskSubmission.screenshot_url}
                                    onChange={(e) => setTaskSubmission(prev => ({ ...prev, screenshot_url: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    placeholder="Upload screenshot proof (optional)"
                                />
                            </div>

                            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowTaskModal(false);
                                        setSelectedTask(null);
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                                >
                                    <CheckCircle className="h-4 w-4" />
                                    <span>Submit Task</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DailyTasksDashboard;