import { X, Check, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VoiceRecorderProps {
  duration: number;
  onCancel: () => void;
  onSend: () => void;
}

export default function VoiceRecorder({ duration, onCancel, onSend }: VoiceRecorderProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 w-full px-2">
      {/* Cancel button */}
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full h-10 w-10 text-destructive hover:bg-destructive/10"
        onClick={onCancel}
      >
        <X className="w-5 h-5" />
      </Button>

      {/* Recording indicator */}
      <div className="flex-1 flex items-center gap-3">
        <div className="relative">
          <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 bg-destructive rounded-full animate-ping opacity-75" />
        </div>
        
        <span className="font-mono text-sm font-medium text-foreground">
          {formatDuration(duration)}
        </span>

        {/* Waveform animation */}
        <div className="flex items-center gap-0.5 h-6">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-primary/60 rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 16 + 8}px`,
                animationDelay: `${i * 50}ms`,
                animationDuration: '300ms'
              }}
            />
          ))}
        </div>

        <Mic className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Send button */}
      <Button
        size="icon"
        className="rounded-full h-10 w-10 gradient-primary text-primary-foreground"
        onClick={onSend}
      >
        <Check className="w-5 h-5" />
      </Button>
    </div>
  );
}
