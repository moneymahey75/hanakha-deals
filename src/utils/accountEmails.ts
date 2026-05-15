import { supabase } from '../lib/supabase';

type AccountEmailPayload =
  | { type: 'welcome' }
  | {
      type: 'upgrade_payment';
      planName: string;
      amount: number;
      transactionHash?: string | null;
      reservedUsed?: number;
      network?: string;
    };

export const sendAccountEmail = async (payload: AccountEmailPayload) => {
  try {
    const { error } = await supabase.functions.invoke('send-account-email', {
      body: payload,
    });

    if (error) {
      console.warn('Account email send failed:', error);
    }
  } catch (error) {
    console.warn('Account email send unavailable:', error);
  }
};
