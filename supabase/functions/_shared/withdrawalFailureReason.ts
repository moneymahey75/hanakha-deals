export const formatWithdrawalFailureReason = (error: any) => {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return 'Withdrawal failed. Please try again later.';

  const lower = raw.toLowerCase();

  if (lower.includes('admin wallet has insufficient usdt balance')) {
    return 'Unable to process this withdrawal right now. Please contact support.';
  }

  if (lower.includes('admin wallet has insufficient gas')) {
    return 'Unable to process this withdrawal right now. Please contact support.';
  }

  if (
    lower.includes('transfer amount exceeds balance') ||
    (lower.includes('erc20') && lower.includes('exceeds') && lower.includes('balance'))
  ) {
    return 'Unable to process this withdrawal right now. Please contact support.';
  }

  if (
    lower.includes('execution reverted') ||
    lower.includes('call_exception') ||
    lower.includes('estimategas') ||
    lower.includes('revert')
  ) {
    return 'Unable to process this withdrawal right now. Please contact support.';
  }

  if (lower.includes('insufficient funds')) {
    return 'Unable to process this withdrawal right now. Please contact support.';
  }

  if (lower.includes('nonce')) {
    return 'On-chain transfer failed due to a nonce issue';
  }

  if (lower.includes('timeout') || lower.includes('network') || lower.includes('rpc')) {
    return 'Network/RPC error while sending transfer';
  }

  // Strip big hex blobs / tx payloads.
  let cleaned = raw.replace(/0x[a-f0-9]{16,}/gi, '0x…');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length > 180) cleaned = `${cleaned.slice(0, 177)}...`;
  return cleaned;
};
