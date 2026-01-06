import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Coins, Wallet, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWallet, CAMLY_COIN_CONFIG } from '@/hooks/useWallet';

interface CryptoSendDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (amount: number, currency: string, txHash?: string) => void;
  recipientName: string;
  recipientWallet?: string | null;
}

const CURRENCIES = [
  { value: 'CAMLY', label: 'CAMLY COIN', icon: '🌸', color: 'from-pink-500 to-purple-500', network: 'BSC' },
  { value: 'BNB', label: 'BNB', icon: '🔶', color: 'from-yellow-400 to-yellow-600', network: 'BSC' },
  { value: 'ETH', label: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-purple-500', network: 'ETH' },
  { value: 'USDT', label: 'Tether USD', icon: '₮', color: 'from-green-500 to-emerald-500', network: 'BSC' },
];

export default function CryptoSendDialog({ open, onClose, onSend, recipientName, recipientWallet }: CryptoSendDialogProps) {
  const { toast } = useToast();
  const { 
    isConnected, 
    address, 
    bnbBalance, 
    camlyBalance, 
    connect, 
    sendBEP20Token, 
    sendBNB,
    shortenAddress 
  } = useWallet();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('CAMLY');
  const [isSending, setIsSending] = useState(false);

  const selectedCurrency = CURRENCIES.find(c => c.value === currency);
  const hasRecipientWallet = !!recipientWallet;

  const handleConnectWallet = async () => {
    await connect();
  };

  const handleSend = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: 'Số tiền không hợp lệ',
        description: 'Vui lòng nhập số tiền lớn hơn 0',
        variant: 'destructive',
      });
      return;
    }

    if (!recipientWallet) {
      toast({
        title: 'Người nhận chưa có ví',
        description: 'Yêu cầu người nhận thêm địa chỉ ví trong hồ sơ',
        variant: 'destructive',
      });
      return;
    }

    setIsSending(true);
    let txHash: string | null = null;

    try {
      // Execute real blockchain transaction
      if (currency === 'CAMLY') {
        txHash = await sendBEP20Token(recipientWallet, amount);
      } else if (currency === 'BNB') {
        txHash = await sendBNB(recipientWallet, amount);
      } else {
        // For ETH/USDT on other networks - simulate for now
        toast({
          title: 'Chú ý',
          description: 'Token này sẽ được gửi dưới dạng mô phỏng. CAMLY COIN và BNB được hỗ trợ đầy đủ.',
        });
      }

      if (txHash || !['CAMLY', 'BNB'].includes(currency)) {
        onSend(numAmount, currency, txHash || undefined);
        setAmount('');
        setCurrency('CAMLY');
        onClose();
      }
    } catch (error) {
      console.error('Send error:', error);
    }

    setIsSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-warm flex items-center justify-center">
              <Coins className="w-5 h-5 text-white" />
            </div>
            Gửi Crypto
          </DialogTitle>
          <DialogDescription>
            Gửi tiền điện tử trực tiếp cho {recipientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* No recipient wallet warning */}
          {!hasRecipientWallet && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Người nhận chưa có ví</p>
                <p className="text-muted-foreground">
                  Yêu cầu {recipientName} thêm địa chỉ ví trong hồ sơ để nhận crypto.
                </p>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Số tiền</Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-14 text-2xl font-bold pr-28"
                step="0.0001"
                min="0"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-24 h-10 border-0 bg-muted">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">
                          <span>{c.icon}</span>
                          <span>{c.value}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Balance display */}
            {isConnected && (
              <p className="text-xs text-muted-foreground">
                Số dư: {currency === 'CAMLY' ? camlyBalance : currency === 'BNB' ? bnbBalance : '—'} {currency}
              </p>
            )}
          </div>

          {/* Preview */}
          <div className={`p-4 rounded-xl bg-gradient-to-r ${selectedCurrency?.color} text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-80">Bạn gửi</p>
                <p className="text-2xl font-bold">
                  {amount || '0'} {currency}
                </p>
              </div>
              <ArrowRight className="w-6 h-6" />
              <div className="text-right">
                <p className="text-sm opacity-80">Đến</p>
                <p className="font-semibold">{recipientName}</p>
                {recipientWallet && (
                  <p className="text-xs opacity-70 font-mono">
                    {shortenAddress(recipientWallet)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Wallet Connection */}
          {!isConnected && (
            <Button
              onClick={handleConnectWallet}
              className="w-full h-12 gradient-primary btn-3d"
            >
              <Wallet className="w-5 h-5 mr-2" />
              Kết nối ví
            </Button>
          )}

          {/* Connected wallet info */}
          {isConnected && address && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600">Ví: {shortenAddress(address)}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSending}>
            Hủy
          </Button>
          <Button 
            onClick={handleSend}
            disabled={!isConnected || !amount || !hasRecipientWallet || isSending}
            className="flex-1 gradient-primary btn-3d"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Coins className="w-4 h-4 mr-2" />
            )}
            {isSending ? 'Đang gửi...' : 'Gửi ngay'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Type declaration moved to useWallet.tsx
