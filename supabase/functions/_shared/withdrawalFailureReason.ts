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

const stripHexBlobs = (value: string) =>
  value.replace(/0x[a-f0-9]{16,}/gi, '0x…').replace(/\s+/g, ' ').trim();

export const formatWithdrawalAdminDebug = (error: any) => {
  if (!error) return '';

  const rawMessage = String(error?.message || error || '').trim();
  const pieces: string[] = [];

  if (error?.code) pieces.push(`code=${String(error.code)}`);
  if (error?.action) pieces.push(`action=${String(error.action)}`);
  if (error?.shortMessage) pieces.push(`short=${String(error.shortMessage)}`);
  if (error?.reason) pieces.push(`reason=${String(error.reason)}`);

  const base = stripHexBlobs(rawMessage);
  const meta = pieces.length ? ` (${stripHexBlobs(pieces.join(', '))})` : '';
  let oneLine = `${base}${meta}`.trim();
  if (!oneLine) oneLine = stripHexBlobs(String(error));

  // Also keep a small JSON snapshot for debugging in the details popup.
  const snapshot: Record<string, any> = {};
  for (const key of ['code', 'action', 'shortMessage', 'reason', 'message', 'data']) {
    if (error?.[key] !== undefined) snapshot[key] = error[key];
  }
  if (error?.transaction) {
    snapshot.transaction = {
      to: error.transaction.to,
      from: error.transaction.from,
      data: typeof error.transaction.data === 'string' ? stripHexBlobs(error.transaction.data) : error.transaction.data
    };
  }

  try {
    const json = JSON.stringify(snapshot);
    if (json && json !== '{}' && !oneLine.toLowerCase().includes('short=')) {
      oneLine = `${oneLine} | ${stripHexBlobs(json)}`;
    }
  } catch {
    // ignore
  }

  if (oneLine.length > 900) oneLine = `${oneLine.slice(0, 897)}...`;
  return oneLine;
};
