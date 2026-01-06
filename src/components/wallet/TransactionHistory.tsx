import { useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useTransactionHistory, Transaction } from '@/hooks/useTransactionHistory';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, ExternalLink, History } from 'lucide-react';

interface TransactionHistoryProps {
  walletAddress: string;
}

const TransactionItem = ({ tx, walletAddress }: { tx: Transaction; walletAddress: string }) => {
  const isSent = tx.type === 'sent';
  const amount = parseFloat(tx.value) / Math.pow(10, tx.tokenDecimal);
  const formattedAmount = amount < 1 ? amount.toFixed(4) : amount.toFixed(2);
  
  const counterpartyAddress = isSent ? tx.to : tx.from;
  const shortAddress = `${counterpartyAddress.slice(0, 6)}...${counterpartyAddress.slice(-4)}`;
  
  const timeAgo = formatDistanceToNow(
    new Date(parseInt(tx.timeStamp) * 1000),
    { addSuffix: true, locale: vi }
  );

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isSent ? 'bg-red-500/20' : 'bg-green-500/20'
        }`}>
          {isSent ? (
            <ArrowUpRight className="w-4 h-4 text-red-400" />
          ) : (
            <ArrowDownLeft className="w-4 h-4 text-green-400" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-white">
            {isSent ? 'Gửi' : 'Nhận'} {tx.tokenSymbol}
          </p>
          <p className="text-xs text-white/50">
            {isSent ? 'Đến' : 'Từ'} {shortAddress}
          </p>
        </div>
      </div>
      
      <div className="text-right">
        <p className={`text-sm font-bold ${isSent ? 'text-red-400' : 'text-green-400'}`}>
          {isSent ? '-' : '+'}{formattedAmount} {tx.tokenSymbol}
        </p>
        <div className="flex items-center gap-1 justify-end">
          <p className="text-xs text-white/40">{timeAgo}</p>
          <a
            href={`https://bscscan.com/tx/${tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white/70 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};

const TransactionHistory = ({ walletAddress }: TransactionHistoryProps) => {
  const { transactions, loading, error, fetchHistory } = useTransactionHistory(walletAddress);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <div className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <History className="w-4 h-4" />
          <h3 className="text-sm font-medium">Lịch sử giao dịch</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7 text-white/60 hover:text-white hover:bg-white/10"
          onClick={fetchHistory}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading && transactions.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 bg-white/10" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <p className="text-red-400 text-sm">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-white/60 hover:text-white"
            onClick={fetchHistory}
          >
            Thử lại
          </Button>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-white/50 text-sm">Chưa có giao dịch nào</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {transactions.map(tx => (
            <TransactionItem key={tx.hash} tx={tx} walletAddress={walletAddress} />
          ))}
        </div>
      )}

      <a
        href={`https://bscscan.com/address/${walletAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors pt-2"
      >
        Xem tất cả trên BSCScan
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
};

export default TransactionHistory;
