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
import { Coins, Wallet, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CryptoSendDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (amount: number, currency: string) => void;
  recipientName: string;
}

const CURRENCIES = [
  { value: 'ETH', label: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-purple-500' },
  { value: 'USDT', label: 'Tether USD', icon: '₮', color: 'from-green-500 to-emerald-500' },
  { value: 'USDC', label: 'USD Coin', icon: '◉', color: 'from-blue-400 to-blue-600' },
];

export default function CryptoSendDialog({ open, onClose, onSend, recipientName }: CryptoSendDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ETH');
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);

  const selectedCurrency = CURRENCIES.find(c => c.value === currency);

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    
    // Check if MetaMask is installed
    if (typeof window.ethereum === 'undefined') {
      toast({
        title: 'MetaMask chưa được cài đặt',
        description: 'Vui lòng cài đặt MetaMask để gửi crypto',
        variant: 'destructive',
      });
      setIsConnecting(false);
      return;
    }

    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWalletConnected(true);
      toast({
        title: 'Đã kết nối ví',
        description: 'Ví MetaMask đã được kết nối thành công',
      });
    } catch (error) {
      toast({
        title: 'Lỗi kết nối',
        description: 'Không thể kết nối ví MetaMask',
        variant: 'destructive',
      });
    }
    
    setIsConnecting(false);
  };

  const handleSend = () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: 'Số tiền không hợp lệ',
        description: 'Vui lòng nhập số tiền lớn hơn 0',
        variant: 'destructive',
      });
      return;
    }

    // In production, this would trigger an actual blockchain transaction
    onSend(numAmount, currency);
    setAmount('');
    setCurrency('ETH');
    setWalletConnected(false);
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
                className="h-14 text-2xl font-bold pr-24"
                step="0.0001"
                min="0"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-20 h-10 border-0 bg-muted">
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
              </div>
            </div>
          </div>

          {/* Wallet Connection */}
          {!walletConnected && (
            <Button
              onClick={handleConnectWallet}
              disabled={isConnecting}
              className="w-full h-12 gradient-primary btn-3d"
            >
              <Wallet className="w-5 h-5 mr-2" />
              {isConnecting ? 'Đang kết nối...' : 'Kết nối ví MetaMask'}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="flex-1">
            Hủy
          </Button>
          <Button 
            onClick={handleSend}
            disabled={!walletConnected || !amount}
            className="flex-1 gradient-primary btn-3d"
          >
            <Coins className="w-4 h-4 mr-2" />
            Gửi ngay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add type declaration for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}
