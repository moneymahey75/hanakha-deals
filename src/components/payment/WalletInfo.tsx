import React from 'react';
import { WalletState } from '../types/wallet';
import { Copy, ExternalLink, LogOut, Coins } from 'lucide-react';
import toast from 'react-hot-toast';

interface WalletInfoProps {
  wallet: WalletState;
  onDisconnect: () => void;
}

export const WalletInfo: React.FC<WalletInfoProps> = ({ wallet, onDisconnect }) => {
  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      toast.success('Address copied to clipboard');
    }
  };

  const openInExplorer = () => {
    if (wallet.address) {
      window.open(`https://testnet.bscscan.com/address/${wallet.address}`, '_blank');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 border border-green-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Coins className="w-5 h-5 mr-2 text-green-600" />
            Wallet Connected
          </h3>
          <button
            onClick={onDisconnect}
            className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect</span>
          </button>
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
            </div>
          </div>

          {/* Connection Status Indicator */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-800">
                Connected to BNB Smart Chain Testnet
              </span>
            </div>
            <p className="text-xs text-green-600 mt-1">
              Chain ID: {wallet.chainId || 'Unknown'} • Ready for transactions
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};