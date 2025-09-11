import React from 'react';
import { TransactionState } from '../types/wallet';
import { CreditCard, CheckCircle, XCircle, Loader, ExternalLink, Users, Shield, Home } from 'lucide-react';

interface PaymentSectionProps {
    onPayment: () => void;
    transaction: TransactionState;
    distributionSteps?: string[];
    planPrice: number;
    settings: {
        paymentMode: string;
        usdtAddress: string;
        subscriptionContractAddress: string;
        subscriptionWalletAddress: string;
    } | null;
    onGoToDashboard: () => void;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
                                                                  onPayment,
                                                                  transaction,
                                                                  distributionSteps = [],
                                                                  planPrice,
                                                                  settings,
                                                                  onGoToDashboard,
                                                              }) => {
    const openTransaction = () => {
        if (transaction.hash) {
            const explorerUrl = settings?.paymentMode === '1'
                ? `https://bscscan.com/tx/${transaction.hash}`
                : `https://testnet.bscscan.com/tx/${transaction.hash}`;
            window.open(explorerUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const getNetworkName = () => {
        return settings?.paymentMode === '1' ? 'BSC Mainnet' : 'BSC Testnet';
    };

    const getUSDTContractAddress = () => {
        return settings?.usdtAddress || 'Not configured';
    };

    const getDistributionContractAddress = () => {
        return settings?.subscriptionContractAddress || 'Not configured';
    };

    const getSubscriptionWalletAddress = () => {
        return settings?.subscriptionWalletAddress || 'Not configured';
    };

    const formatAddress = (address: string) => {
        if (!address || address === 'Not configured') return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Determine if we should show the payment button
    const showPaymentButton = !transaction.isProcessing && transaction.status !== 'success';

    return (
        <div className="space-y-6">
            {/* Payment Section - Only show if not in success state */}
            {showPaymentButton && (
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 border border-purple-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <CreditCard className="w-5 h-5 mr-2 text-purple-600" />
                            USDT Distribution Payment
                        </h3>
                        <div className="flex items-center px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                            <Shield className="w-3 h-3 mr-1" />
                            {getNetworkName()}
                        </div>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-medium text-blue-800 mb-2 flex items-center">
                                <Users className="w-4 h-4 mr-2" />
                                Distribution Details
                            </h4>
                            <div className="text-blue-700 text-sm space-y-1">
                                <p>• Subscription Wallet: {formatAddress(getSubscriptionWalletAddress())} → {planPrice} USDT</p>
                                <p className="font-semibold mt-2 text-blue-800">Total: {planPrice} USDT</p>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Distribution Contract Address
                            </label>
                            <code className="block px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 text-sm font-mono">
                                {formatAddress(getDistributionContractAddress())}
                            </code>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                USDT Token Address (BEP-20)
                            </label>
                            <code className="block px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 text-sm font-mono">
                                {formatAddress(getUSDTContractAddress())}
                            </code>
                        </div>
                    </div>

                    <button
                        onClick={onPayment}
                        disabled={transaction.isProcessing}
                        className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed shadow-lg"
                    >
                        {transaction.isProcessing ? (
                            <Loader className="w-5 h-5 animate-spin" />
                        ) : (
                            <CreditCard className="w-5 h-5" />
                        )}
                        <span>
                            {transaction.isProcessing
                                ? 'Processing Distribution...'
                                : `Approve & Distribute ${planPrice} USDT`
                            }
                        </span>
                    </button>
                </div>
            )}

            {/* Transaction Status - Show in all states except idle */}
            {transaction.status !== 'idle' && (
                <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 border border-purple-200 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribution Status</h3>

                    <div className="space-y-4">
                        <div className="flex items-center space-x-3">
                            {transaction.status === 'pending' && (
                                <Loader className="w-6 h-6 text-yellow-500 animate-spin" />
                            )}
                            {transaction.status === 'success' && (
                                <CheckCircle className="w-6 h-6 text-green-500" />
                            )}
                            {transaction.status === 'error' && (
                                <XCircle className="w-6 h-6 text-red-500" />
                            )}

                            <span className={`font-medium ${
                                transaction.status === 'pending' ? 'text-yellow-700' :
                                    transaction.status === 'success' ? 'text-green-700' :
                                        'text-red-700'
                            }`}>
                                {transaction.status === 'pending' && 'Distribution Processing...'}
                                {transaction.status === 'success' && 'Distribution Successful!'}
                                {transaction.status === 'error' && 'Distribution Failed'}
                            </span>
                        </div>

                        {/* Distribution Steps */}
                        {distributionSteps.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Distribution Process
                                </label>
                                <div className="bg-gray-50 rounded border border-gray-200 p-3 max-h-60 overflow-y-auto">
                                    {distributionSteps.map((step, index) => (
                                        <div key={index} className="text-xs text-gray-600 font-mono mb-1">
                                            {step}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {transaction.hash && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Transaction Hash
                                </label>
                                <div className="flex items-center space-x-2">
                                    <code className="flex-1 px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 text-sm font-mono overflow-x-auto scrollbar-hide whitespace-nowrap">
                                        {transaction.hash}
                                    </code>
                                    <button
                                        onClick={openTransaction}
                                        className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors border border-blue-200 flex-shrink-0"
                                        title={`View on ${getNetworkName()} Explorer`}
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Click the icon to view this transaction on the blockchain explorer
                                </p>
                            </div>
                        )}

                        {transaction.error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                <h4 className="font-medium text-red-800 mb-2">Error Details</h4>
                                <p className="text-red-700 text-sm">{transaction.error}</p>
                            </div>
                        )}

                        {transaction.status === 'success' && (
                            <div className="space-y-4">
                                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                    <h4 className="font-medium text-green-800 mb-2">Distribution Confirmed</h4>
                                    <p className="text-green-700 text-sm">
                                        Your distribution of {planPrice} USDT has been successfully processed to the subscription wallet through the smart contract.
                                        The transaction has been recorded on the {getNetworkName()} and the recipient has received the allocated amount.
                                    </p>
                                    <p className="text-green-600 text-xs mt-2">
                                        You can verify the transaction using the link above.
                                    </p>
                                </div>

                                <button
                                    onClick={onGoToDashboard}
                                    className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 shadow-lg"
                                >
                                    <Home className="w-5 h-5" />
                                    <span>Go to Dashboard</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};