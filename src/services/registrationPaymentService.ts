import { supabase } from '../lib/supabase';
import { WalletService } from './walletService';

export interface RegistrationPaymentResult {
  success: boolean;
  transactionHash?: string;
  referralIncomeId?: string;
  error?: string;
}

export class RegistrationPaymentService {
  private static instance: RegistrationPaymentService;
  private walletService: WalletService;

  private constructor() {
    this.walletService = WalletService.getInstance();
  }

  public static getInstance(): RegistrationPaymentService {
    if (!RegistrationPaymentService.instance) {
      RegistrationPaymentService.instance = new RegistrationPaymentService();
    }
    return RegistrationPaymentService.instance;
  }

  public async getRegistrationPlan() {
    try {
      const { data, error } = await supabase
        .from('tbl_subscription_plans')
        .select('*')
        .eq('tsp_type', 'registration')
        .eq('tsp_is_active', true)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to fetch registration plan:', error);
      throw new Error('Failed to load registration plan');
    }
  }

  public async checkRegistrationStatus(userId: string) {
    try {
      const { data, error } = await supabase
        .from('tbl_users')
        .select('tu_registration_paid, tu_registration_paid_at, tu_registration_tx_hash')
        .eq('tu_id', userId)
        .single();

      if (error) throw error;

      return {
        isPaid: data?.tu_registration_paid || false,
        paidAt: data?.tu_registration_paid_at,
        transactionHash: data?.tu_registration_tx_hash
      };
    } catch (error) {
      console.error('Failed to check registration status:', error);
      return { isPaid: false, paidAt: null, transactionHash: null };
    }
  }

  public async processRegistrationPayment(
    userId: string,
    referrerId: string | null,
    adminWalletAddress: string
  ): Promise<RegistrationPaymentResult> {
    try {
      const registrationFee = 5;

      const currentState = this.walletService.getCurrentWalletState();
      if (!currentState.isConnected || !currentState.address) {
        return {
          success: false,
          error: 'Please connect your wallet first'
        };
      }

      const usdtBalance = parseFloat(currentState.usdtBalance);
      if (usdtBalance < registrationFee) {
        return {
          success: false,
          error: `Insufficient USDT balance. Required: ${registrationFee} USDT, Available: ${usdtBalance.toFixed(2)} USDT`
        };
      }

      console.log(`Processing registration payment: $${registrationFee} to ${adminWalletAddress}`);

      const txResult = await this.walletService.sendUSDTToWallet(
        adminWalletAddress,
        registrationFee
      );

      if (!txResult.success || !txResult.hash) {
        return {
          success: false,
          error: txResult.error || 'Transaction failed'
        };
      }

      console.log(`Payment transaction successful: ${txResult.hash}`);

      const { data: processResult, error: processError } = await supabase
        .rpc('process_registration_payment', {
          p_user_id: userId,
          p_transaction_hash: txResult.hash,
          p_referrer_id: referrerId
        });

      if (processError) {
        console.error('Failed to process registration in database:', processError);
        return {
          success: false,
          error: 'Payment sent but failed to update registration status. Please contact support.'
        };
      }

      if (!processResult?.success) {
        return {
          success: false,
          error: processResult?.error || 'Failed to process registration'
        };
      }

      return {
        success: true,
        transactionHash: txResult.hash,
        referralIncomeId: processResult.referral_income_id
      };
    } catch (error: any) {
      console.error('Registration payment error:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred'
      };
    }
  }

  public async getUserReferralIncome(userId: string) {
    try {
      const { data, error } = await supabase
        .from('tbl_referral_income')
        .select(`
          tri_id,
          tri_amount,
          tri_payment_status,
          tri_transaction_hash,
          tri_created_at,
          tri_paid_at,
          tri_referred_user_id,
          referred_user:tbl_users!tri_referred_user_id (
            tu_email,
            profile:tbl_user_profiles (
              tup_first_name,
              tup_last_name
            )
          )
        `)
        .eq('tri_referrer_id', userId)
        .order('tri_created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch referral income:', error);
      return [];
    }
  }

  public async getTotalReferralEarnings(userId: string) {
    try {
      const { data, error } = await supabase
        .from('tbl_referral_income')
        .select('tri_amount, tri_payment_status')
        .eq('tri_referrer_id', userId);

      if (error) throw error;

      const total = data?.reduce((sum, item) => sum + parseFloat(item.tri_amount), 0) || 0;
      const paid = data?.filter(item => item.tri_payment_status === 'completed')
        .reduce((sum, item) => sum + parseFloat(item.tri_amount), 0) || 0;
      const pending = data?.filter(item => item.tri_payment_status === 'pending')
        .reduce((sum, item) => sum + parseFloat(item.tri_amount), 0) || 0;

      return {
        total,
        paid,
        pending,
        count: data?.length || 0
      };
    } catch (error) {
      console.error('Failed to calculate referral earnings:', error);
      return { total: 0, paid: 0, pending: 0, count: 0 };
    }
  }
}

export default RegistrationPaymentService;
