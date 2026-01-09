import { Bot, Users, Sparkles } from 'lucide-react';

interface ComingSoonProps {
  type: 'community' | 'ai';
}

export default function ComingSoon({ type }: ComingSoonProps) {
  const config = {
    community: {
      icon: Users,
      title: 'Cộng đồng',
      description: 'Tham gia nhóm, kênh và cộng đồng FunChat',
      gradient: 'from-emerald-500 to-teal-500'
    },
    ai: {
      icon: Bot,
      title: 'Meta AI',
      description: 'Trợ lý AI thông minh hỗ trợ bạn mọi lúc',
      gradient: 'from-purple-500 to-pink-500'
    }
  };

  const { icon: Icon, title, description, gradient } = config[type];

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-sidebar">
      <div className="relative mb-6">
        <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-float animate-float`}>
          <Icon className="w-10 h-10 text-white" />
        </div>
        <Sparkles 
          className="absolute -top-2 -right-2 w-6 h-6 text-yellow-500" 
        />
      </div>
      
      <h2 className="text-2xl font-bold mb-2">{title}</h2>
      <p className="text-muted-foreground text-center max-w-xs mb-6">
        {description}
      </p>
      
      <div className="px-6 py-3 rounded-full bg-primary/10 text-primary font-semibold">
        🚀 Sắp ra mắt
      </div>
    </div>
  );
}
