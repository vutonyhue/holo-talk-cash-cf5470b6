import { cn } from '@/lib/utils';

interface DialPadButtonProps {
  digit: string;
  letters?: string;
  onClick: (digit: string) => void;
  className?: string;
}

export const DialPadButton = ({ digit, letters, onClick, className }: DialPadButtonProps) => {
  return (
    <button
      type="button"
      onClick={() => onClick(digit)}
      className={cn(
        "w-16 h-16 rounded-full flex flex-col items-center justify-center",
        "bg-muted hover:bg-muted/80 active:scale-95",
        "transition-all duration-150",
        "text-foreground",
        className
      )}
    >
      <span className="text-2xl font-semibold">{digit}</span>
      {letters && (
        <span className="text-[10px] text-muted-foreground tracking-wider">
          {letters}
        </span>
      )}
    </button>
  );
};
