export interface WalletInfo {
    name: string;
    icon: string;
    isInstalled: boolean;
    provider?: any;
}

export interface WalletState {
    isConnected: boolean;
    address: string | null;
    chainId: number | null;
    balance: string;
    usdtBalance: string;
    walletName: string | null;
}

export interface TransactionState {
    isProcessing: boolean;
    hash: string | null;
    status: 'idle' | 'pending' | 'success' | 'error';
    error: string | null;
    distributionSteps?: string[];
}