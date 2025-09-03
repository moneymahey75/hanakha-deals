import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar,
  Plus,
  Search,
  Eye,
  Trash2,
  Gift,
  Video,
  Share2,
  Save,
  X,
  Link as LinkIcon,
  Target,
  Clock,
  Users,
  Award,
  CalendarClock
} from 'lucide-react';

interface DailyTask {
  tdt_id: string;
  tdt_created_by: string;
  tdt_task_type: 'coupon_share' | 'social_share' | 'video_share' | 'custom';
  tdt_title: string;
  tdt_description?: string;
  tdt_content_url?: string;
  tdt_coupon_id?: string;
  tdt_reward_amount: number;
  tdt_completed_count: number;
  tdt_task_date: string;
  tdt_expires_at: string;
  tdt_is_active: boolean;
  tdt_created_at: string;
  tdt_updated_at: string;
  coupon_info?: {
    title: string;
    coupon_code: string;
  };
}

const DailyTaskManagement: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const notification = useNotification();

  const [selectedTask, setSelectedTask] = useState<DailyTask | null>(null);
  const [showTaskDetails, setShowTaskDetails] = useState(false);

  const [newTask, setNewTask] = useState({
    task_type: 'coupon_share' as 'coupon_share' | 'social_share' | 'video_share' | 'custom',
    title: '',
    description: '',
    content_url: '',
    coupon_id: '',
    reward_amount: 0.5,
    task_date: new Date().toISOString().split('T')[0],
    expires_at: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
    is_active: true
  });

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line
  }, [selectedDate]);

  const loadTasks = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
          .from('tbl_daily_tasks')
          .select(`
          *,
          tbl_coupons(tc_title, tc_coupon_code)
        `)
          .eq('tdt_task_date', selectedDate)
          .order('tdt_created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const formattedTasks = (data || []).map(task => ({
        ...task,
        coupon_info: task.tbl_coupons ? {
          title: task.tbl_coupons.tc_title,
          coupon_code: task.tbl_coupons.tc_coupon_code
        } : undefined
      }));

      setTasks(formattedTasks);
    } catch (error) {
      notification.showError('Load Failed', 'Failed to load daily tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      notification.showError('Error', 'User not authenticated');
      return;
    }

    try {
      const { error } = await supabase
          .from('tbl_daily_tasks')
          .insert({
            tdt_created_by: user.id,
            tdt_task_type: newTask.task_type,
            tdt_title: newTask.title,
            tdt_description: newTask.description,
            tdt_content_url: newTask.content_url,
            tdt_coupon_id: newTask.coupon_id || null,
            tdt_reward_amount: newTask.reward_amount,
            tdt_task_date: newTask.task_date,
            tdt_expires_at: new Date(newTask.expires_at).toISOString(),
            tdt_is_active: newTask.is_active
          });

      if (error) throw error;

      notification.showSuccess('Task Created', 'Daily task has been created successfully');
      setShowCreateModal(false);
      resetNewTask();
      loadTasks();
    } catch (error) {
      notification.showError('Creation Failed', 'Failed to create daily task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) return;
    try {
      const { error } = await supabase
          .from('tbl_daily_tasks')
          .delete()
          .eq('tdt_id', taskId);

      if (error) throw error;

      notification.showSuccess('Task Deleted', 'Daily task has been deleted successfully');
      loadTasks();
    } catch (error) {
      notification.showError('Deletion Failed', 'Failed to delete task');
    }
  };

  const resetNewTask = () => {
    setNewTask({
      task_type: 'coupon_share',
      title: '',
      description: '',
      content_url: '',
      coupon_id: '',
      reward_amount: 0.5,
      task_date: new Date().toISOString().split('T')[0],
      expires_at: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
      is_active: true
    });
  };

  const getTaskIcon = (taskType: string) => {
    switch (taskType) {
      case 'coupon_share': return Gift;
      case 'social_share': return Share2;
      case 'video_share': return Video;
      default: return Target;
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch =
        task.tdt_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.tdt_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.coupon_info?.title.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
        typeFilter === 'all' || task.tdt_task_type === typeFilter;

    return matchesSearch && matchesType;
  });

  const getTaskStats = () => {
    const total = tasks.length;
    const active = tasks.filter(t => t.tdt_is_active).length;
    const completed = tasks.reduce((sum, t) => sum + t.tdt_completed_count, 0);
    const totalRewards = tasks.reduce((sum, t) => sum + (t.tdt_reward_amount * t.tdt_completed_count), 0);

    return { total, active, completed, totalRewards };
  };

  const stats = getTaskStats();

  // Function to format the 24-hour availability period
  const getAvailabilityPeriod = (taskDate: string) => {
    const startDate = new Date(taskDate);
    const endDate = new Date(taskDate);
    endDate.setHours(23, 59, 59, 999);

    return {
      start: startDate.toLocaleString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      end: endDate.toLocaleString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      })
    };
  };

  if (loading) {
    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
    );
  }

  return (
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Daily Task Management</h3>
                <p className="text-gray-600">Create and manage daily tasks for customers</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Task</span>
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.completed}</div>
              <div className="text-sm text-gray-600">Completions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.totalRewards.toFixed(2)} USDT</div>
              <div className="text-sm text-gray-600">Rewards Paid</div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Search tasks..."
                />
              </div>
            </div>
            <div>
              <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="coupon_share">Coupon Share</option>
                <option value="social_share">Social Share</option>
                <option value="video_share">Video Share</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="this_week">This Week</option>
                <option value="all">All Dates</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div className="p-6">
          {filteredTasks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTasks.map((task) => {
                  const TaskIcon = getTaskIcon(task.tdt_task_type);
                  const isExpired = new Date(task.tdt_expires_at) < new Date();

                  return (
                      <div key={task.tdt_id} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
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
                              <h4 className="font-semibold text-gray-900">{task.tdt_title}</h4>
                              <p className="text-sm text-gray-500 capitalize">{task.tdt_task_type.replace('_', ' ')}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              isExpired ? 'bg-red-100 text-red-800' :
                                  task.tdt_is_active ? 'bg-green-100 text-green-800' :
                                      'bg-gray-100 text-gray-800'
                          }`}>
                      {isExpired ? 'Expired' : task.tdt_is_active ? 'Active' : 'Inactive'}
                    </span>
                        </div>

                        <p className="text-gray-600 text-sm mb-4">{task.tdt_description}</p>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Reward:</span>
                            <span className="font-medium text-green-600">{task.tdt_reward_amount} USDT</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Completions:</span>
                            <span>{task.tdt_completed_count}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Expires:</span>
                            <span className="text-sm">{new Date(task.tdt_expires_at).toLocaleTimeString()}</span>
                          </div>
                        </div>

                        {task.tdt_task_type === 'coupon_share' && task.coupon_info && (
                            <div className="mt-4 p-3 bg-orange-50 rounded-lg">
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
                            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                              <div className="flex items-center space-x-2">
                                <LinkIcon className="h-4 w-4 text-blue-600" />
                                <a
                                    href={task.tdt_content_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:text-blue-800 truncate"
                                >
                                  {task.tdt_content_url}
                                </a>
                              </div>
                            </div>
                        )}

                        <div className="mt-4 flex space-x-2">
                          <button
                              className="flex-1 bg-blue-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-1"
                              onClick={() => {
                                setSelectedTask(task);
                                setShowTaskDetails(true);
                              }}
                          >
                            <Eye className="h-4 w-4" />
                            <span>View</span>
                          </button>
                          <button
                              onClick={() => handleDeleteTask(task.tdt_id)}
                              className="bg-red-600 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                  );
                })}
              </div>
          ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
                <p className="text-gray-600 mb-4">
                  No daily tasks found for {new Date(selectedDate).toLocaleDateString()}
                </p>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Create First Task
                </button>
              </div>
          )}
        </div>

        {/* Task Details Modal - Redesigned */}
        {showTaskDetails && selectedTask && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">Task Details</h3>
                  <button
                      onClick={() => {
                        setShowTaskDetails(false);
                        setSelectedTask(null);
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  {/* Task Type Badge */}
                  <div className="flex items-center p-3 bg-blue-50 rounded-lg">
                    <div className="bg-blue-100 p-2 rounded-lg mr-3">
                      {(() => {
                        const Icon = getTaskIcon(selectedTask.tdt_task_type);
                        return <Icon className="h-5 w-5 text-blue-600" />;
                      })()}
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Type</p>
                      <p className="font-medium capitalize">{selectedTask.tdt_task_type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>

                  {/* Reward Amount */}
                  <div className="flex items-center p-3 bg-green-50 rounded-lg">
                    <div className="bg-green-100 p-2 rounded-lg mr-3">
                      <Award className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Reward</p>
                      <p className="font-medium text-green-600">{selectedTask.tdt_reward_amount} USDT</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                    <div className="bg-gray-100 p-2 rounded-lg mr-3">
                      <div className={`h-2 w-2 rounded-full ${
                          selectedTask.tdt_is_active ? 'bg-green-500' : 'bg-gray-400'
                      }`}></div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <p className="font-medium">{selectedTask.tdt_is_active ? "Active" : "Inactive"}</p>
                    </div>
                  </div>
                </div>

                {/* Task Title and Description */}
                <div className="mb-6">
                  <h4 className="text-lg font-medium text-gray-900 mb-2">{selectedTask.tdt_title}</h4>
                  {selectedTask.tdt_description && (
                      <p className="text-gray-600">{selectedTask.tdt_description}</p>
                  )}
                </div>

                {/* 24-Hour Availability Period */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
                  <div className="flex items-center mb-2">
                    <CalendarClock className="h-5 w-5 text-blue-600 mr-2" />
                    <h5 className="font-medium text-blue-800">24-Hour Availability Period</h5>
                  </div>
                  <p className="text-sm text-blue-700 mb-1">
                    This task will be available to customers for exactly 24 hours:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                      <span className="font-medium">Starts:</span>
                      <span className="ml-2">{getAvailabilityPeriod(selectedTask.tdt_task_date).start}</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                      <span className="font-medium">Ends:</span>
                      <span className="ml-2">{getAvailabilityPeriod(selectedTask.tdt_task_date).start.split(',')[0]}, {getAvailabilityPeriod(selectedTask.tdt_task_date).end}</span>
                    </div>
                  </div>
                </div>

                {/* Completion Stats */}
                <div className="bg-gray-50 rounded-xl p-4 mb-6">
                  <div className="flex items-center mb-3">
                    <Users className="h-5 w-5 text-gray-600 mr-2" />
                    <h5 className="font-medium text-gray-800">Completion Stats</h5>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600">Total Completions:</span>
                    <span className="font-medium">{selectedTask.tdt_completed_count}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    This task has been completed {selectedTask.tdt_completed_count} times
                  </p>
                </div>

                {/* Additional Details */}
                <div className="mb-6">
                  {selectedTask.tdt_task_type === 'coupon_share' && selectedTask.coupon_info && (
                      <div className="mb-4">
                        <h6 className="text-sm font-medium text-gray-700 mb-2">Coupon Details</h6>
                        <div className="bg-orange-50 p-3 rounded-lg">
                          <p className="font-medium text-orange-800">{selectedTask.coupon_info.title}</p>
                          <p className="text-xs text-orange-600 font-mono mt-1">Code: {selectedTask.coupon_info.coupon_code}</p>
                        </div>
                      </div>
                  )}

                  {selectedTask.tdt_content_url && (
                      <div>
                        <h6 className="text-sm font-medium text-gray-700 mb-2">Content URL</h6>
                        <div className="flex items-center p-3 bg-blue-50 rounded-lg">
                          <LinkIcon className="h-4 w-4 text-blue-600 mr-2" />
                          <a
                              href={selectedTask.tdt_content_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 truncate text-sm"
                          >
                            {selectedTask.tdt_content_url}
                          </a>
                        </div>
                      </div>
                  )}
                </div>

                {/* Dates Information */}
                <div className="border-t border-gray-200 pt-4">
                  <h6 className="text-sm font-medium text-gray-700 mb-3">Timeline</h6>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Created</p>
                      <p className="font-medium">{new Date(selectedTask.tdt_created_at).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Last Updated</p>
                      <p className="font-medium">{new Date(selectedTask.tdt_updated_at).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        )}

        {/* Create Task Modal - Simplified */}
        {showCreateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">Create Daily Task</h3>
                  <button
                      onClick={() => {
                        setShowCreateModal(false);
                        resetNewTask();
                      }}
                      className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleCreateTask} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Task Type *
                    </label>
                    <select
                        value={newTask.task_type}
                        onChange={(e) => setNewTask(prev => ({ ...prev, task_type: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="coupon_share">Coupon Share</option>
                      <option value="social_share">Social Share</option>
                      <option value="video_share">Video Share</option>
                      <option value="custom">Custom Task</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Task Title *
                      </label>
                      <input
                          type="text"
                          required
                          value={newTask.title}
                          onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="e.g., Share Summer Sale Coupon"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reward Amount (USDT) *
                      </label>
                      <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={newTask.reward_amount}
                          onChange={(e) => setNewTask(prev => ({ ...prev, reward_amount: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="0.50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                        value={newTask.description}
                        onChange={(e) => setNewTask(prev => ({ ...prev, description: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Describe what users need to do..."
                    />
                  </div>

                  {(newTask.task_type === 'social_share' || newTask.task_type === 'video_share') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Content URL *
                        </label>
                        <input
                            type="url"
                            required
                            value={newTask.content_url}
                            onChange={(e) => setNewTask(prev => ({ ...prev, content_url: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="https://instagram.com/p/example or https://youtube.com/watch?v=example"
                        />
                      </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Task Date *
                    </label>
                    <input
                        type="date"
                        required
                        value={newTask.task_date}
                        onChange={(e) => setNewTask(prev => ({ ...prev, task_date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="is_active"
                        checked={newTask.is_active}
                        onChange={(e) => setNewTask(prev => ({ ...prev, is_active: e.target.checked }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
                      Task is active and available to customers
                    </label>
                  </div>

                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={() => {
                          setShowCreateModal(false);
                          resetNewTask();
                        }}
                        className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <Save className="h-4 w-4" />
                      <span>Create Task</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}
      </div>
  );
};

export default DailyTaskManagement;