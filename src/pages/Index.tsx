import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageCircle, Video, Wallet, Sparkles, Shield, Zap } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-fun-purple via-fun-pink to-fun-orange overflow-hidden">
      {/* Animated background shapes */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-fun-yellow/30 rounded-full blur-3xl animate-float" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-fun-cyan/30 rounded-full blur-3xl animate-float-delayed" />
        <div className="absolute -bottom-40 right-1/3 w-72 h-72 bg-fun-green/30 rounded-full blur-3xl animate-bounce-slow" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
        {/* Logo */}
        <div className="mb-8 animate-bounce-slow">
          <div className="w-24 h-24 bg-white rounded-3xl shadow-fun-3d flex items-center justify-center transform rotate-12 hover:rotate-0 transition-transform duration-300">
            <MessageCircle className="w-12 h-12 text-fun-purple" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-7xl font-bold text-white text-center mb-4 drop-shadow-lg">
          Fun<span className="text-fun-yellow">Chat</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-white/90 text-center mb-12 max-w-2xl">
          Nhắn tin, gọi video & gửi crypto - tất cả trong một ứng dụng siêu vui! 🎉
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link to="/auth">
            <Button 
              size="lg" 
              className="bg-white text-fun-purple hover:bg-fun-yellow hover:text-fun-purple font-bold text-lg px-8 py-6 rounded-2xl shadow-fun-3d transform hover:scale-105 transition-all duration-300"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Bắt đầu ngay
            </Button>
          </Link>
          <Link to="/chat">
            <Button 
              size="lg" 
              variant="outline"
              className="border-2 border-white text-white hover:bg-white hover:text-fun-purple font-bold text-lg px-8 py-6 rounded-2xl transform hover:scale-105 transition-all duration-300"
            >
              <MessageCircle className="mr-2 h-5 w-5" />
              Vào Chat
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
          <FeatureCard 
            icon={<Video className="w-8 h-8" />}
            title="Video Call HD"
            description="Gọi video 1-1 hoặc nhóm với chất lượng cao"
            color="bg-fun-cyan"
          />
          <FeatureCard 
            icon={<Wallet className="w-8 h-8" />}
            title="Crypto Transfers"
            description="Gửi ETH, USDT, USDC trực tiếp qua tin nhắn"
            color="bg-fun-green"
          />
          <FeatureCard 
            icon={<Shield className="w-8 h-8" />}
            title="Bảo mật cao"
            description="Tin nhắn được mã hóa và bảo vệ an toàn"
            color="bg-fun-yellow"
          />
        </div>

        {/* Footer */}
        <div className="mt-16 flex items-center gap-2 text-white/70">
          <Zap className="w-4 h-4" />
          <span>Powered by Web3 & Love</span>
        </div>
      </div>
    </div>
  );
};

const FeatureCard = ({ 
  icon, 
  title, 
  description, 
  color 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  color: string;
}) => (
  <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105 hover:-translate-y-2">
    <div className={`w-14 h-14 ${color} rounded-2xl flex items-center justify-center text-white mb-4 shadow-fun-3d`}>
      {icon}
    </div>
    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
    <p className="text-white/80">{description}</p>
  </div>
);

export default Index;
