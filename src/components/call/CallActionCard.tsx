import { cn } from '@/lib/utils';

interface CallActionCardProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  className?: string;
}

export function CallActionCard({ icon, title, onClick, className }: CallActionCardProps) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center p-6 border rounded-xl",
        "hover:bg-muted transition-colors cursor-pointer",
        "min-w-[140px]",
        className
      )}
    >
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <span className="text-sm text-center">{title}</span>
    </button>
  );
}
