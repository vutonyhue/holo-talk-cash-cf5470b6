import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface VoiceMessagePlayerProps {
  src: string;
  duration: number;
  isMine?: boolean;
}

export default function VoiceMessagePlayer({ src, duration, isMine = false }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center gap-3 min-w-[200px] max-w-[280px] px-3 py-2 rounded-2xl ${
      isMine 
        ? 'gradient-primary text-primary-foreground' 
        : 'bg-card shadow-card'
    }`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Play/Pause button */}
      <Button
        variant="ghost"
        size="icon"
        className={`h-9 w-9 rounded-full shrink-0 ${
          isMine 
            ? 'bg-white/20 hover:bg-white/30 text-primary-foreground' 
            : 'bg-primary/10 hover:bg-primary/20 text-primary'
        }`}
        onClick={togglePlay}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </Button>

      {/* Waveform/Progress */}
      <div className="flex-1 flex flex-col gap-1">
        <Slider
          value={[currentTime]}
          max={audioDuration || duration}
          step={0.1}
          onValueChange={handleSeek}
          className={`cursor-pointer ${isMine ? '[&_[role=slider]]:bg-white [&_[class*=SliderRange]]:bg-white/60' : ''}`}
        />
        
        {/* Time display */}
        <div className={`flex justify-between text-[10px] ${
          isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
        }`}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration || duration)}</span>
        </div>
      </div>
    </div>
  );
}
