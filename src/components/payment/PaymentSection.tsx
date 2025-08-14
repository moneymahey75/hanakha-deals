import React from 'react';
import { TransactionState } from '../types/wallet';
import { CreditCard, CheckCircle, XCircle, Loader, ExternalLink, Users } from 'lucide-react';

interface PaymentSectionProps {
  onPayment: () => void;
  transaction: TransactionState;
  distributionSteps?: string[];
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({
  onPayment,
  transaction,
  distributionSteps = [],
}) => {
  const openTransaction = () => {
    if (transaction.hash) {
      window.open(`https://testnet.bscscan.com/tx/${transaction.hash}`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <CreditCard className="w-5 h-5 mr-2" />
          USDT Distribution Payment
        </h3>

        <div className="space-y-4 mb-6">
          <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
            <h4 className="font-medium text-blue-400 mb-2 flex items-center">
              <Users className="w-4 h-4 mr-2" />
              Distribution Details
            </h4>
            <div className="text-blue-300 text-sm space-y-1">
              <p>• Recipient 1: 0xF52F...9444 → 0.05 USDT</p>
              <p>• Recipient 2: 0x73D5...894E → 0.10 USDT</p>
              <p>• Recipient 3: 0x323E...ADB3 → 0.15 USDT</p>
              <p className="font-medium mt-2">Total: 0.30 USDT</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Distribution Contract Address
            </label>
            <code className="block px-3 py-2 bg-black/30 text-white rounded border text-sm">
              0x337efE1be3dA9Bb3Aa6D6d90f8A0CD9e1c4C9641
            </code>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              USDT Token Address (BEP-20)
            </label>
            <code className="block px-3 py-2 bg-black/30 text-white rounded border text-sm">
              0x71BB0Ce80bE4993BD386Df84463B1be2c2Aaf41F
            </code>
          </div>
        </div>

        <button
          onClick={onPayment}
          disabled={transaction.isProcessing}
          className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-lg font-medium transition-all duration-200 hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
        >
          {transaction.isProcessing ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <CreditCard className="w-5 h-5" />
          )}
          <span>
            {transaction.isProcessing ? 'Processing Distribution...' : 'Approve & Distribute 0.30 USDT'}
          </span>
        </button>
      </div>

      {/* Transaction Status */}
      {transaction.status !== 'idle' && (
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
          <h3 className="text-lg font-semibold text-white mb-4">Distribution Status</h3>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              {transaction.status === 'pending' && (
                <Loader className="w-6 h-6 text-yellow-400 animate-spin" />
              )}
              {transaction.status === 'success' && (
                <CheckCircle className="w-6 h-6 text-green-400" />
              )}
              {transaction.status === 'error' && (
                <XCircle className="w-6 h-6 text-red-400" />
              )}
              
              <span className={`font-medium ${
                transaction.status === 'pending' ? 'text-yellow-400' :
                transaction.status === 'success' ? 'text-green-400' :
                'text-red-400'
              }`}>
                {transaction.status === 'pending' && 'Distribution Pending'}
                {transaction.status === 'success' && 'Distribution Successful!'}
                {transaction.status === 'error' && 'Distribution Failed'}
              </span>
            </div>

            {/* Distribution Steps */}
            {distributionSteps.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Distribution Process
                </label>
                <div className="bg-black/30 rounded border p-3 max-h-60 overflow-y-auto">
                  {distributionSteps.map((step, index) => (
                    <div key={index} className="text-xs text-gray-300 font-mono mb-1">
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {transaction.hash && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Transaction Hash
                </label>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 px-3 py-2 bg-black/30 text-white rounded border text-sm">
                    {transaction.hash}
                  </code>
                  <button
                    onClick={openTransaction}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                    title="View on BSCScan"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {transaction.error && (
              <div className="p-4 bg-red-900/30 border border-red-500/30 rounded-lg">
                <h4 className="font-medium text-red-400 mb-2">Error Details</h4>
                <p className="text-red-300 text-sm">{transaction.error}</p>
              </div>
            )}

            {transaction.status === 'success' && (
              <div className="p-4 bg-green-900/30 border border-green-500/30 rounded-lg">
                <h4 className="font-medium text-green-400 mb-2">Distribution Confirmed</h4>
                <p className="text-green-300 text-sm">
                  Your distribution of 30 USDT has been successfully processed to 3 recipients through the smart contract.
                  The transaction has been recorded on the BNB Smart Chain testnet and all recipients have received their allocated amounts.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};