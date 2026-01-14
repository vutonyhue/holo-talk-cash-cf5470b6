import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Smartphone, Share, MoreVertical, PlusSquare, Check, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Detect platform
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-fun-purple via-fun-pink to-fun-orange flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Đã cài đặt!</h2>
            <p className="text-muted-foreground mb-6">
              FunChat đã được cài đặt trên thiết bị của bạn. Bạn có thể mở app từ màn hình chính.
            </p>
            <Link to="/chat">
              <Button className="w-full bg-fun-purple hover:bg-fun-purple/90">
                Mở FunChat
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-fun-purple via-fun-pink to-fun-orange p-4">
      <div className="max-w-md mx-auto pt-8 pb-12">
        {/* Header */}
        <div className="text-center text-white mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg transform rotate-6">
            <MessageCircle className="w-10 h-10 text-fun-purple" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Cài đặt FunChat</h1>
          <p className="text-white/80">
            Thêm FunChat vào màn hình chính để truy cập nhanh hơn
          </p>
        </div>

        {/* Install Button (Android/Desktop with prompt) */}
        {deferredPrompt && (
          <Card className="mb-6 border-2 border-fun-purple/20">
            <CardContent className="pt-6">
              <Button 
                onClick={handleInstall} 
                className="w-full bg-fun-purple hover:bg-fun-purple/90" 
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                Cài đặt ngay
              </Button>
              <p className="text-center text-sm text-muted-foreground mt-3">
                Nhấn để thêm FunChat vào màn hình chính
              </p>
            </CardContent>
          </Card>
        )}

        {/* iOS Instructions */}
        {isIOS && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">iOS</span>
                </div>
                Hướng dẫn cho iPhone/iPad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Share className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Bước 1: Nhấn nút Chia sẻ</p>
                  <p className="text-sm text-muted-foreground">
                    Tìm biểu tượng <Share className="w-3 h-3 inline" /> ở thanh công cụ phía dưới Safari
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <PlusSquare className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Bước 2: Chọn "Thêm vào MH chính"</p>
                  <p className="text-sm text-muted-foreground">
                    Cuộn xuống trong menu và tìm tùy chọn này
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Bước 3: Nhấn "Thêm"</p>
                  <p className="text-sm text-muted-foreground">
                    FunChat sẽ xuất hiện trên màn hình chính của bạn
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Android Instructions (when no prompt available) */}
        {isAndroid && !deferredPrompt && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">A</span>
                </div>
                Hướng dẫn cho Android
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MoreVertical className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Bước 1: Nhấn menu (⋮)</p>
                  <p className="text-sm text-muted-foreground">
                    Ở góc trên bên phải của Chrome
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Bước 2: Chọn "Thêm vào MH chính"</p>
                  <p className="text-sm text-muted-foreground">
                    Hoặc "Install app" / "Cài đặt ứng dụng"
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Bước 3: Xác nhận cài đặt</p>
                  <p className="text-sm text-muted-foreground">
                    FunChat sẽ xuất hiện trên màn hình chính
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Desktop Instructions */}
        {!isIOS && !isAndroid && !deferredPrompt && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-bold">PC</span>
                </div>
                Hướng dẫn trên máy tính
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Download className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Tìm biểu tượng cài đặt</p>
                  <p className="text-sm text-muted-foreground">
                    Trong thanh địa chỉ của Chrome, nhấn vào biểu tượng cài đặt (nếu có)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MoreVertical className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Hoặc dùng menu Chrome</p>
                  <p className="text-sm text-muted-foreground">
                    Menu (⋮) → "Cài đặt FunChat" hoặc "Install FunChat"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Benefits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">✨ Lợi ích khi cài đặt</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </div>
                <span className="text-sm">Truy cập nhanh từ màn hình chính</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </div>
                <span className="text-sm">Chạy toàn màn hình như app thật</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </div>
                <span className="text-sm">Hoạt động offline (một số tính năng)</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </div>
                <span className="text-sm">Không chiếm nhiều bộ nhớ</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </div>
                <span className="text-sm">Tự động cập nhật phiên bản mới</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Back link */}
        <div className="text-center mt-8">
          <Link 
            to="/" 
            className="text-white/80 hover:text-white underline underline-offset-4 transition-colors"
          >
            ← Quay lại trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Install;
