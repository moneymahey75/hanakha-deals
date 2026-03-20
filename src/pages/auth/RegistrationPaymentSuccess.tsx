import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, ExternalLink, Home } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PaymentDetails {
  tp_amount: number | null;
  tp_currency: string | null;
  tp_payment_status: string | null;
  tp_transaction_id: string | null;
  tp_network?: string | null;
  tp_created_at?: string | null;
}

const RegistrationPaymentSuccess: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const state = location.state as { txHash?: string; amount?: number; network?: string } | null;
  const txHash = state?.txHash || new URLSearchParams(location.search).get('tx');

  useEffect(() => {
    const loadPayment = async () => {
      if (!user || !txHash) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('tbl_payments')
          .select('tp_amount, tp_currency, tp_payment_status, tp_transaction_id, tp_network, tp_created_at')
          .eq('tp_user_id', user.id)
          .eq('tp_transaction_id', txHash)
          .maybeSingle();

        if (data) {
          setPayment(data);
        }
      } catch (error) {
        console.error('Failed to load payment details:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPayment();
  }, [user, txHash]);

  const openExplorer = () => {
    if (!txHash) return;
    const isMainnet = (payment?.tp_network || state?.network) === 'BSC Mainnet';
    const explorerUrl = isMainnet
      ? `https://bscscan.com/tx/${txHash}`
      : `https://testnet.bscscan.com/tx/${txHash}`;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Successful</h1>
          <p className="text-gray-600">Your registration payment has been confirmed.</p>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between text-gray-700">
            <span>Amount</span>
            <span className="font-medium">
              {payment?.tp_amount ?? state?.amount ?? '5'} {payment?.tp_currency ?? 'USDT'}
            </span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Network</span>
            <span className="font-medium">{payment?.tp_network ?? state?.network ?? 'BSC'}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>Status</span>
            <span className="font-medium capitalize">{payment?.tp_payment_status ?? 'completed'}</span>
          </div>
          {txHash && (
            <div>
              <p className="text-sm text-gray-500 mb-2">Transaction Hash</p>
              <div className="flex items-center space-x-2">
                <code className="flex-1 px-3 py-2 bg-gray-50 text-gray-900 rounded border border-gray-200 font-mono text-sm">
                  {txHash}
                </code>
                <button
                  onClick={openExplorer}
                  className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors border border-blue-200"
                  title="View on explorer"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/customer/dashboard')}
          className="mt-8 w-full flex items-center justify-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
        >
          <Home className="w-5 h-5" />
          <span>Go to Dashboard</span>
        </button>
      </div>
    </div>
  );
};

export default RegistrationPaymentSuccess;
