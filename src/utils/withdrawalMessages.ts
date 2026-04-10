export const getCustomerFriendlyWithdrawalMessage = (reason?: string | null) => {
  if (!reason) return null;

  const normalizedReason = String(reason).toLowerCase();

  if (
    normalizedReason.includes('execution reverted') ||
    normalizedReason.includes('call_exception') ||
    normalizedReason.includes('estimategas') ||
    normalizedReason.includes('revert')
  ) {
    return 'This withdrawal could not be completed because the on-chain transfer was reverted. Please confirm your destination wallet address and network, then try again or contact support.';
  }

  if (normalizedReason.includes('insufficient') && normalizedReason.includes('balance')) {
    return 'This withdrawal could not be completed because the payout wallet has insufficient balance. Please try again later or contact support.';
  }

  if (normalizedReason.includes('wallet') || normalizedReason.includes('address')) {
    return 'This withdrawal could not be completed due to a wallet verification issue. Please review your default wallet or contact support.';
  }

  if (
    normalizedReason.includes('network') ||
    normalizedReason.includes('timeout') ||
    normalizedReason.includes('rpc') ||
    normalizedReason.includes('blockchain') ||
    normalizedReason.includes('transfer')
  ) {
    return 'This withdrawal could not be completed because of a temporary processing issue. Please try again later or contact support.';
  }

  if (normalizedReason.includes('reject')) {
    return 'This withdrawal request was not approved. Please contact support if you need more details.';
  }

  return 'This withdrawal could not be completed. Please contact support if you need more details.';
};

export const formatWithdrawalFailureShort = (reason?: string | null) => {
  if (!reason) return null;
  const normalized = String(reason).toLowerCase();

  if (
    normalized.includes('execution reverted') ||
    normalized.includes('call_exception') ||
    normalized.includes('estimategas') ||
    normalized.includes('revert')
  ) {
    return 'On-chain transfer reverted';
  }

  if (normalized.includes('insufficient') && normalized.includes('balance')) {
    return 'Insufficient payout balance';
  }

  if (normalized.includes('wallet') || normalized.includes('address')) {
    return 'Wallet verification issue';
  }

  if (normalized.includes('timeout') || normalized.includes('network') || normalized.includes('rpc')) {
    return 'Network/RPC issue';
  }

  return 'Processing error';
};

