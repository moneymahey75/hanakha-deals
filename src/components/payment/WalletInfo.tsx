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
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center">
            <Coins className="w-5 h-5 mr-2" />
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
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Wallet: {wallet.walletName}
            </label>
            <div className="flex items-center space-x-2">
              <code className="flex-1 px-3 py-2 bg-black/30 text-white rounded border">
                {wallet.address ? formatAddress(wallet.address) : ''}
              </code>
              <button
                onClick={copyAddress}
                className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
                title="Copy address"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={openInExplorer}
                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                title="View on BSCScan"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                BNB Balance
              </label>
              <div className="px-3 py-2 bg-black/30 text-white rounded border">
                {parseFloat(wallet.balance).toFixed(4)} BNB
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                USDT Balance (BEP-20)
              </label>
              <div className="px-3 py-2 bg-black/30 text-white rounded border">
                {parseFloat(wallet.usdtBalance).toFixed(2)} USDT
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};