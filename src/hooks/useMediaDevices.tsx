import { useState, useEffect, useCallback, useRef } from 'react';

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface UseMediaDevicesReturn {
  cameras: MediaDevice[];
  microphones: MediaDevice[];
  speakers: MediaDevice[];
  selectedCamera: string;
  selectedMicrophone: string;
  selectedSpeaker: string;
  setSelectedCamera: (deviceId: string) => void;
  setSelectedMicrophone: (deviceId: string) => void;
  setSelectedSpeaker: (deviceId: string) => void;
  videoStream: MediaStream | null;
  audioLevel: number;
  isVideoActive: boolean;
  isAudioActive: boolean;
  error: string | null;
  startVideoPreview: () => Promise<void>;
  stopVideoPreview: () => void;
  startAudioTest: () => Promise<void>;
  stopAudioTest: () => void;
  testSpeaker: () => Promise<void>;
  refreshDevices: () => Promise<void>;
}

export const useMediaDevices = (): UseMediaDevicesReturn => {
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [microphones, setMicrophones] = useState<MediaDevice[]>([]);
  const [speakers, setSpeakers] = useState<MediaDevice[]>([]);
  
  const [selectedCamera, setSelectedCameraState] = useState<string>('');
  const [selectedMicrophone, setSelectedMicrophoneState] = useState<string>('');
  const [selectedSpeaker, setSelectedSpeakerState] = useState<string>('');
  
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Load saved preferences from localStorage
  useEffect(() => {
    const savedCamera = localStorage.getItem('preferredCamera');
    const savedMicrophone = localStorage.getItem('preferredMicrophone');
    const savedSpeaker = localStorage.getItem('preferredSpeaker');
    
    if (savedCamera) setSelectedCameraState(savedCamera);
    if (savedMicrophone) setSelectedMicrophoneState(savedMicrophone);
    if (savedSpeaker) setSelectedSpeakerState(savedSpeaker);
  }, []);

  // Save preferences to localStorage
  const setSelectedCamera = useCallback((deviceId: string) => {
    setSelectedCameraState(deviceId);
    localStorage.setItem('preferredCamera', deviceId);
  }, []);

  const setSelectedMicrophone = useCallback((deviceId: string) => {
    setSelectedMicrophoneState(deviceId);
    localStorage.setItem('preferredMicrophone', deviceId);
  }, []);

  const setSelectedSpeaker = useCallback((deviceId: string) => {
    setSelectedSpeakerState(deviceId);
    localStorage.setItem('preferredSpeaker', deviceId);
  }, []);

  // Enumerate devices
  const refreshDevices = useCallback(async () => {
    try {
      // Request permission first to get proper device labels
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(stream => {
        stream.getTracks().forEach(track => track.stop());
      }).catch(() => {
        // Even if this fails, try to enumerate devices
      });

      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const cameraDevices = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
          kind: d.kind,
        }));
      
      const micDevices = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          kind: d.kind,
        }));
      
      const speakerDevices = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
          kind: d.kind,
        }));

      setCameras(cameraDevices);
      setMicrophones(micDevices);
      setSpeakers(speakerDevices);

      // Set defaults if not already selected
      if (!selectedCamera && cameraDevices.length > 0) {
        const savedCamera = localStorage.getItem('preferredCamera');
        const validCamera = cameraDevices.find(d => d.deviceId === savedCamera);
        setSelectedCameraState(validCamera?.deviceId || cameraDevices[0].deviceId);
      }
      
      if (!selectedMicrophone && micDevices.length > 0) {
        const savedMic = localStorage.getItem('preferredMicrophone');
        const validMic = micDevices.find(d => d.deviceId === savedMic);
        setSelectedMicrophoneState(validMic?.deviceId || micDevices[0].deviceId);
      }
      
      if (!selectedSpeaker && speakerDevices.length > 0) {
        const savedSpeaker = localStorage.getItem('preferredSpeaker');
        const validSpeaker = speakerDevices.find(d => d.deviceId === savedSpeaker);
        setSelectedSpeakerState(validSpeaker?.deviceId || speakerDevices[0].deviceId);
      }

      setError(null);
    } catch (err: any) {
      console.error('Failed to enumerate devices:', err);
      setError('Không thể truy cập thiết bị. Vui lòng cấp quyền truy cập camera/microphone.');
    }
  }, [selectedCamera, selectedMicrophone, selectedSpeaker]);

  // Initial device enumeration
  useEffect(() => {
    refreshDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  // Start video preview
  const startVideoPreview = useCallback(async () => {
    try {
      // Stop existing stream first
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
      });
      
      setVideoStream(stream);
      setIsVideoActive(true);
      setError(null);
    } catch (err: any) {
      console.error('Failed to start video preview:', err);
      setError('Không thể bật camera. Vui lòng kiểm tra quyền truy cập.');
      setIsVideoActive(false);
    }
  }, [selectedCamera, videoStream]);

  // Stop video preview
  const stopVideoPreview = useCallback(() => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    setIsVideoActive(false);
  }, [videoStream]);

  // Start audio test with level meter
  const startAudioTest = useCallback(async () => {
    try {
      // Stop existing audio test first
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicrophone ? { deviceId: { exact: selectedMicrophone } } : true,
      });
      
      audioStreamRef.current = stream;
      
      // Create audio context and analyser
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      // Animation loop to update audio level
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(Math.min(100, (average / 128) * 100));
        }
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      
      updateLevel();
      setIsAudioActive(true);
      setError(null);
    } catch (err: any) {
      console.error('Failed to start audio test:', err);
      setError('Không thể bật microphone. Vui lòng kiểm tra quyền truy cập.');
      setIsAudioActive(false);
    }
  }, [selectedMicrophone]);

  // Stop audio test
  const stopAudioTest = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioLevel(0);
    setIsAudioActive(false);
  }, []);

  // Test speaker by playing a beep sound
  const testSpeaker = useCallback(async () => {
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 440; // A4 note
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
      
      // Set output device if supported
      if (selectedSpeaker && 'setSinkId' in audioContext.destination) {
        // Note: setSinkId is not standard on AudioContext.destination
        // This would need to be done on an HTMLAudioElement for proper speaker selection
      }

      setTimeout(() => {
        audioContext.close();
      }, 1000);
    } catch (err: any) {
      console.error('Failed to test speaker:', err);
      setError('Không thể phát âm thanh test.');
    }
  }, [selectedSpeaker]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideoPreview();
      stopAudioTest();
    };
  }, []);

  // Restart video preview when camera changes
  useEffect(() => {
    if (isVideoActive && selectedCamera) {
      startVideoPreview();
    }
  }, [selectedCamera]);

  // Restart audio test when microphone changes
  useEffect(() => {
    if (isAudioActive && selectedMicrophone) {
      startAudioTest();
    }
  }, [selectedMicrophone]);

  return {
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
  };
};
