interface Window {
    ethereum?: {
        isMetaMask?: boolean;
        isTrust?: boolean;
        isSafePal?: boolean;
        request?: (args: { method: string; params?: any[] }) => Promise<any>;
    };
    turnstile?: {
        render: (
            container: string | HTMLElement,
            options: {
                sitekey: string;
                theme?: 'auto' | 'light' | 'dark';
                size?: 'normal' | 'flexible' | 'compact';
                callback?: (token: string) => void;
                'expired-callback'?: () => void;
                'error-callback'?: () => void;
            }
        ) => string;
        reset: (widgetId?: string) => void;
        remove: (widgetId: string) => void;
    };
}
