import React from 'react';
import { WalletState } from '../types/wallet';
import { Copy, ExternalLink, LogOut, Coins, Shield } from 'lucide-react';
import { useAdmin } from '../../contexts/AdminContext';

interface WalletInfoProps {
  wallet: WalletState;
  onDisconnect: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const WalletInfo: React.FC<WalletInfoProps> = ({ wallet, onDisconnect, onRefresh, refreshing }) => {
  const { settings } = useAdmin();

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      // You can use your notification system here instead of toast
      console.log('Address copied to clipboard');
    }
  };

  const openInExplorer = () => {
    if (wallet.address) {
      const explorerUrl = settings?.paymentMode === '1'
          ? `https://bscscan.com/address/${wallet.address}`
          : `https://testnet.bscscan.com/address/${wallet.address}`;
      window.open(explorerUrl, '_blank');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatContract = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const getNetworkName = () => {
    return settings?.paymentMode === '1' ? 'BSC Mainnet' : 'BSC Testnet';
  };

  const openTokenInExplorer = () => {
    const contract = String(settings?.usdtAddress || '').trim();
    if (!contract) return;
    const explorerUrl = settings?.paymentMode === '1'
      ? `https://bscscan.com/token/${contract}`
      : `https://testnet.bscscan.com/token/${contract}`;
    window.open(explorerUrl, '_blank');
  };

  const copyTokenContract = () => {
    const contract = String(settings?.usdtAddress || '').trim();
    if (!contract) return;
    navigator.clipboard.writeText(contract);
  };

  return (
      <div className="space-y-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 border border-green-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Coins className="w-5 h-5 mr-2 text-green-600" />
              Wallet Connected
            </h3>
            <div className="flex items-center space-x-2">
              <div className="flex items-center px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                <Shield className="w-3 h-3 mr-1" />
                {getNetworkName()}
              </div>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={!!refreshing}
                  className="flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-800 rounded-lg font-medium transition-all duration-200"
                  title="Refresh balances"
                >
                  <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              )}
              <button
                  onClick={onDisconnect}
                  className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105"
              >
                <LogOut className="w-4 h-4" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Wallet: {wallet.walletName}
              </label>
              <div className="flex items-center space-x-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 font-mono text-sm">
                  {wallet.address ? formatAddress(wallet.address) : ''}
                </code>
                <button
                    onClick={copyAddress}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors border border-gray-200"
                    title="Copy address"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                    onClick={openInExplorer}
                    className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors border border-blue-200"
                    title="View on BSCScan"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  BNB Balance
                </label>
                <div className="px-3 py-2 bg-gradient-to-r from-yellow-50 to-orange-50 text-gray-900 rounded border border-yellow-200 font-semibold">
                  {parseFloat(wallet.balance).toFixed(4)} BNB
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  USDT Balance (BEP-20)
                </label>
                <div className="px-3 py-2 bg-gradient-to-r from-green-50 to-emerald-50 text-gray-900 rounded border border-green-200 font-semibold">
                  {parseFloat(wallet.usdtBalance).toFixed(2)} USDT
                </div>
                {!!String(settings?.usdtAddress || '').trim() && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-medium">USDT Contract:</span>
                    <code className="px-2 py-1 bg-gray-50 rounded border border-gray-200 font-mono">
                      {formatContract(String(settings?.usdtAddress || '').trim())}
                    </code>
                    <button
                      onClick={copyTokenContract}
                      className="p-1 bg-gray-100 hover:bg-gray-200 rounded border border-gray-200"
                      title="Copy contract address"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={openTokenInExplorer}
                      className="p-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded border border-blue-200"
                      title="View token on explorer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {wallet.warning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800">
                  Wallet connected, but balance sync is unavailable.
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  {wallet.warning}
                </p>
              </div>
            )}

            {/* Connection Status Indicator */}
            <div className={`${wallet.warning ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'} border rounded-lg p-3`}>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${wallet.warning ? 'bg-amber-400' : 'bg-green-400'}`}></div>
                <span className={`text-sm font-medium ${wallet.warning ? 'text-amber-800' : 'text-green-800'}`}>
                {wallet.warning ? 'Connected, but RPC needs attention' : `Connected to ${getNetworkName()}`}
              </span>
              </div>
              <p className={`text-xs mt-1 ${wallet.warning ? 'text-amber-700' : 'text-green-600'}`}>
                Chain ID: {wallet.chainId || 'Unknown'} • Ready for transactions
              </p>
            </div>
          </div>
        </div>
      </div>
  );
};
