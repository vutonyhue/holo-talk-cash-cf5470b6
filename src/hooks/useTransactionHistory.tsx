import { useState, useCallback } from 'react';
import { CAMLY_COIN_CONFIG } from './useWallet';

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: number;
  timeStamp: string;
  type: 'sent' | 'received';
}

interface TransactionHistoryState {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
}

export function useTransactionHistory(walletAddress: string | null) {
  const [state, setState] = useState<TransactionHistoryState>({
    transactions: [],
    loading: false,
    error: null,
  });

  const fetchHistory = useCallback(async () => {
    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const normalizedAddress = walletAddress.toLowerCase();

      // Fetch CAMLY token transfers
      const camlyUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${walletAddress}&contractaddress=${CAMLY_COIN_CONFIG.address}&sort=desc&page=1&offset=20`;
      
      // Fetch BNB transactions
      const bnbUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${walletAddress}&sort=desc&page=1&offset=20`;

      const [camlyRes, bnbRes] = await Promise.all([
        fetch(camlyUrl).then(r => r.json()),
        fetch(bnbUrl).then(r => r.json())
      ]);

      const allTransactions: Transaction[] = [];

      // Process CAMLY transactions
      if (camlyRes.status === '1' && Array.isArray(camlyRes.result)) {
        camlyRes.result.forEach((tx: any) => {
          allTransactions.push({
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            tokenSymbol: tx.tokenSymbol || 'CAMLY',
            tokenDecimal: parseInt(tx.tokenDecimal) || CAMLY_COIN_CONFIG.decimals,
            timeStamp: tx.timeStamp,
            type: tx.from.toLowerCase() === normalizedAddress ? 'sent' : 'received',
          });
        });
      }

      // Process BNB transactions (only successful ones with value > 0)
      if (bnbRes.status === '1' && Array.isArray(bnbRes.result)) {
        bnbRes.result
          .filter((tx: any) => tx.isError === '0' && tx.value !== '0')
          .forEach((tx: any) => {
            allTransactions.push({
              hash: tx.hash,
              from: tx.from,
              to: tx.to,
              value: tx.value,
              tokenSymbol: 'BNB',
              tokenDecimal: 18,
              timeStamp: tx.timeStamp,
              type: tx.from.toLowerCase() === normalizedAddress ? 'sent' : 'received',
            });
          });
      }

      // Sort by timestamp (newest first)
      allTransactions.sort((a, b) => parseInt(b.timeStamp) - parseInt(a.timeStamp));

      // Take only first 20
      setState({
        transactions: allTransactions.slice(0, 20),
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error('Error fetching transaction history:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Không thể tải lịch sử giao dịch',
      }));
    }
  }, [walletAddress]);

  return {
    transactions: state.transactions,
    loading: state.loading,
    error: state.error,
    fetchHistory,
  };
}
