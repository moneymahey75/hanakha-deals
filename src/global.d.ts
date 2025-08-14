interface Window {
    ethereum?: {
        isMetaMask?: boolean;
        isTrust?: boolean;
        isSafePal?: boolean;
        request?: (args: { method: string; params?: any[] }) => Promise<any>;
    };
}