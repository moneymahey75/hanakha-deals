import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { RegistrationPaymentService } from '../../services/registrationPaymentService';
import { DollarSign, Users, Clock, CheckCircle, TrendingUp, Gift } from 'lucide-react';

interface ReferralIncome {
  tri_id: string;
  tri_amount: number;
  tri_payment_status: string;
  tri_transaction_hash: string | null;
  tri_created_at: string;
  tri_paid_at: string | null;
  referred_user: {
    tu_email: string;
    profile: {
      tup_first_name: string;
      tup_last_name: string;
    }[];
  };
}

const ReferralIncomeDashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [incomeRecords, setIncomeRecords] = useState<ReferralIncome[]>([]);
  const [earnings, setEarnings] = useState({
    total: 0,
    paid: 0,
    pending: 0,
    count: 0
  });

  const paymentService = RegistrationPaymentService.getInstance();

  useEffect(() => {
    loadReferralIncome();
  }, [user]);

  const loadReferralIncome = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [records, totals] = await Promise.all([
        paymentService.getUserReferralIncome(user.id),
        paymentService.getTotalReferralEarnings(user.id)
      ]);

      setIncomeRecords(records);
      setEarnings(totals);
    } catch (error) {
      console.error('Failed to load referral income:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center space-x-3 mb-4">
          <Gift className="h-8 w-8" />
          <h2 className="text-2xl font-bold">Referral Earnings</h2>
        </div>
        <p className="text-green-100 mb-6">
          Earn $2 USDT for every person who registers using your referral link!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Users className="h-5 w-5" />
              <span className="text-sm font-medium">Total Referrals</span>
            </div>
            <div className="text-3xl font-bold">{earnings.count}</div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingUp className="h-5 w-5" />
              <span className="text-sm font-medium">Total Earned</span>
            </div>
            <div className="text-3xl font-bold">${earnings.total.toFixed(2)}</div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Paid Out</span>
            </div>
            <div className="text-3xl font-bold text-green-200">${earnings.paid.toFixed(2)}</div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="h-5 w-5" />
              <span className="text-sm font-medium">Pending</span>
            </div>
            <div className="text-3xl font-bold text-yellow-200">${earnings.pending.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
          <DollarSign className="h-6 w-6 text-green-600" />
          <span>Referral Income History</span>
        </h3>

        {incomeRecords.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-gray-900 mb-2">No Referrals Yet</h4>
            <p className="text-gray-600">
              Share your referral link and earn $2 USDT for each person who registers!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Referred User</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Amount</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody>
                {incomeRecords.map((record) => {
                  const profile = record.referred_user?.profile?.[0];
                  const userName = profile
                    ? `${profile.tup_first_name} ${profile.tup_last_name}`
                    : record.referred_user?.tu_email || 'Unknown';

                  return (
                    <tr key={record.tri_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="bg-green-100 p-2 rounded-full">
                            <Users className="h-4 w-4 text-green-600" />
                          </div>
                          <span className="font-medium text-gray-900">{userName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-green-600">${record.tri_amount}</span>
                      </td>
                      <td className="py-3 px-4">
                        {record.tri_payment_status === 'completed' ? (
                          <span className="inline-flex items-center space-x-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                            <CheckCircle className="h-4 w-4" />
                            <span>Paid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                            <Clock className="h-4 w-4" />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {new Date(record.tri_created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReferralIncomeDashboard;
