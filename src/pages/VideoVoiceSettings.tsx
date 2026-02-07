import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Mic, Volume2, Video, RefreshCw, Play, CameraOff, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { cn } from '@/lib/utils';

export default function VideoVoiceSettings() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const {
    cameras,
    microphones,
    speakers,
    selectedCamera,
    selectedMicrophone,
    selectedSpeaker,
    setSelectedCamera,
    setSelectedMicrophone,
    setSelectedSpeaker,
    videoStream,
    audioLevel,
    isVideoActive,
    isAudioActive,
    error,
    startVideoPreview,
    stopVideoPreview,
    startAudioTest,
    stopAudioTest,
    testSpeaker,
    refreshDevices,
  } = useMediaDevices();

  // Default call settings
  const [autoEnableCamera, setAutoEnableCamera] = useState(() => {
    return localStorage.getItem('autoEnableCamera') !== 'false';
  });
  const [autoEnableMic, setAutoEnableMic] = useState(() => {
    return localStorage.getItem('autoEnableMic') !== 'false';
  });

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('autoEnableCamera', String(autoEnableCamera));
  }, [autoEnableCamera]);

  useEffect(() => {
    localStorage.setItem('autoEnableMic', String(autoEnableMic));
  }, [autoEnableMic]);

  // Attach video stream to video element
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoPreview();
      stopAudioTest();
    };
  }, [stopVideoPreview, stopAudioTest]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold">Video và thoại</h1>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshDevices}
          title="Làm mới danh sách thiết bị"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-2xl mx-auto">
          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Camera Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <Camera className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-semibold">Camera</h2>
            </div>

            {/* Video Preview */}
            <div className="relative aspect-video bg-muted rounded-xl overflow-hidden">
              {isVideoActive && videoStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <CameraOff className="w-12 h-12 mb-2" />
                  <p className="text-sm">Camera đang tắt</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Chọn camera" />
                </SelectTrigger>
                <SelectContent>
                  {cameras.length > 0 ? (
                    cameras.map((camera) => (
                      <SelectItem key={camera.deviceId || `camera-${Math.random()}`} value={camera.deviceId || "default-camera"}>
                        {camera.label || "Camera không xác định"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-camera" disabled>
                      Không tìm thấy camera
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              
              <Button
                variant={isVideoActive ? "destructive" : "default"}
                size="icon"
                onClick={isVideoActive ? stopVideoPreview : startVideoPreview}
                title={isVideoActive ? "Tắt camera" : "Bật camera"}
              >
                {isVideoActive ? <CameraOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              </Button>
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* Microphone Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-semibold">Microphone</h2>
            </div>

            <div className="flex items-center gap-3">
              <Select value={selectedMicrophone} onValueChange={setSelectedMicrophone}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Chọn microphone" />
                </SelectTrigger>
                <SelectContent>
                  {microphones.length > 0 ? (
                    microphones.map((mic) => (
                      <SelectItem key={mic.deviceId || `mic-${Math.random()}`} value={mic.deviceId || "default-mic"}>
                        {mic.label || "Microphone không xác định"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-mic" disabled>
                      Không tìm thấy microphone
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              
              <Button
                variant={isAudioActive ? "destructive" : "default"}
                size="icon"
                onClick={isAudioActive ? stopAudioTest : startAudioTest}
                title={isAudioActive ? "Tắt mic" : "Test mic"}
              >
                {isAudioActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>

            {/* Audio Level Meter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Mức âm thanh</span>
                <span className={cn(
                  "font-mono text-xs",
                  isAudioActive ? "text-green-500" : "text-muted-foreground"
                )}>
                  {isAudioActive ? `${Math.round(audioLevel)}%` : "Không hoạt động"}
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-75 rounded-full",
                    audioLevel > 80 ? "bg-red-500" : audioLevel > 50 ? "bg-yellow-500" : "bg-green-500"
                  )}
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              {isAudioActive && (
                <p className="text-xs text-muted-foreground">
                  Nói vào microphone để kiểm tra mức âm thanh
                </p>
              )}
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* Speaker Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <Volume2 className="w-4 h-4 text-white" />
              </div>
              <h2 className="font-semibold">Loa</h2>
            </div>

            <div className="flex items-center gap-3">
              <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Chọn loa" />
                </SelectTrigger>
                <SelectContent>
                  {speakers.length > 0 ? (
                    speakers.map((speaker) => (
                      <SelectItem key={speaker.deviceId || `speaker-${Math.random()}`} value={speaker.deviceId || "default-speaker"}>
                        {speaker.label || "Loa không xác định"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-speaker" disabled>
                      Không tìm thấy loa
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                onClick={testSpeaker}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Test loa
              </Button>
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* Default Settings Section */}
          <section className="space-y-4">
            <h2 className="font-semibold">Cài đặt mặc định</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-camera" className="font-medium">
                    Tự động bật camera khi gọi video
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Camera sẽ tự động bật khi bạn tham gia cuộc gọi video
                  </p>
                </div>
                <Switch
                  id="auto-camera"
                  checked={autoEnableCamera}
                  onCheckedChange={setAutoEnableCamera}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-mic" className="font-medium">
                    Tự động bật mic khi bắt đầu gọi
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Microphone sẽ tự động bật khi bạn tham gia cuộc gọi
                  </p>
                </div>
                <Switch
                  id="auto-mic"
                  checked={autoEnableMic}
                  onCheckedChange={setAutoEnableMic}
                />
              </div>
            </div>
          </section>

          {/* Bottom spacing for mobile */}
          <div className="h-8" />
        </div>
      </ScrollArea>
    </div>
  );
}
