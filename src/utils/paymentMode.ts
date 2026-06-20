export const isLivePaymentModeValue = (paymentMode: unknown): boolean => {
  const normalized = String(paymentMode ?? '').trim().toLowerCase();
  return (
    paymentMode === true ||
    paymentMode === 1 ||
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'live' ||
    normalized === 'mainnet'
  );
};

export const getPaymentNetworkName = (paymentMode: unknown): 'BSC Mainnet' | 'BSC Testnet' => (
  isLivePaymentModeValue(paymentMode) ? 'BSC Mainnet' : 'BSC Testnet'
);

export const getBscExplorerBaseUrl = (paymentMode: unknown): string => (
  isLivePaymentModeValue(paymentMode) ? 'https://bscscan.com' : 'https://testnet.bscscan.com'
);
