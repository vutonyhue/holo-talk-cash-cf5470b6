import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWallet, CAMLY_COIN_CONFIG } from '@/hooks/useWallet';
import { Wallet, CheckCircle, ExternalLink, Copy, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface WalletConnectDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function WalletConnectDialog({ open, onClose }: WalletConnectDialogProps) {
  const { 
    isConnected, 
    address, 
    isConnecting, 
    bnbBalance, 
    camlyBalance,
    isWalletInstalled,
    shortenAddress,
    connect, 
    disconnect 
  } = useWallet();

  const handleConnect = async () => {
    const success = await connect();
    if (success) {
      onClose();
    }
  };

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Đã sao chép địa chỉ ví');
    }
  };

  const handleViewOnExplorer = () => {
    if (address) {
      window.open(`https://bscscan.com/address/${address}`, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            Kết nối ví
          </DialogTitle>
          <DialogDescription>
            Kết nối ví để gửi và nhận CAMLY COIN
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isConnected && address ? (
            // Connected state
            <div className="space-y-4">
              {/* Connected Badge */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="font-medium text-green-600">Đã kết nối</span>
              </div>

              {/* Wallet Address */}
              <div className="p-4 rounded-xl bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Địa chỉ ví</span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyAddress}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleViewOnExplorer}>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="font-mono text-sm break-all">{address}</p>
              </div>

              {/* Balances */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-gradient-to-br from-yellow-400/10 to-orange-500/10 border border-yellow-500/20">
                  <p className="text-sm text-muted-foreground">BNB</p>
                  <p className="text-xl font-bold text-yellow-600">{bnbBalance}</p>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-pink-400/10 to-purple-500/10 border border-pink-500/20">
                  <p className="text-sm text-muted-foreground">CAMLY</p>
                  <p className="text-xl font-bold text-pink-600">{camlyBalance}</p>
                </div>
              </div>

              {/* Disconnect Button */}
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => {
                  disconnect();
                  onClose();
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Ngắt kết nối
              </Button>
            </div>
          ) : (
            // Not connected state
            <div className="space-y-4">
              {/* MetaMask/Trust Wallet */}
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full p-4 rounded-xl border-2 border-muted hover:border-primary/50 hover:bg-muted/50 transition-all flex items-center gap-4 disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center">
                  <span className="text-2xl">🦊</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold">MetaMask / Trust Wallet</p>
                  <p className="text-sm text-muted-foreground">
                    {isWalletInstalled ? 'Kết nối với ví đã cài đặt' : 'Cài đặt MetaMask để tiếp tục'}
                  </p>
                </div>
                {isConnecting && <Loader2 className="w-5 h-5 animate-spin" />}
              </button>

              {/* WalletConnect (future) */}
              <button
                disabled
                className="w-full p-4 rounded-xl border-2 border-muted opacity-50 cursor-not-allowed flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center">
                  <span className="text-2xl">🔗</span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold">WalletConnect</p>
                  <p className="text-sm text-muted-foreground">Sắp ra mắt</p>
                </div>
              </button>

              {/* Info */}
              <div className="p-4 rounded-xl bg-muted/50 text-sm text-muted-foreground">
                <p className="font-medium mb-1">💡 Lưu ý:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Ví sẽ tự động chuyển sang mạng BNB Smart Chain</li>
                  <li>Bạn cần có BNB để trả phí giao dịch</li>
                  <li>Địa chỉ ví sẽ được lưu vào hồ sơ của bạn</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
