/**
 * FunChat SDK - Crypto Resource
 * Methods for cryptocurrency operations
 */

import type { FunChatClient } from '../client';
import type {
  CryptoTransaction,
  CryptoStats,
  TransferParams,
  TransferResult,
  CryptoHistoryParams,
  CryptoBalance,
  CryptoCurrency,
} from '../types';

/**
 * Crypto resource for cryptocurrency operations
 */
export class CryptoResource {
  constructor(private client: FunChatClient) {}

  /**
   * Transfer cryptocurrency to another user
   * 
   * @param params - Transfer parameters
   * @returns Transaction details
   * 
   * @example
   * ```typescript
   * const tx = await client.crypto.transfer({
   *   to_user_id: 'user-456',
   *   amount: 100,
   *   currency: 'CAMLY'
   * });
   * 
   * console.log(`Transaction ID: ${tx.id}`);
   * console.log(`Status: ${tx.status}`);
   * ```
   */
  async transfer(params: TransferParams): Promise<TransferResult> {
    return this.client.request<TransferResult>('POST', '/api-crypto', {
      body: {
        action: 'transfer',
        ...params
      }
    });
  }

  /**
   * Get transaction history
   * 
   * @param params - Filter and pagination options
   * @returns Array of transactions
   * 
   * @example
   * ```typescript
   * // Get all transactions
   * const txs = await client.crypto.history();
   * 
   * // Get sent transactions only
   * const sent = await client.crypto.history({
   *   direction: 'sent',
   *   limit: 20
   * });
   * 
   * // Get CAMLY transactions only
   * const camlyTxs = await client.crypto.history({
   *   currency: 'CAMLY'
   * });
   * ```
   */
  async history(params?: CryptoHistoryParams): Promise<CryptoTransaction[]> {
    return this.client.request<CryptoTransaction[]>('GET', '/api-crypto', {
      params: {
        action: 'history',
        limit: params?.limit?.toString(),
        offset: params?.offset?.toString(),
        currency: params?.currency,
        status: params?.status,
        direction: params?.direction
      }
    });
  }

  /**
   * Get a specific transaction by ID
   * 
   * @param transactionId - Transaction ID
   * @returns Transaction details
   * @throws NotFoundError if transaction doesn't exist
   * 
   * @example
   * ```typescript
   * const tx = await client.crypto.get('tx-123');
   * console.log(`Amount: ${tx.amount} ${tx.currency}`);
   * ```
   */
  async get(transactionId: string): Promise<CryptoTransaction> {
    return this.client.request<CryptoTransaction>('GET', '/api-crypto', {
      params: { action: 'get', transaction_id: transactionId }
    });
  }

  /**
   * Get crypto statistics for the current user
   * 
   * @returns Aggregated statistics
   * 
   * @example
   * ```typescript
   * const stats = await client.crypto.stats();
   * console.log(`Total sent (CAMLY): ${stats.total_sent.CAMLY}`);
   * console.log(`Total received (CAMLY): ${stats.total_received.CAMLY}`);
   * ```
   */
  async stats(): Promise<CryptoStats> {
    return this.client.request<CryptoStats>('GET', '/api-crypto', {
      params: { action: 'stats' }
    });
  }

  /**
   * Get balance for a specific currency
   * 
   * @param currency - Currency code
   * @returns Balance information
   * 
   * @example
   * ```typescript
   * const balance = await client.crypto.balance('CAMLY');
   * console.log(`Available: ${balance.balance}`);
   * ```
   */
  async balance(currency: CryptoCurrency): Promise<CryptoBalance> {
    return this.client.request<CryptoBalance>('GET', '/api-crypto', {
      params: { action: 'balance', currency }
    });
  }

  /**
   * Get all balances
   * 
   * @returns Array of balances for all currencies
   * 
   * @example
   * ```typescript
   * const balances = await client.crypto.balances();
   * for (const balance of balances) {
   *   console.log(`${balance.currency}: ${balance.balance}`);
   * }
   * ```
   */
  async balances(): Promise<CryptoBalance[]> {
    return this.client.request<CryptoBalance[]>('GET', '/api-crypto', {
      params: { action: 'balances' }
    });
  }

  /**
   * Get transaction by blockchain tx hash
   * 
   * @param txHash - Blockchain transaction hash
   * @returns Transaction details or null
   * 
   * @example
   * ```typescript
   * const tx = await client.crypto.getByTxHash('0x123...');
   * if (tx) {
   *   console.log(`Found transaction: ${tx.id}`);
   * }
   * ```
   */
  async getByTxHash(txHash: string): Promise<CryptoTransaction | null> {
    try {
      return await this.client.request<CryptoTransaction>('GET', '/api-crypto', {
        params: { action: 'get_by_hash', tx_hash: txHash }
      });
    } catch {
      return null;
    }
  }

  /**
   * Send crypto to a user (convenience method)
   * 
   * @param toUserId - Recipient user ID
   * @param amount - Amount to send
   * @param currency - Currency code
   * @returns Transaction result
   * 
   * @example
   * ```typescript
   * const tx = await client.crypto.send('user-456', 50, 'CAMLY');
   * ```
   */
  async send(toUserId: string, amount: number, currency: CryptoCurrency): Promise<TransferResult> {
    return this.transfer({ to_user_id: toUserId, amount, currency });
  }
}
