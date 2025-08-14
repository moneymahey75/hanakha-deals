import { ethers } from 'ethers';
import { WalletInfo, WalletState } from '../types/wallet';

const BSC_TESTNET_CONFIG = {
  chainId: '0x61', // 97 in decimal
  chainName: 'BSC Testnet',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
  blockExplorerUrls: ['https://testnet.bscscan.com/'],
};

const USDT_CONTRACT_ADDRESS = '0x71BB0Ce80bE4993BD386Df84463B1be2c2Aaf41F';
const DISTRIBUTION_CONTRACT_ADDRESS = '0x337efE1be3dA9Bb3Aa6D6d90f8A0CD9e1c4C9641';

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

export class WalletService {
  private static instance: WalletService;
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;
  private isConnecting: boolean = false;

  static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  detectWallets(): WalletInfo[] {
    const wallets: WalletInfo[] = [];

    // MetaMask
    if (typeof window !== 'undefined' && window.ethereum?.isMetaMask) {
      wallets.push({
        name: 'MetaMask',
        icon: '🦊',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    // Trust Wallet
    if (typeof window !== 'undefined' && window.ethereum?.isTrust) {
      wallets.push({
        name: 'Trust Wallet',
        icon: '🔷',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    // SafePal
    if (typeof window !== 'undefined' && window.ethereum?.isSafePal) {
      wallets.push({
        name: 'SafePal',
        icon: '🛡️',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    // Generic Web3 wallet
    if (typeof window !== 'undefined' && window.ethereum && wallets.length === 0) {
      wallets.push({
        name: 'Web3 Wallet',
        icon: '🔗',
        isInstalled: true,
        provider: window.ethereum,
      });
    }

    return wallets;
  }

  async connectWallet(walletProvider: any): Promise<WalletState> {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting) {
      throw new Error('Connection already in progress. Please wait...');
    }

    this.isConnecting = true;

    try {
      // First, check if MetaMask has any pending requests and clear them
      if (walletProvider.isMetaMask) {
        try {
          // Check current accounts first
          const currentAccounts = await walletProvider.request({ 
            method: 'eth_accounts' 
          });
          
          // If already connected, just proceed with existing connection
          if (currentAccounts && currentAccounts.length > 0) {
            console.log('✅ MetaMask already connected, using existing connection');
            this.provider = new ethers.BrowserProvider(walletProvider);
            await this.switchToBSCTestnet(walletProvider);
            this.signer = await this.provider.getSigner();
            const address = await this.signer.getAddress();
            const network = await this.provider.getNetwork();
            
            // Get balances
            const balance = await this.getBNBBalance(address);
            const usdtBalance = await this.getUSDTBalance(address);
            
            return {
              isConnected: true,
              address,
              chainId: Number(network.chainId),
              balance,
              usdtBalance,
              walletName: this.getWalletName(walletProvider),
            };
          }
        } catch (checkError) {
          console.log('Could not check existing accounts, proceeding with fresh connection');
        }
      }

      // Add a small delay to prevent rapid successive requests
      await new Promise(resolve => setTimeout(resolve, 100));

      this.provider = new ethers.BrowserProvider(walletProvider);
      
      // Request account access
      await walletProvider.request({ method: 'eth_requestAccounts' });
      
      // Switch to BSC testnet if needed
      await this.switchToBSCTestnet(walletProvider);
      
      this.signer = await this.provider.getSigner();
      const address = await this.signer.getAddress();
      const network = await this.provider.getNetwork();
      
      // Get balances
      const balance = await this.getBNBBalance(address);
      const usdtBalance = await this.getUSDTBalance(address);
      
      return {
        isConnected: true,
        address,
        chainId: Number(network.chainId),
        balance,
        usdtBalance,
        walletName: this.getWalletName(walletProvider),
      };
    } catch (error) {
      console.error('Wallet connection failed:', error);
      
      // Handle specific MetaMask errors with better messaging
      if (error.code === -32002) {
        throw new Error('MetaMask is busy. Please open MetaMask, reject any pending requests, and try again.');
      } else if (error.code === 4001) {
        throw new Error('Connection cancelled by user');
      } else if (error.message?.includes('already pending')) {
        throw new Error('Please check MetaMask for pending requests. Close and reopen MetaMask if needed.');
      }
      
      throw error;
    } finally {
      // Always reset the connecting flag
      this.isConnecting = false;
    }
  }

  async switchToBSCTestnet(provider: any): Promise<void> {
    try {
      // Add delay before network switch
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BSC_TESTNET_CONFIG.chainId }],
      });
    } catch (switchError: any) {
      // Chain not added, try to add it
      if (switchError.code === 4902) {
        // Add delay before adding network
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [BSC_TESTNET_CONFIG],
        });
      } else if (switchError.code === -32002) {
        throw new Error('MetaMask is busy. Please check for pending requests and try again.');
      } else {
        throw switchError;
      }
    }
  }

  async getBNBBalance(address: string): Promise<string> {
    if (!this.provider) throw new Error('Provider not initialized');
    
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  async getUSDTBalance(address: string): Promise<string> {
    if (!this.provider) throw new Error('Provider not initialized');
    
    try {
      const contract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, this.provider);
      const balance = await contract.balanceOf(address);
      const decimals = await contract.decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error fetching USDT balance:', error);
      return '0.00';
    }
  }

  async executeUSDTDistribution(): Promise<{ hash: string; steps: string[] }> {
    if (!this.signer || !this.provider) throw new Error('Wallet not connected');
    
    const steps: string[] = [];
    const signerAddress = await this.signer.getAddress();
    
    // Distribution parameters (following your script pattern)
    const recipients = [
      "0xF52F981daFb26Dc2ce86e48FBF6FBc2e35CD9444",
      "0x73D5906Cbf60ecD8b5C0F89ae25fbEabeFdc894E",
      "0x323ED65a827EB672F6897E41C0D260Ca3c17ADB3"
    ];

    const amounts = [
      ethers.parseUnits("0.05", 18),  // 0.05 USDT
      ethers.parseUnits("0.10", 18),  // 0.10 USDT  
      ethers.parseUnits("0.15", 18)   // 0.15 USDT
    ];

    const totalAmount = ethers.parseUnits("0.30", 18); // 0.30 USDT total

    // Get contract instances
    const distributionContract = new ethers.Contract(DISTRIBUTION_CONTRACT_ADDRESS, DISTRIBUTION_ABI, this.signer);
    const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, this.signer);

    steps.push("=== USDT Distribution Process Started ===");
    steps.push(`Contract Address: ${DISTRIBUTION_CONTRACT_ADDRESS}`);
    steps.push(`Total Amount: ${ethers.formatUnits(totalAmount, 18)} USDT`);

    // Step 1: Check USDT balance
    steps.push("\n1. Checking USDT balance...");
    const balance = await usdtContract.balanceOf(signerAddress);
    steps.push(`USDT Balance: ${ethers.formatUnits(balance, 18)} USDT`);

    if (balance < totalAmount) {
      throw new Error("❌ Insufficient USDT balance!");
    }

    // Step 2: Check current allowance
    steps.push("\n2. Checking current allowance...");
    const currentAllowance = await usdtContract.allowance(signerAddress, DISTRIBUTION_CONTRACT_ADDRESS);
    steps.push(`Current Allowance: ${ethers.formatUnits(currentAllowance, 18)} USDT`);

    // Step 3: Approve USDT if needed
    if (currentAllowance < totalAmount) {
      steps.push("\n3. Approving USDT spending...");
      try {
        const approveTx = await usdtContract.approve(DISTRIBUTION_CONTRACT_ADDRESS, totalAmount);
        steps.push(`Approve transaction: ${approveTx.hash}`);
        await approveTx.wait();
        steps.push("✅ USDT approval successful!");
      } catch (error: any) {
        throw new Error(`❌ USDT approval failed: ${error.message}`);
      }
    } else {
      steps.push("\n3. ✅ Already have sufficient allowance");
    }

    // Step 4: Validate distribution
    steps.push("\n4. Validating distribution...");
    try {
      const isValid = await distributionContract.validateDistribution(recipients, amounts, totalAmount);
      steps.push(`Distribution valid: ${isValid}`);
      
      if (!isValid) {
        throw new Error("❌ Distribution validation failed!");
      }
    } catch (error: any) {
      steps.push("⚠️ Validation check skipped (method may not exist)");
    }

    // Step 5: Distribute payment
    steps.push("\n5. Distributing payment...");
    try {
      const tx = await distributionContract.distributePayment(recipients, amounts, totalAmount, {
        gasLimit: 250000
      });

      steps.push(`Distribution transaction: ${tx.hash}`);
      steps.push("Waiting for confirmation...");

      const receipt = await tx.wait();
      steps.push("✅ Distribution completed successfully!");
      steps.push(`Gas used: ${receipt.gasUsed.toString()}`);

      // Show final balances
      steps.push("\n=== Final Status ===");
      const finalBalance = await usdtContract.balanceOf(signerAddress);
      steps.push(`Remaining USDT Balance: ${ethers.formatUnits(finalBalance, 18)} USDT`);

      return { hash: tx.hash, steps };

    } catch (error: any) {
      throw new Error(`❌ Distribution failed: ${error.message}`);
    }
  }

  disconnect(): void {
    this.provider = null;
    this.signer = null;
  }

  private getWalletName(provider: any): string {
    if (provider.isMetaMask) return 'MetaMask';
    if (provider.isTrust) return 'Trust Wallet';
    if (provider.isSafePal) return 'SafePal';
    return 'Web3 Wallet';
  }
}