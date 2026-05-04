import { ethers } from 'ethers';
import { WalletInfo, WalletState } from '../types/wallet';

const WALLET_STATE_STORAGE_KEY = 'registration_payment_wallet_state';

// BSC Network Configurations
const BSC_TESTNET_CONFIG = {
  chainId: '0x61', // 97 in decimal
  chainName: 'BSC Testnet',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: [
    'https://data-seed-prebsc-1-s1.binance.org:8545/',
    'https://data-seed-prebsc-2-s1.binance.org:8545/'
  ],
  blockExplorerUrls: ['https://testnet.bscscan.com/'],
};

const BSC_MAINNET_CONFIG = {
  chainId: '0x38', // 56 in decimal
  chainName: 'BSC Mainnet',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: ['https://bsc-dataseed1.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
};

// Contract ABIs
const USDT_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const DISTRIBUTION_ABI = [
  'function distributePayment(address[] recipients, uint256[] amounts, uint256 totalAmount) external',
  'function validateDistribution(address[] recipients, uint256[] amounts, uint256 totalAmount) view returns (bool)',
  'event PaymentDistributed(address indexed sender, uint256 totalAmount, uint256 recipientCount)'
];

// Admin Settings Interface
interface AdminSettings {
  paymentMode: string | number | boolean;
  usdtAddress: string;
  subscriptionContractAddress: string;
  subscriptionWalletAddress: string;
}

// Wallet Service Class
export class WalletService {
  private static instance: WalletService;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;
  private externalProvider: any | null = null;
  private isConnecting: boolean = false;
  private adminSettings: AdminSettings | null = null;
  // FIX: Store the current wallet state internally to restore on re-render
  private currentWalletState: WalletState = {
    isConnected: false,
    address: null,
    chainId: null,
    balance: '0',
    usdtBalance: '0',
    walletName: null,
    warning: null,
  };

  // Singleton pattern
  static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  // Private constructor to enforce singleton
  private constructor() {
    console.log('WalletService instance created');
    if (typeof window !== 'undefined') {
      try {
        const persistedState = sessionStorage.getItem(WALLET_STATE_STORAGE_KEY);
        if (persistedState) {
          this.currentWalletState = JSON.parse(persistedState) as WalletState;
        }
      } catch (error) {
        console.warn('Failed to restore persisted wallet state:', error);
      }
    }
  }

  private persistCurrentWalletState(): void {
    if (typeof window === 'undefined') return;

    try {
      if (this.currentWalletState.isConnected) {
        sessionStorage.setItem(WALLET_STATE_STORAGE_KEY, JSON.stringify(this.currentWalletState));
      } else {
        sessionStorage.removeItem(WALLET_STATE_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Failed to persist wallet state:', error);
    }
  }

  // Method to set admin settings from context
  setAdminSettings(settings: AdminSettings): void {
    this.adminSettings = settings;
    const isLive = this.isLivePaymentMode(settings.paymentMode);
    console.log('Admin settings configured:', {
      paymentMode: settings.paymentMode,
      network: isLive ? 'BSC Mainnet' : 'BSC Testnet',
      usdtAddress: settings.usdtAddress?.substring(0, 10) + '...',
      subscriptionContract: settings.subscriptionContractAddress?.substring(0, 10) + '...',
      subscriptionWallet: settings.subscriptionWalletAddress?.substring(0, 10) + '...'
    });
  }

  // Get admin settings (for debugging)
  getAdminSettings(): AdminSettings | null {
    return this.adminSettings;
  }

  // FIX: New method to retrieve the current wallet state
  getCurrentWalletState(): WalletState {
    return this.currentWalletState;
  }

  // Get network config based on payment mode
  private getNetworkConfig() {
    const isLive = this.isLivePaymentMode(this.adminSettings?.paymentMode);
    return isLive ? BSC_MAINNET_CONFIG : BSC_TESTNET_CONFIG;
  }

  private isLivePaymentMode(paymentMode: AdminSettings['paymentMode'] | undefined | null): boolean {
    return paymentMode === true || paymentMode === 1 || paymentMode === '1' || paymentMode === 'true';
  }

  private getExpectedChainId(): number {
    const chainIdHex = this.getNetworkConfig().chainId;
    return Number.parseInt(chainIdHex, 16);
  }

  private async assertCorrectNetwork(): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const network = await this.provider.getNetwork();
    const currentChainId = Number(network.chainId);
    const expectedChainId = this.getExpectedChainId();

    if (currentChainId !== expectedChainId) {
      const expectedName = this.getNetworkConfig().chainName;
      throw new Error(`Wrong network selected in wallet. Expected ${expectedName} (chainId ${expectedChainId}), but wallet is on chainId ${currentChainId}. Please switch network and try again.`);
    }
  }

  private buildRpcUnavailableMessage(): string {
    const networkConfig = this.getNetworkConfig();
    return `${networkConfig.chainName} RPC is not responding in your wallet. Please update the network RPC URL in MetaMask and reconnect.`;
  }

  private isRpcFetchError(error: any): boolean {
    const message = String(error?.message || error?.error?.message || '').toLowerCase();
    const nestedMessage = String(error?.data?.cause?.message || '').toLowerCase();
    return (
      message.includes('failed to fetch') ||
      nestedMessage.includes('failed to fetch') ||
      (error?.code === -32603 && (message.includes('fetch') || nestedMessage.includes('fetch')))
    );
  }

  // Get USDT contract address from settings
  private getUSDTContractAddress(): string {
    if (!this.adminSettings?.usdtAddress) {
      throw new Error('USDT contract address is not configured');
    }
    return this.adminSettings.usdtAddress;
  }

  // Get distribution contract address from settings
  private getDistributionContractAddress(): string {
    if (!this.adminSettings?.subscriptionContractAddress) {
      console.warn('Subscription contract address not configured, using fallback');
      return '0x337efE1be3dA9Bb3Aa6D6d90f8A0CD9e1c4C9641'; // Fallback contract
    }
    return this.adminSettings.subscriptionContractAddress;
  }

  // Get subscription wallet address from settings
  private getSubscriptionWalletAddress(): string {
    if (!this.adminSettings?.subscriptionWalletAddress) {
      console.warn('Subscription wallet address not configured, using fallback');
      return '0xF52F981daFb26Dc2ce86e48FBF6FBc2e35CD9444'; // Fallback wallet
    }
    return this.adminSettings.subscriptionWalletAddress;
  }

  // Detect available wallets
  detectWallets(): WalletInfo[] {
    const wallets: WalletInfo[] = [];

    if (typeof window === 'undefined') {
      console.warn('Window is undefined, cannot detect wallets');
      return wallets;
    }

    // MetaMask
    if (window.ethereum?.isMetaMask) {
      wallets.push({
        name: 'MetaMask',
        icon: '🦊',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    // Trust Wallet
    if (window.ethereum?.isTrust) {
      wallets.push({
        name: 'Trust Wallet',
        icon: '🔷',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    // SafePal
    if (window.ethereum?.isSafePal) {
      wallets.push({
        name: 'SafePal',
        icon: '🛡️',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    // Binance Chain Wallet
    if (window.BinanceChain) {
      wallets.push({
        name: 'Binance Chain Wallet',
        icon: '🟡',
        isInstalled: true,
        provider: window.BinanceChain,
      });
    }

    // Generic Web3 wallet (if no specific wallet detected but ethereum exists)
    if (window.ethereum && wallets.length === 0) {
      wallets.push({
        name: 'Web3 Wallet',
        icon: '🔗',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    console.log(`Detected ${wallets.length} wallet(s):`, wallets.map(w => w.name));
    return wallets;
  }

  // Connect to wallet
  async connectWallet(walletProvider: any): Promise<WalletState> {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting) {
      throw new Error('Connection already in progress. Please wait...');
    }

    this.isConnecting = true;
    console.log('Connecting to wallet...');

    try {
      // Add delay to prevent rapid successive requests
      await new Promise(resolve => setTimeout(resolve, 100));

      // Initialize provider
      this.externalProvider = walletProvider;
      this.provider = new ethers.BrowserProvider(walletProvider);

      // Request account access
      console.log('Requesting account access...');
      // FIX: Ensure eth_requestAccounts is called first to trigger connection
      let accounts = await walletProvider.request({ method: 'eth_accounts' });

      if (accounts.length === 0) {
        // If not connected, request connection
        accounts = await walletProvider.request({ method: 'eth_requestAccounts' });
      }

      if (accounts.length === 0) {
        throw new Error('No accounts returned by wallet. Connection failed.');
      }

      // Switch to correct network
      console.log('Switching to correct network...');
      await this.switchToCorrectNetwork(walletProvider);

      // Recreate the provider after a chain switch so subsequent reads use the active network.
      await new Promise(resolve => setTimeout(resolve, 150));
      this.provider = new ethers.BrowserProvider(walletProvider);

      // Get signer and address
      this.signer = await this.provider.getSigner();
      const address = await this.signer.getAddress();
      const network = await this.provider.getNetwork();

      console.log('Getting balances...');
      const [bnbBalanceResult, usdtBalanceResult] = await Promise.allSettled([
        this.readBNBBalance(address),
        this.readUSDTBalance(address)
      ]);

      const balance = bnbBalanceResult.status === 'fulfilled' ? bnbBalanceResult.value : '0.00';
      const usdtBalance = usdtBalanceResult.status === 'fulfilled' ? usdtBalanceResult.value : '0.00';
      const hasRpcWarning =
        (bnbBalanceResult.status === 'rejected' && this.isRpcFetchError(bnbBalanceResult.reason)) ||
        (usdtBalanceResult.status === 'rejected' && this.isRpcFetchError(usdtBalanceResult.reason));
      const warning = hasRpcWarning ? this.buildRpcUnavailableMessage() : null;

      const newWalletState: WalletState = {
        isConnected: true,
        address,
        chainId: Number(network.chainId),
        balance,
        usdtBalance,
        walletName: this.getWalletName(walletProvider),
        warning,
      };

      this.currentWalletState = newWalletState; // Update internal state
      this.persistCurrentWalletState();

      console.log('Wallet connected successfully:', {
        address: address.substring(0, 10) + '...',
        network: Number(network.chainId),
        balance: balance.substring(0, 8),
        usdtBalance: usdtBalance.substring(0, 8),
        warning,
      });

      return newWalletState;

    } catch (error: any) {
      console.error('Wallet connection failed:', error);

      // Handle specific errors with better messaging
      if (error.code === -32002) {
        throw new Error('Wallet is busy. Please open your wallet, reject any pending requests, and try again.');
      } else if (error.code === 4001) {
        throw new Error('Connection cancelled by user');
      } else if (error.message?.includes('already pending')) {
        throw new Error('Please check your wallet for pending requests. Close and reopen it if needed.');
      } else if (error.message?.includes('Admin settings not configured')) {
        throw error; // Re-throw admin settings error as-is
      }

      // Ensure internal state is cleared on failure
      this.provider = null;
      this.signer = null;
      this.externalProvider = null;
      this.currentWalletState = { isConnected: false, address: null, chainId: null, balance: '0', usdtBalance: '0', walletName: null, warning: null };
      this.persistCurrentWalletState();


      throw new Error(`Connection failed: ${error.message}`);
    } finally {
      this.isConnecting = false;
    }
  }

  // Switch to correct network based on payment mode
  async switchToCorrectNetwork(provider: any): Promise<void> {
    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      const networkConfig = this.getNetworkConfig();
      console.log(`Switching to ${networkConfig.chainName}...`);

      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: networkConfig.chainId }],
      });

      console.log(`Successfully switched to ${networkConfig.chainName}`);

    } catch (switchError: any) {
      console.log('Network switch failed, attempting to add network:', switchError.code);

      // Chain not added, try to add it
      if (switchError.code === 4902) {
        await new Promise(resolve => setTimeout(resolve, 100));

        const networkConfig = this.getNetworkConfig();
        console.log(`Adding ${networkConfig.chainName} to wallet...`);

        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [networkConfig],
        });

        console.log(`Successfully added ${networkConfig.chainName}`);

      } else if (switchError.code === -32002) {
        throw new Error('MetaMask is busy. Please check for pending requests and try again.');
      } else if (switchError.code === 4001) {
        throw new Error('Network switch cancelled by user');
      } else {
        throw new Error(`Failed to switch network: ${switchError.message}`);
      }
    }
  }

  // Get BNB balance
  private async readBNBBalance(address: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  async getBNBBalance(address: string): Promise<string> {
    try {
      return await this.readBNBBalance(address);
    } catch (error) {
      console.error('Error fetching BNB balance:', error);
      return '0.00';
    }
  }

  // Get USDT balance
  private async readUSDTBalance(address: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const usdtContractAddress = this.getUSDTContractAddress();
    console.log('Fetching USDT balance from:', usdtContractAddress);

    const contract = new ethers.Contract(usdtContractAddress, USDT_ABI, this.provider);
    const balance = await contract.balanceOf(address);
    const decimals = await contract.decimals();

    const formattedBalance = ethers.formatUnits(balance, decimals);
    console.log('USDT balance:', formattedBalance);

    return formattedBalance;
  }

  async getUSDTBalance(address: string): Promise<string> {
    try {
      return await this.readUSDTBalance(address);
    } catch (error: any) {
      console.error('❌ Critical Error fetching USDT balance:', error);

      if (error.code === 'CALL_EXCEPTION') {
        console.error('The USDT contract call failed. Check if wallet is on the correct network and if the USDT address is correct.');
      }

      return '0.00';
    }
  }

  // Execute USDT distribution
  async executeUSDTDistribution(planPrice: number): Promise<{ hash: string; steps: string[] }> {
    if (!this.signer || !this.provider) {
      throw new Error('Wallet not connected');
    }

    if (!this.adminSettings) {
      throw new Error('Admin settings not configured');
    }

    const steps: string[] = [];
    const signerAddress = await this.signer.getAddress();

    console.log('Starting USDT distribution process...');
    await this.assertCorrectNetwork();

    // Use subscription wallet address from settings
    const recipients = [this.getSubscriptionWalletAddress()];
    const amounts = [ethers.parseUnits(planPrice.toString(), 18)];
    const totalAmount = ethers.parseUnits(planPrice.toString(), 18);

    // Get contract addresses
    const usdtContractAddress = this.getUSDTContractAddress();
    const distributionContractAddress = this.getDistributionContractAddress();

    console.log('Contract configuration:', {
      usdtContract: usdtContractAddress,
      distributionContract: distributionContractAddress,
      subscriptionWallet: recipients[0],
      planPrice: planPrice
    });

    // Initialize contracts
    const distributionContract = new ethers.Contract(distributionContractAddress, DISTRIBUTION_ABI, this.signer);
    const usdtContract = new ethers.Contract(usdtContractAddress, USDT_ABI, this.signer);

    steps.push("=== USDT Distribution Process Started ===");
    steps.push(`Network: ${this.isLivePaymentMode(this.adminSettings.paymentMode) ? 'BSC Mainnet' : 'BSC Testnet'}`);
    steps.push(`USDT Contract: ${usdtContractAddress}`);
    steps.push(`Distribution Contract: ${distributionContractAddress}`);
    steps.push(`Plan Price: ${planPrice} USDT`);
    steps.push(`Total Amount: ${ethers.formatUnits(totalAmount, 18)} USDT`);
    steps.push(`Subscription Wallet: ${recipients[0]}`);

    try {
      // Step 1: Check USDT balance
      steps.push("\n1. Checking USDT balance...");
      console.log('Checking USDT balance...');

      const balance = await usdtContract.balanceOf(signerAddress);
      const formattedBalance = ethers.formatUnits(balance, 18);
      steps.push(`USDT Balance: ${formattedBalance} USDT`);

      if (balance < totalAmount) {
        const errorMsg = `Insufficient USDT balance! Required: ${planPrice} USDT, Available: ${formattedBalance} USDT`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Step 2: Check current allowance
      steps.push("\n2. Checking current allowance...");
      console.log('Checking allowance...');

      const currentAllowance = await usdtContract.allowance(signerAddress, distributionContractAddress);
      const formattedAllowance = ethers.formatUnits(currentAllowance, 18);
      steps.push(`Current Allowance: ${formattedAllowance} USDT`);

      // Step 3: Approve USDT if needed
      if (currentAllowance < totalAmount) {
        steps.push("\n3. Approving USDT spending...");
        console.log('Approving USDT spending...');

        try {
          const approveTx = await usdtContract.approve(distributionContractAddress, totalAmount);
          steps.push(`Approve transaction: ${approveTx.hash}`);
          console.log('Approve transaction hash:', approveTx.hash);

          steps.push("Waiting for approval confirmation...");
          const approveReceipt = await approveTx.wait();
          console.log('Approval confirmed, gas used:', approveReceipt?.gasUsed?.toString());

          steps.push("✅ USDT approval successful!");
        } catch (approveError: any) {
          console.error('USDT approval failed:', approveError);
          throw new Error(`USDT approval failed: ${approveError.message}`);
        }
      } else {
        steps.push("\n3. ✅ Already have sufficient allowance");
        console.log('Sufficient allowance already exists');
      }

      // Step 4: Validate distribution (optional)
      steps.push("\n4. Validating distribution...");
      try {
        const isValid = await distributionContract.validateDistribution(recipients, amounts, totalAmount);
        steps.push(`Distribution valid: ${isValid}`);

        if (!isValid) {
          throw new Error("Distribution validation failed!");
        }
      } catch (validationError: any) {
        console.log('Validation check failed or method not available:', validationError.message);
        steps.push("⚠️ Validation check skipped (method may not exist)");
      }

      // Step 5: Execute distribution
      steps.push("\n5. Distributing payment...");
      console.log('Executing distribution...');

      try {
        const tx = await distributionContract.distributePayment(recipients, amounts, totalAmount, {
          gasLimit: 300000 // Increased gas limit for safety
        });

        steps.push(`Distribution transaction: ${tx.hash}`);
        steps.push("Waiting for confirmation...");
        console.log('Distribution transaction hash:', tx.hash);

        const receipt = await tx.wait();
        console.log('Distribution confirmed, gas used:', receipt?.gasUsed?.toString());

        steps.push("✅ Distribution completed successfully!");
        steps.push(`Gas used: ${receipt?.gasUsed?.toString() || 'N/A'}`);

        // Step 6: Show final status
        steps.push("\n=== Final Status ===");
        const finalBalance = await usdtContract.balanceOf(signerAddress);
        const finalFormattedBalance = ethers.formatUnits(finalBalance, 18);
        steps.push(`Remaining USDT Balance: ${finalFormattedBalance} USDT`);

        console.log('Distribution process completed successfully');
        return { hash: tx.hash, steps };

      } catch (distributionError: any) {
        console.error('Distribution failed:', distributionError);
        throw new Error(`Distribution failed: ${distributionError.message}`);
      }

    } catch (error: any) {
      console.error('Distribution process failed:', error);
      steps.push(`\n❌ Error: ${error.message}`);
      throw error;
    }
  }

  // Direct USDT transfer to admin wallet (registration payments)
  async sendUSDTTransfer(toAddress: string, amount: number): Promise<{ hash: string; steps: string[] }> {
    if (!this.signer || !this.provider) {
      throw new Error('Wallet not connected');
    }

    if (!this.adminSettings) {
      throw new Error('Admin settings not configured');
    }

    if (!ethers.isAddress(toAddress)) {
      throw new Error('Invalid recipient wallet address');
    }

    const steps: string[] = [];
    const signerAddress = await this.signer.getAddress();

    await this.assertCorrectNetwork();

    const usdtContractAddress = this.getUSDTContractAddress();
    const usdtContract = new ethers.Contract(usdtContractAddress, USDT_ABI, this.signer);

    steps.push("=== USDT Transfer Started ===");
    steps.push(`Network: ${this.isLivePaymentMode(this.adminSettings.paymentMode) ? 'BSC Mainnet' : 'BSC Testnet'}`);
    steps.push(`USDT Contract: ${usdtContractAddress}`);
    steps.push(`From: ${signerAddress}`);
    steps.push(`To: ${toAddress}`);

    try {
      // Step 1: Load token decimals
      steps.push("\n1. Reading token decimals...");
      const decimals = await usdtContract.decimals();

      const amountUnits = ethers.parseUnits(amount.toString(), decimals);
      steps.push(`Amount: ${amount} USDT`);

      // Step 2: Check USDT balance
      steps.push("\n2. Checking USDT balance...");
      const balance = await usdtContract.balanceOf(signerAddress);
      const formattedBalance = ethers.formatUnits(balance, decimals);
      steps.push(`USDT Balance: ${formattedBalance} USDT`);

      if (balance < amountUnits) {
        throw new Error(`Insufficient USDT balance. Required ${amount}, available ${formattedBalance}`);
      }

      // Step 3: Send transfer
      steps.push("\n3. Sending USDT transfer...");
      const tx = await usdtContract.transfer(toAddress, amountUnits);
      steps.push(`Transaction submitted: ${tx.hash}`);

      return { hash: tx.hash, steps };
    } catch (error: any) {
      console.error('USDT transfer failed:', error);
      steps.push(`\n❌ Error: ${error.message}`);
      throw error;
    }
  }

  async watchUSDTToken(): Promise<boolean> {
    if (!this.provider) {
      throw new Error('Wallet not connected');
    }

    if (!this.externalProvider?.request) {
      throw new Error('Your wallet does not support adding tokens automatically.');
    }

    await this.assertCorrectNetwork();

    const tokenAddress = this.getUSDTContractAddress();
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function decimals() view returns (uint8)', 'function symbol() view returns (string)'],
      this.provider
    );

    let decimals = 18;
    let symbol = 'USDT';

    try {
      decimals = Number(await tokenContract.decimals());
    } catch {
      // ignore (fallback to 18)
    }

    try {
      symbol = String(await tokenContract.symbol()) || 'USDT';
    } catch {
      // ignore (fallback to USDT)
    }

    const watchAssetParams = {
      type: 'ERC20',
      options: {
        address: tokenAddress,
        symbol,
        decimals
      }
    };

    let result;
    try {
      result = await this.externalProvider.request({
        method: 'wallet_watchAsset',
        params: watchAssetParams
      });
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      if (!message.includes('json') && !message.includes('object')) {
        throw error;
      }

      result = await this.externalProvider.request({
        method: 'wallet_watchAsset',
        params: JSON.stringify(watchAssetParams)
      });
    }

    return Boolean(result);
  }

  // Disconnect wallet
  disconnect(): void {
    console.log('Disconnecting wallet...');
    this.provider = null;
    this.signer = null;
    this.externalProvider = null;
    this.isConnecting = false;
    // Clear internal state on disconnect
    this.currentWalletState = { isConnected: false, address: null, chainId: null, balance: '0', usdtBalance: '0', walletName: null, warning: null };
    this.persistCurrentWalletState();
  }

  // Get wallet name from provider
  private getWalletName(provider: any): string {
    if (provider.isMetaMask) return 'MetaMask';
    if (provider.isTrust) return 'Trust Wallet';
    if (provider.isSafePal) return 'SafePal';
    if (provider.isBinanceChain || provider.isBinance) return 'Binance Chain Wallet';
    return 'Web3 Wallet';
  }

  // Utility method to check if wallet is connected
  isWalletConnected(): boolean {
    return this.provider !== null && this.signer !== null;
  }

  // Get current network info
  async getCurrentNetwork(): Promise<{ chainId: number; name: string } | null> {
    if (!this.provider) return null;

    try {
      const network = await this.provider.getNetwork();
      const networkConfig = this.getNetworkConfig();
      return {
        chainId: Number(network.chainId),
        name: networkConfig.chainName
      };
    } catch (error) {
      console.error('Error getting network info:', error);
      return null;
    }
  }

  // Refresh wallet balances
  async refreshBalances(address: string): Promise<{ bnb: string; usdt: string }> {
    const bnbBalance = await this.getBNBBalance(address);
    const usdtBalance = await this.getUSDTBalance(address);
    return { bnb: bnbBalance, usdt: usdtBalance };
  }

  // Refresh and persist the current wallet state balances (uses current admin settings / USDT contract).
  async syncCurrentWalletState(): Promise<WalletState> {
    if (!this.provider || !this.signer) {
      throw new Error('Wallet not connected');
    }

    const address = await this.signer.getAddress();
    const network = await this.provider.getNetwork();

    const [bnbBalanceResult, usdtBalanceResult] = await Promise.allSettled([
      this.readBNBBalance(address),
      this.readUSDTBalance(address)
    ]);

    const balance = bnbBalanceResult.status === 'fulfilled' ? bnbBalanceResult.value : this.currentWalletState.balance || '0.00';
    const usdtBalance = usdtBalanceResult.status === 'fulfilled' ? usdtBalanceResult.value : this.currentWalletState.usdtBalance || '0.00';
    const hasRpcWarning =
      (bnbBalanceResult.status === 'rejected' && this.isRpcFetchError(bnbBalanceResult.reason)) ||
      (usdtBalanceResult.status === 'rejected' && this.isRpcFetchError(usdtBalanceResult.reason));
    const warning = hasRpcWarning ? this.buildRpcUnavailableMessage() : null;

    const newWalletState: WalletState = {
      ...this.currentWalletState,
      isConnected: true,
      address,
      chainId: Number(network.chainId),
      balance,
      usdtBalance,
      warning
    };

    this.currentWalletState = newWalletState;
    this.persistCurrentWalletState();
    return newWalletState;
  }
}
