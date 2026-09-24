export interface WithdrawalJoiningRule {
  enabled: boolean;
  from_date: string;
  required_count: number;
  plan_amounts: number[];
}

export interface WithdrawalJoiningRules {
  launch: WithdrawalJoiningRule;
  autopool: WithdrawalJoiningRule;
}

export const defaultWithdrawalJoiningRules: WithdrawalJoiningRules = {
  launch: { enabled: true, from_date: '2026-09-25', required_count: 1, plan_amounts: [50, 100, 200] },
  autopool: { enabled: true, from_date: '2026-09-25', required_count: 1, plan_amounts: [20] },
};

export interface WithdrawalJoiningStatus {
  eligible: boolean;
  enabled: boolean;
  qualified_count: number;
  required_count: number;
  remaining_count: number;
  from_date: string;
  plan_amounts: number[];
  category: string;
  message: string;
}
