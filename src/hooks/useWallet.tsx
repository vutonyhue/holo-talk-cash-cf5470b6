import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// BNB Smart Chain Configuration
const BNB_CHAIN_CONFIG = {
  chainId: '0x38', // 56 in decimal
  chainName: 'BNB Smart Chain',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: ['https://bsc-dataseed.binance.org/'],
  blockExplorerUrls: ['https://bscscan.com/'],
};

// CAMLY COIN Configuration on BNB Smart Chain
export const CAMLY_COIN_CONFIG = {
  address: '0x0910320181889feFDE0BB1Ca63962b0A8882e413',
  decimals: 3, // CAMLY token có 3 decimals (đã xác nhận trên BSCScan)
  symbol: 'CAMLY',
  name: 'CAMLY COIN',
};

interface WalletState {
  isConnected: boolean;
  address: string | null;
  chainId: string | null;
  isConnecting: boolean;
  bnbBalance: string;
  camlyBalance: string;
}

export function useWallet() {
  const { updateProfile } = useAuth();
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    chainId: null,
    isConnecting: false,
    bnbBalance: '0',
    camlyBalance: '0',
  });

  // Check if MetaMask/wallet is installed
  const isWalletInstalled = typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';

  // Shorten address for display
  const shortenAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Check current connection status
  const checkConnection = useCallback(async () => {
    if (!isWalletInstalled) return;

    try {
      const accounts = await window.ethereum!.request({ method: 'eth_accounts' }) as string[];
      const chainId = await window.ethereum!.request({ method: 'eth_chainId' }) as string;
      
      if (accounts.length > 0) {
        setState(prev => ({
          ...prev,
          isConnected: true,
          address: accounts[0],
          chainId,
        }));
        await fetchBalances(accounts[0]);
      }
    } catch (error) {
      console.error('Check connection error:', error);
    }
  }, [isWalletInstalled]);

  // Connect wallet
  const connect = async () => {
    if (!isWalletInstalled) {
      toast.error('Vui lòng cài đặt MetaMask hoặc Trust Wallet');
      window.open('https://metamask.io/download/', '_blank');
      return false;
    }

    setState(prev => ({ ...prev, isConnecting: true }));

    try {
      const accounts = await window.ethereum!.request({ 
        method: 'eth_requestAccounts' 
      }) as string[];

      if (accounts.length > 0) {
        const address = accounts[0];
        
        // Switch to BNB Chain
        await switchToBNBChain();
        
        setState(prev => ({
          ...prev,
          isConnected: true,
          address,
          isConnecting: false,
        }));

        // Save wallet address to profile
        await updateProfile({ wallet_address: address });
        
        // Fetch balances
        await fetchBalances(address);
        
        toast.success('Đã kết nối ví thành công!');
        return true;
      }
    } catch (error: any) {
      console.error('Connect error:', error);
      toast.error(error.message || 'Không thể kết nối ví');
    }

    setState(prev => ({ ...prev, isConnecting: false }));
    return false;
  };

  // Disconnect wallet
  const disconnect = () => {
    setState({
      isConnected: false,
      address: null,
      chainId: null,
      isConnecting: false,
      bnbBalance: '0',
      camlyBalance: '0',
    });
    toast.success('Đã ngắt kết nối ví');
  };

  // Switch to BNB Smart Chain
  const switchToBNBChain = async () => {
    if (!isWalletInstalled) return;

    try {
      await window.ethereum!.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BNB_CHAIN_CONFIG.chainId }],
      });
    } catch (switchError: any) {
      // Chain not added, add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum!.request({
            method: 'wallet_addEthereumChain',
            params: [BNB_CHAIN_CONFIG],
          });
        } catch (addError) {
          console.error('Add chain error:', addError);
          throw addError;
        }
      } else {
        throw switchError;
      }
    }
  };

  // Fetch BNB and CAMLY balances
  const fetchBalances = async (address: string) => {
    if (!isWalletInstalled) return;

    try {
      // Get BNB balance
      const bnbBalance = await window.ethereum!.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      }) as string;

      const bnbFormatted = (parseInt(bnbBalance, 16) / 1e18).toFixed(4);

      // Get CAMLY balance (if contract is set)
      let camlyFormatted = '0';
      if (CAMLY_COIN_CONFIG.address !== '0x0000000000000000000000000000000000000000') {
        const camlyBalance = await getTokenBalance(address, CAMLY_COIN_CONFIG.address);
        camlyFormatted = (parseInt(camlyBalance, 16) / Math.pow(10, CAMLY_COIN_CONFIG.decimals)).toFixed(2);
      }

      setState(prev => ({
        ...prev,
        bnbBalance: bnbFormatted,
        camlyBalance: camlyFormatted,
      }));
    } catch (error) {
      console.error('Fetch balances error:', error);
    }
  };

  // Get ERC20/BEP20 token balance
  const getTokenBalance = async (ownerAddress: string, tokenAddress: string): Promise<string> => {
    // balanceOf(address) function signature
    const data = '0x70a08231000000000000000000000000' + ownerAddress.slice(2);

    const result = await window.ethereum!.request({
      method: 'eth_call',
      params: [{
        to: tokenAddress,
        data,
      }, 'latest'],
    }) as string;

    return result;
  };

  // Send BEP20 token (CAMLY COIN)
  const sendBEP20Token = async (
    toAddress: string,
    amount: string,
    tokenAddress: string = CAMLY_COIN_CONFIG.address,
    decimals: number = CAMLY_COIN_CONFIG.decimals
  ): Promise<string | null> => {
    if (!isWalletInstalled || !state.address) {
      toast.error('Vui lòng kết nối ví trước');
      return null;
    }

    try {
      // Ensure on BNB Chain
      await switchToBNBChain();

      // Calculate amount in wei
      const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals))).toString(16);
      
      // Encode transfer(address,uint256) function call
      // Function selector: 0xa9059cbb
      const paddedAddress = toAddress.slice(2).padStart(64, '0');
      const paddedAmount = amountWei.padStart(64, '0');
      const data = '0xa9059cbb' + paddedAddress + paddedAmount;

      const txHash = await window.ethereum!.request({
        method: 'eth_sendTransaction',
        params: [{
          from: state.address,
          to: tokenAddress,
          data,
        }],
      }) as string;

      toast.success('Giao dịch đã được gửi!');
      return txHash;
    } catch (error: any) {
      console.error('Send token error:', error);
      toast.error(error.message || 'Giao dịch thất bại');
      return null;
    }
  };

  // Send native BNB
  const sendBNB = async (toAddress: string, amount: string): Promise<string | null> => {
    if (!isWalletInstalled || !state.address) {
      toast.error('Vui lòng kết nối ví trước');
      return null;
    }

    try {
      await switchToBNBChain();

      const amountWei = '0x' + BigInt(Math.floor(parseFloat(amount) * 1e18)).toString(16);

      const txHash = await window.ethereum!.request({
        method: 'eth_sendTransaction',
        params: [{
          from: state.address,
          to: toAddress,
          value: amountWei,
        }],
      }) as string;

      toast.success('Giao dịch đã được gửi!');
      return txHash;
    } catch (error: any) {
      console.error('Send BNB error:', error);
      toast.error(error.message || 'Giao dịch thất bại');
      return null;
    }
  };

  // Listen for account/chain changes
  useEffect(() => {
    if (!isWalletInstalled) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setState(prev => ({ ...prev, address: accounts[0] }));
        fetchBalances(accounts[0]);
      }
    };

    const handleChainChanged = (chainId: string) => {
      setState(prev => ({ ...prev, chainId }));
    };

    window.ethereum!.on?.('accountsChanged', handleAccountsChanged);
    window.ethereum!.on?.('chainChanged', handleChainChanged);

    // Check initial connection
    checkConnection();

    return () => {
      window.ethereum!.removeListener?.('accountsChanged', handleAccountsChanged);
      window.ethereum!.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [isWalletInstalled, checkConnection]);

  return {
    ...state,
    isWalletInstalled,
    shortenAddress,
    connect,
    disconnect,
    switchToBNBChain,
    sendBEP20Token,
    sendBNB,
    fetchBalances,
  };
}

// Extend window type for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
      on?: (event: string, callback: (...args: any[]) => void) => void;
      removeListener?: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}
