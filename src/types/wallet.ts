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

export interface UserWallet {
    id: string;
    userId: string;
    balance: number;
    currency: string;
    walletAddress?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface WalletTransaction {
    id: string;
    walletId: string;
    userId: string;
    transactionType: 'credit' | 'debit' | 'transfer';
    amount: number;
    currency: string;
    description: string;
    referenceType?: 'task_reward' | 'coupon_share' | 'social_share' | 'admin_credit' | 'withdrawal' | 'deposit' | 'transfer';
    referenceId?: string;
    blockchainHash?: string;
    status: 'pending' | 'completed' | 'failed' | 'cancelled';
    createdAt: string;
}

export interface Coupon {
    id: string;
    createdBy: string;
    companyId?: string;
    title: string;
    description?: string;
    couponCode: string;
    discountType: 'percentage' | 'fixed_amount';
    discountValue: number;
    imageUrl?: string;
    termsConditions?: string;
    validFrom: string;
    validUntil: string;
    usageLimit: number;
    usedCount: number;
    shareRewardAmount: number;
    status: 'pending' | 'approved' | 'declined' | 'cancelled' | 'expired';
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface DailyTask {
    id: string;
    createdBy: string;
    taskType: 'coupon_share' | 'social_share' | 'video_share' | 'custom';
    title: string;
    description?: string;
    contentUrl?: string;
    couponId?: string;
    rewardAmount: number;
    maxCompletions: number;
    completedCount: number;
    targetPlatforms: string[];
    taskDate: string;
    expiresAt: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    couponInfo?: Coupon;
}

export interface UserTask {
    id: string;
    userId: string;
    taskId: string;
    completionStatus: 'assigned' | 'in_progress' | 'completed' | 'verified' | 'expired' | 'failed';
    shareUrl?: string;
    sharePlatform?: string;
    shareScreenshotUrl?: string;
    rewardAmount: number;
    rewardPaid: boolean;
    completedAt?: string;
    verifiedAt?: string;
    verifiedBy?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
    taskInfo?: DailyTask;
}

export interface SocialShare {
    id: string;
    userId: string;
    taskId?: string;
    couponId?: string;
    platform: 'facebook' | 'instagram' | 'twitter' | 'youtube' | 'linkedin' | 'tiktok';
    shareUrl: string;
    contentType: 'coupon' | 'video' | 'post' | 'story';
    screenshotUrl?: string;
    rewardAmount: number;
    status: 'pending' | 'verified' | 'rejected';
    verifiedBy?: string;
    verifiedAt?: string;
    createdAt: string;
}