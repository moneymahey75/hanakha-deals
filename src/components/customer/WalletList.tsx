import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../ui/NotificationProvider';
import { Wallet, Copy, RefreshCw, CheckCircle, XCircle, AlertCircle, Star } from 'lucide-react';

interface UserWallet {
    tuwc_id: string;
    tuwc_wallet_address: string;
    tuwc_wallet_name: string;
    tuwc_wallet_type: string;
    tuwc_chain_id: number;
    tuwc_is_active: boolean;
    tuwc_is_default: boolean;
    tuwc_last_connected_at: string;
    tuwc_created_at: string;
}

interface WalletListProps {
    userId: string;
}

const WalletList: React.FC<WalletListProps> = ({ userId }) => {
    const [userWallets, setUserWallets] = useState<UserWallet[]>([]);
    const [loading, setLoading] = useState(true);
    const [settingDefault, setSettingDefault] = useState<string | null>(null);
    const notification = useNotification();

    useEffect(() => {
        if (userId) {
            loadUserWallets();
        }
    }, [userId]);

    const loadUserWallets = async () => {
        if (!userId) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tbl_user_wallet_connections')
                .select('*')
                .eq('tuwc_user_id', userId)
                .order('tuwc_is_default', { ascending: false })
                .order('tuwc_last_connected_at', { ascending: false });

            if (error) {
                throw error;
            }

            setUserWallets(data || []);
        } catch (error) {
            console.error('Failed to load user wallets:', error);
            notification.showError('Error', 'Failed to load wallet information.');
        } finally {
            setLoading(false);
        }
    };

    const copyWalletAddress = (address: string) => {
        navigator.clipboard.writeText(address);
        notification.showSuccess('Copied!', 'Wallet address copied to clipboard');
    };

    const setDefaultWallet = async (walletId: string) => {
        if (!userId) return;

        setSettingDefault(walletId);
        try {
            // First, remove default flag from all wallets
            const { error: updateError } = await supabase
                .from('tbl_user_wallet_connections')
                .update({ tuwc_is_default: false })
                .eq('tuwc_user_id', userId);

            if (updateError) throw updateError;

            // Then set the selected wallet as default
            const { error: setDefaultError } = await supabase
                .from('tbl_user_wallet_connections')
                .update({
                    tuwc_is_default: true,
                    tuwc_last_connected_at: new Date().toISOString()
                })
                .eq('tuwc_id', walletId);

            if (setDefaultError) throw setDefaultError;

            // Reload the wallets list
            await loadUserWallets();
            notification.showSuccess('Success', 'Default wallet updated successfully');
        } catch (error) {
            console.error('Failed to set default wallet:', error);
            notification.showError('Error', 'Failed to set default wallet.');
        } finally {
            setSettingDefault(null);
        }
    };

    const formatWalletAddress = (address: string) => {
        return `${address.slice(0, 8)}...${address.slice(-6)}`;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getWalletTypeName = (type: string) => {
        const typeMap: Record<string, string> = {
            'metamask': 'MetaMask',
            'trust': 'Trust Wallet',
            'safepal': 'SafePal',
            'binance': 'Binance Chain Wallet',
            'web3': 'Web3 Wallet'
        };
        return typeMap[type] || type;
    };

    const getNetworkName = (chainId: number) => {
        const networkMap: Record<number, string> = {
            1: 'Ethereum Mainnet',
            56: 'BSC Mainnet',
            97: 'BSC Testnet',
            137: 'Polygon Mainnet',
            80001: 'Polygon Testnet'
        };
        return networkMap[chainId] || `Chain ID: ${chainId}`;
    };

    if (loading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading wallets...</p>
            </div>
        );
    }

    if (userWallets.length === 0) {
        return (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Wallet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">No wallets connected</h4>
                <p className="text-gray-500 mb-4">Connect your wallet to start using our services</p>
                <button
                    onClick={() => window.location.href = '/subscription-plans'}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                    Connect Wallet
                </button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">My Connected Wallets</h3>
                <button
                    onClick={loadUserWallets}
                    disabled={loading}
                    className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 disabled:text-gray-400"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                </button>
            </div>

            <div className="space-y-4">
                {userWallets.map((wallet) => (
                    <div key={wallet.tuwc_id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <div className={`p-2 rounded-lg ${
                                    wallet.tuwc_is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    <Wallet className="h-5 w-5" />
                                </div>
                                <div>
                                    <h4 className="font-medium text-gray-900 flex items-center">
                                        {getWalletTypeName(wallet.tuwc_wallet_type)}
                                        {wallet.tuwc_is_default && (
                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Star className="h-3 w-3 mr-1" />
                        Default
                      </span>
                                        )}
                                        {wallet.tuwc_is_active && !wallet.tuwc_is_default && (
                                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </span>
                                        )}
                                    </h4>
                                    <p className="text-sm text-gray-500">
                                        {getNetworkName(wallet.tuwc_chain_id)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => copyWalletAddress(wallet.tuwc_wallet_address)}
                                    className="p-2 text-gray-400 hover:text-gray-600"
                                    title="Copy address"
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Wallet Address</p>
                                    <p className="text-sm text-gray-500 font-mono">
                                        {formatWalletAddress(wallet.tuwc_wallet_address)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500">
                                        Last connected: {formatDate(wallet.tuwc_last_connected_at)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 flex justify-end">
                            {!wallet.tuwc_is_default && (
                                <button
                                    onClick={() => setDefaultWallet(wallet.tuwc_id)}
                                    disabled={settingDefault === wallet.tuwc_id}
                                    className="flex items-center space-x-2 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50"
                                >
                                    {settingDefault === wallet.tuwc_id ? (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                    ) : (
                                        <Star className="h-3 w-3" />
                                    )}
                                    <span>Set as Default</span>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                        <h4 className="font-medium text-blue-900">Default Wallet</h4>
                        <p className="text-sm text-blue-700 mt-1">
                            Your default wallet will be used for all transactions. You can change your default wallet at any time.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WalletList;