import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useNotification } from '../ui/NotificationProvider';
import {
    Gift,
    ThumbsUp,
    ThumbsDown,
    CheckCircle,
    XCircle,
    Clock,
    Calendar,
    ExternalLink,
    Filter,
    Search,
    Download,
    Eye,
    RefreshCw
} from 'lucide-react';

interface CouponInteraction {
    tci_id: string;
    tci_interaction_type: 'liked' | 'disliked' | 'used' | 'unused';
    tci_feedback_text: string;
    tci_created_at: string;
    tci_updated_at: string;
    coupon_info: {
        tc_id: string;
        tc_title: string;
        tc_coupon_code: string;
        tc_description: string;
        tc_image_url: string;
        tc_website_url: string;
        tc_valid_from: string;
        tc_valid_until: string;
        tc_share_reward_amount: number;
    };
}

const CouponInteractionsList: React.FC = () => {
    const { user } = useAuth();
    const [interactions, setInteractions] = useState<CouponInteraction[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'liked' | 'disliked' | 'used' | 'unused'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const notification = useNotification();

    useEffect(() => {
        if (user?.id) {
            loadInteractions();
        }
    }, [user?.id, filter]);

    const loadInteractions = async () => {
        if (!user?.id) return;

        try {
            setLoading(true);
            console.log('Loading coupon interactions for user:', user.id);

            // Updated query to use the correct foreign key relationship
            let query = supabase
                .from('tbl_coupon_interactions')
                .select(`
                    tci_id,
                    tci_interaction_type,
                    tci_feedback_text,
                    tci_created_at,
                    tci_updated_at,
                    tci_coupon_id,
                    tbl_coupons!tci_coupon_id (
                        tc_id,
                        tc_title,
                        tc_coupon_code,
                        tc_description,
                        tc_image_url,
                        tc_website_url,
                        tc_valid_from,
                        tc_valid_until,
                        tc_share_reward_amount
                    )
                `)
                .eq('tci_user_id', user.id)
                .order('tci_created_at', { ascending: false });

            if (filter !== 'all') {
                query = query.eq('tci_interaction_type', filter);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Failed to load interactions:', error);
                throw error;
            }

            console.log('Raw interactions data:', data);

            const formattedInteractions = (data || []).map(interaction => ({
                tci_id: interaction.tci_id,
                tci_interaction_type: interaction.tci_interaction_type,
                tci_feedback_text: interaction.tci_feedback_text || '',
                tci_created_at: interaction.tci_created_at,
                tci_updated_at: interaction.tci_updated_at,
                coupon_info: interaction.tbl_coupons ? {
                    tc_id: interaction.tbl_coupons.tc_id,
                    tc_title: interaction.tbl_coupons.tc_title,
                    tc_coupon_code: interaction.tbl_coupons.tc_coupon_code,
                    tc_description: interaction.tbl_coupons.tc_description || '',
                    tc_image_url: interaction.tbl_coupons.tc_image_url || '',
                    tc_website_url: interaction.tbl_coupons.tc_website_url || '',
                    tc_valid_from: interaction.tbl_coupons.tc_valid_from,
                    tc_valid_until: interaction.tbl_coupons.tc_valid_until,
                    tc_share_reward_amount: interaction.tbl_coupons.tc_share_reward_amount || 0
                } : null
            })).filter(interaction => interaction.coupon_info !== null) as CouponInteraction[];

            console.log('Formatted interactions:', formattedInteractions);
            setInteractions(formattedInteractions);
        } catch (error: any) {
            console.error('Failed to load coupon interactions:', error);
            notification.showError('Error', `Failed to load coupon interactions: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const filteredInteractions = interactions.filter(interaction => {
        if (!interaction.coupon_info) return false;

        const matchesSearch =
            interaction.coupon_info.tc_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            interaction.coupon_info.tc_description.toLowerCase().includes(searchTerm.toLowerCase());

        return matchesSearch;
    });

    const getInteractionIcon = (type: string) => {
        switch (type) {
            case 'liked': return <ThumbsUp className="h-5 w-5 text-green-600" />;
            case 'disliked': return <ThumbsDown className="h-5 w-5 text-red-600" />;
            case 'used': return <CheckCircle className="h-5 w-5 text-blue-600" />;
            case 'unused': return <XCircle className="h-5 w-5 text-gray-600" />;
            default: return <Gift className="h-5 w-5 text-orange-600" />;
        }
    };

    const getInteractionText = (type: string) => {
        switch (type) {
            case 'liked': return 'Liked';
            case 'disliked': return 'Disliked';
            case 'used': return 'Used';
            case 'unused': return 'Not Used';
            default: return 'Interacted';
        }
    };

    const exportToCSV = () => {
        if (filteredInteractions.length === 0) {
            notification.showError('Export Error', 'No data to export');
            return;
        }

        const headers = ['Coupon Title', 'Interaction Type', 'Feedback', 'Date', 'Coupon Code', 'Valid Until'];
        const csvData = filteredInteractions.map(interaction => [
            interaction.coupon_info.tc_title,
            getInteractionText(interaction.tci_interaction_type),
            interaction.tci_feedback_text || '',
            new Date(interaction.tci_created_at).toLocaleDateString(),
            interaction.coupon_info.tc_coupon_code,
            new Date(interaction.coupon_info.tc_valid_until).toLocaleDateString()
        ]);

        const csvContent = [
            headers.join(','),
            ...csvData.map(row => row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `coupon_interactions_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        notification.showSuccess('Export Complete', 'Your coupon interactions have been exported to CSV');
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-3 rounded-lg">
                        <Gift className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">My Coupon Interactions</h3>
                        <p className="text-gray-600">View your coupon likes, dislikes, and usage history</p>
                    </div>
                </div>
                {filteredInteractions.length > 0 && (
                    <button
                        onClick={exportToCSV}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
                    >
                        <Download className="h-4 w-4" />
                        <span>Export CSV</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Search coupons..."
                        />
                    </div>
                </div>

                <div>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="all">All Interactions</option>
                        <option value="liked">Liked</option>
                        <option value="disliked">Disliked</option>
                        <option value="used">Used</option>
                        <option value="unused">Not Used</option>
                    </select>
                </div>

                <div>
                    <button
                        onClick={loadInteractions}
                        className="w-full px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2"
                    >
                        <RefreshCw className="h-4 w-4" />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['all', 'liked', 'disliked', 'used'].map(type => {
                    const count = type === 'all'
                        ? interactions.length
                        : interactions.filter(i => i.tci_interaction_type === type).length;

                    return (
                        <div key={type} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-gray-900">{count}</div>
                            <div className="text-xs text-gray-500 capitalize">
                                {type === 'all' ? 'Total' : type}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {filteredInteractions.map((interaction) => {
                    const isExpired = new Date(interaction.coupon_info.tc_valid_until) < new Date();

                    return (
                        <div key={interaction.tci_id} className="border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-start space-x-4">
                                    <div className="flex-shrink-0">
                                        {getInteractionIcon(interaction.tci_interaction_type)}
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="font-semibold text-gray-900">{interaction.coupon_info.tc_title}</h4>
                                        <p className="text-sm text-gray-500 mt-1">{interaction.coupon_info.tc_description}</p>
                                        <div className="flex items-center space-x-4 mt-2">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                interaction.tci_interaction_type === 'liked' ? 'bg-green-100 text-green-800' :
                                                    interaction.tci_interaction_type === 'disliked' ? 'bg-red-100 text-red-800' :
                                                        interaction.tci_interaction_type === 'used' ? 'bg-blue-100 text-blue-800' :
                                                            interaction.tci_interaction_type === 'unused' ? 'bg-gray-100 text-gray-800' :
                                                                'bg-purple-100 text-purple-800'
                                            }`}>
                                                {getInteractionText(interaction.tci_interaction_type)}
                                            </span>
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                isExpired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {isExpired ? 'Expired' : 'Valid'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right text-sm text-gray-500 flex-shrink-0">
                                    <div>{new Date(interaction.tci_created_at).toLocaleDateString()}</div>
                                    <div>{new Date(interaction.tci_created_at).toLocaleTimeString()}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Coupon Code:</span>
                                    <p className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded mt-1">
                                        {interaction.coupon_info.tc_coupon_code}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Valid Until:</span>
                                    <p className="text-sm text-gray-900 mt-1">
                                        {new Date(interaction.coupon_info.tc_valid_until).toLocaleDateString()}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Reward:</span>
                                    <p className="text-sm text-green-600 font-medium mt-1">
                                        {interaction.coupon_info.tc_share_reward_amount} USDT
                                    </p>
                                </div>
                            </div>

                            {interaction.tci_feedback_text && (
                                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                                    <span className="text-sm font-medium text-gray-700">Your Feedback:</span>
                                    <p className="text-sm text-gray-800 mt-1">{interaction.tci_feedback_text}</p>
                                </div>
                            )}

                            {interaction.coupon_info.tc_website_url && (
                                <div className="flex items-center space-x-2">
                                    <ExternalLink className="h-4 w-4 text-blue-600" />
                                    <a
                                        href={interaction.coupon_info.tc_website_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-blue-600 hover:text-blue-800 underline"
                                    >
                                        Visit Merchant Website
                                    </a>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {filteredInteractions.length === 0 && (
                <div className="text-center py-12">
                    <Gift className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {filter === 'all' ? 'No interactions found' : `No ${filter} interactions found`}
                    </h3>
                    <p className="text-gray-600">
                        {filter === 'all'
                            ? 'Your coupon interactions will appear here once you start interacting with coupons.'
                            : searchTerm
                                ? 'Try adjusting your search term or changing the filter.'
                                : 'Try changing the filter or interact with some coupons.'
                        }
                    </p>
                </div>
            )}
        </div>
    );
};

export default CouponInteractionsList;