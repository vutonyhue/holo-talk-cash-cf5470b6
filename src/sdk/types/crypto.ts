/**
 * FunChat SDK - Crypto Types
 * Type definitions for cryptocurrency operations
 */

import type { Profile } from './chat';

/**
 * Transaction status values
 */
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

/**
 * Supported cryptocurrencies
 */
export type CryptoCurrency = 'CAMLY' | 'ETH' | 'BTC' | 'USDT' | 'USDC' | string;

/**
 * Crypto transaction record
 */
export interface CryptoTransaction {
  id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  amount: number;
  currency: CryptoCurrency;
  tx_hash: string | null;
  message_id: string | null;
  status: TransactionStatus | null;
  created_at: string | null;
  from_user?: Profile;
  to_user?: Profile;
}

/**
 * Parameters for transferring crypto
 */
export interface TransferParams {
  /**
   * Recipient user ID
   */
  to_user_id: string;

  /**
   * Amount to transfer
   */
  amount: number;

  /**
   * Currency code
   */
  currency: CryptoCurrency;

  /**
   * Blockchain transaction hash (optional, for verification)
   */
  tx_hash?: string;

  /**
   * Message ID to attach transaction to
   */
  message_id?: string;

  /**
   * Optional note/memo for the transaction
   */
  note?: string;
}

/**
 * Parameters for listing transaction history
 */
export interface CryptoHistoryParams {
  /**
   * Maximum number of transactions to return
   * @default 20
   */
  limit?: number;

  /**
   * Offset for pagination
   * @default 0
   */
  offset?: number;

  /**
   * Filter by currency
   */
  currency?: CryptoCurrency;

  /**
   * Filter by status
   */
  status?: TransactionStatus;

  /**
   * Filter: 'sent', 'received', or 'all'
   * @default 'all'
   */
  direction?: 'sent' | 'received' | 'all';
}

/**
 * Crypto balance for a single currency
 */
export interface CryptoBalance {
  currency: CryptoCurrency;
  balance: number;
  pending_sent: number;
  pending_received: number;
}

/**
 * Aggregated crypto statistics
 */
export interface CryptoStats {
  /**
   * Total amounts sent per currency
   */
  total_sent: Record<CryptoCurrency, number>;

  /**
   * Total amounts received per currency
   */
  total_received: Record<CryptoCurrency, number>;

  /**
   * Transaction counts
   */
  transaction_count: {
    sent: number;
    received: number;
    total: number;
  };

  /**
   * Most used currencies (sorted by transaction count)
   */
  top_currencies: Array<{
    currency: CryptoCurrency;
    count: number;
    total_amount: number;
  }>;
}

/**
 * Crypto transfer result
 */
export interface TransferResult extends CryptoTransaction {
  /**
   * Message created for the transfer (if in a conversation)
   */
  message?: {
    id: string;
    conversation_id: string;
  };
}
