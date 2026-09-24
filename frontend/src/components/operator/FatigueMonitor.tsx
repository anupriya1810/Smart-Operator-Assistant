import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Eye,
  AlertTriangle,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Declarations for global MediaPipe objects loaded via CDN
declare global {
  interface Window {
    FaceMesh?: any;
    Camera?: any;
  }
}

export interface FatigueEventData {
  event_id: string;
  alert_id: string;
  operator_id: string;
  machine_id: string;
  eye_closure_duration_sec: number;
  status: string;
}

interface FatigueMonitorProps {
  operatorId: string;
  machineId?: string;
  onFatigueAlert?: (event: any) => void;
  apiBase?: string;
}

// MediaPipe Landmark Indices for Eye Aspect Ratio (EAR)
const LEFT_EYE_INDICES = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE_INDICES = [362, 385, 387, 263, 373, 380];

const EAR_THRESHOLD = 0.21;
const MICROSLEEP_TRIGGER_SEC = 2.0;

function calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function calculateEAR(landmarks: any[], indices: number[]): number {
  if (!landmarks || landmarks.length <= indices[3]) return 0.3;
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];

  const vertical1 = calculateDistance(p2, p6);
  const vertical2 = calculateDistance(p3, p5);
  const horizontal = calculateDistance(p1, p4);

  if (horizontal === 0) return 0.3;
  return (vertical1 + vertical2) / (2.0 * horizontal);
}

export const FatigueMonitor: React.FC<FatigueMonitorProps> = ({
  operatorId,
  machineId = 'EXC001',
  onFatigueAlert,
  apiBase = 'http://localhost:8000',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoadingMesh, setIsLoadingMesh] = useState<boolean>(false);
  const [showVideoPreview, setShowVideoPreview] = useState<boolean>(false);

  const [currentEAR, setCurrentEAR] = useState<number>(0.32);
  const [closureDuration, setClosureDuration] = useState<number>(0.0);
  const [isAlarmActive, setIsAlarmActive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [lastDispatchedEvent, setLastDispatchedEvent] = useState<string | null>(null);

  // Simulation state
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Audio Context Ref for synthesised alarm siren
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sirenIntervalRef = useRef<any>(null);

  // Frame timing refs
  const eyeClosedSinceRef = useRef<number | null>(null);
  const cameraInstanceRef = useRef<any>(null);

  // Initialize Web Audio API Siren Horn
  const startAlarmSound = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      let freqToggle = false;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      oscillatorRef.current = osc;
      gainNodeRef.current = gain;

      sirenIntervalRef.current = setInterval(() => {
        if (!oscillatorRef.current || !audioCtxRef.current) return;
        freqToggle = !freqToggle;
        const targetFreq = freqToggle ? 880 : 587;
        oscillatorRef.current.frequency.setValueAtTime(targetFreq, audioCtxRef.current.currentTime);
      }, 180);
    } catch (e) {
      console.warn('AudioContext error:', e);
    }
  }, [isMuted]);

  const stopAlarmSound = useCallback(() => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      oscillatorRef.current = null;
    }
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      gainNodeRef.current = null;
    }
  }, []);

  // Trigger backend and in-cab alert
  const triggerFatigueAlarm = useCallback(async (duration: number) => {
    setIsAlarmActive(true);
    startAlarmSound();

    try {
      const res = await fetch(`${apiBase}/api/operators/${operatorId}/fatigue-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator_id: operatorId,
          machine_id: machineId,
          eye_closure_duration_sec: Math.max(2.0, Number(duration.toFixed(1))),
          notes: `In-Cab FaceMesh detected eye aspect ratio < ${EAR_THRESHOLD} continuously for ${duration.toFixed(1)}s.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setLastDispatchedEvent(data.alert_id);
        if (onFatigueAlert) onFatigueAlert(data);
      }
    } catch (err) {
      console.error('Failed to dispatch fatigue event:', err);
    }
  }, [apiBase, machineId, operatorId, onFatigueAlert, startAlarmSound]);

  // Acknowledge & silence alarm
  const handleAcknowledgeAlarm = () => {
    stopAlarmSound();
    setIsAlarmActive(false);
    setClosureDuration(0.0);
    eyeClosedSinceRef.current = null;
    setIsSimulating(false);
  };

  // Run Simulation Mode for effortless evaluation
  const handleSimulateEyeClosure = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setClosureDuration(0.0);
    setCurrentEAR(0.08);
    const startTime = Date.now();

    const simTimer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setClosureDuration(elapsed);

      if (elapsed >= MICROSLEEP_TRIGGER_SEC) {
        clearInterval(simTimer);
        triggerFatigueAlarm(elapsed);
      }
    }, 100);
  };

  // Dynamically load MediaPipe CDN Scripts
  const loadMediaPipeScripts = async (): Promise<boolean> => {
    if (window.FaceMesh && window.Camera) return true;

    return new Promise((resolve) => {
      const loadScript = (src: string): Promise<void> => {
        return new Promise((res, rej) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            res();
            return;
          }
          const s = document.createElement('script');
          s.src = src;
          s.crossOrigin = 'anonymous';
          s.onload = () => res();
          s.onerror = (e) => rej(e);
          document.head.appendChild(s);
        });
      };

      setIsLoadingMesh(true);
      Promise.all([
        loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
        loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js'),
      ])
        .then(() => {
          setIsLoadingMesh(false);
          resolve(true);
        })
        .catch((err) => {
          console.warn('MediaPipe CDN load failed, falling back to simulated vision:', err);
          setIsLoadingMesh(false);
          resolve(false);
        });
    });
  };

  // Handle MediaPipe Results
  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      ctx.fillStyle = 'rgba(255, 205, 17, 0.4)';
      for (let i = 0; i < landmarks.length; i += 8) {
        const pt = landmarks[i];
        ctx.beginPath();
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 1.2, 0, 2 * Math.PI);
        ctx.fill();
      }

      const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES);
      const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES);
      const avgEAR = (leftEAR + rightEAR) / 2.0;
      setCurrentEAR(avgEAR);

      const isClosed = avgEAR < EAR_THRESHOLD;
      ctx.strokeStyle = isClosed ? '#EF4444' : '#10B981';
      ctx.lineWidth = 2.0;

      const drawEyeContour = (indices: number[]) => {
        ctx.beginPath();
        for (let i = 0; i < indices.length; i++) {
          const pt = landmarks[indices[i]];
          const x = pt.x * canvas.width;
          const y = pt.y * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      };

      drawEyeContour(LEFT_EYE_INDICES);
      drawEyeContour(RIGHT_EYE_INDICES);

      const now = Date.now();
      if (isClosed) {
        if (!eyeClosedSinceRef.current) {
          eyeClosedSinceRef.current = now;
        }
        const durationSec = (now - eyeClosedSinceRef.current) / 1000.0;
        setClosureDuration(durationSec);

        if (durationSec >= MICROSLEEP_TRIGGER_SEC && !isAlarmActive) {
          triggerFatigueAlarm(durationSec);
        }
      } else {
        eyeClosedSinceRef.current = null;
        if (!isAlarmActive) {
          setClosureDuration(0.0);
        }
      }
    } else {
      setCurrentEAR(0.32);
    }
  }, [isAlarmActive, triggerFatigueAlarm]);

  const startCamera = async () => {
    setCameraError(null);
    const loaded = await loadMediaPipeScripts();

    if (!loaded || !window.FaceMesh) {
      setCameraError('AI Vision Library offline. Simulation mode ready.');
      return;
    }

    try {
      const faceMesh = new window.FaceMesh({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults(onResults);

      if (videoRef.current) {
        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && isCameraActive) {
              await faceMesh.send({ image: videoRef.current });
            }
          },
          width: 320,
          height: 240,
        });

        cameraInstanceRef.current = camera;
        await camera.start();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(err.message || 'Webcam permission denied or device not found.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (cameraInstanceRef.current) {
      try {
        cameraInstanceRef.current.stop();
      } catch (e) {
        // ignore
      }
      cameraInstanceRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
      stopAlarmSound();
    };
  }, [stopAlarmSound]);

  const isClosed = currentEAR < EAR_THRESHOLD;
  const progressPercent = Math.min(100, Math.round((closureDuration / MICROSLEEP_TRIGGER_SEC) * 100));

  // Determine progress bar color
  const progressColor = isAlarmActive
    ? 'bg-red-500'
    : isClosed
      ? 'bg-amber-500'
      : 'bg-[#FFCD11]';

  return (
    <div
      className={`bg-white border rounded-lg p-4 shadow-sm transition-all ${isAlarmActive
          ? 'border-red-300 ring-2 ring-red-100'
          : 'border-gray-200'
        }`}
    >
      {/* Hidden video & canvas refs needed for FaceMesh */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={showVideoPreview && isCameraActive ? 'w-full h-32 rounded object-cover -scale-x-100 mb-2 border border-gray-200' : 'hidden'}
      />
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-gray-700" strokeWidth={2} />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 leading-tight">
              Fatigue &amp; Drowsiness Monitor
            </h3>
            <p className="text-xs text-gray-500">
              In-cab optical blink &amp; EAR tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute Siren' : 'Mute Siren'}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            {isMuted ? <VolumeX className="w-4 h-4" strokeWidth={2} /> : <Volume2 className="w-4 h-4" strokeWidth={2} />}
          </button>

          {isAlarmActive ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
              <AlertOctagon className="w-3.5 h-3.5" strokeWidth={2} /> Microsleep
            </span>
          ) : isClosed ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} /> Eyes Closed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} /> Attentive
            </span>
          )}
        </div>
      </div>

      {/* Small Progress Bar */}
      <div className="mb-2">
        <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
          <span>Continuous Closure</span>
          <span className="font-mono text-gray-700 font-medium">
            {closureDuration.toFixed(1)}s / {MICROSLEEP_TRIGGER_SEC.toFixed(1)}s (EAR {currentEAR.toFixed(2)})
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-100 ${progressColor}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* One-Line Status */}
      <div className="flex items-center justify-between gap-2 text-xs mb-3">
        <span className={isAlarmActive ? 'text-red-700 font-medium' : isClosed ? 'text-amber-700 font-medium' : 'text-gray-600'}>
          {isAlarmActive
            ? 'Alarm active: Prolonged closure detected. Sounding cabin horn.'
            : isClosed
              ? 'Drowsiness detected: Eye aspect ratio below safety threshold.'
              : isCameraActive
                ? 'Webcam FaceMesh active · Attentive baseline confirmed.'
                : 'Standby mode · FaceMesh optical sensor ready.'}
        </span>
      </div>

      {/* Alarm action or controls */}
      {isAlarmActive ? (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-red-100">
          <span className="text-xs text-red-600 font-medium flex items-center gap-1">
            <ShieldAlert className="w-4 h-4 text-red-600" strokeWidth={2} /> Critical Warning
          </span>
          <button
            onClick={handleAcknowledgeAlarm}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md shadow-sm transition-colors"
          >
            Acknowledge &amp; Silence
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={isCameraActive ? stopCamera : startCamera}
              disabled={isLoadingMesh}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              {isCameraActive ? (
                <>
                  <VideoOff className="w-3.5 h-3.5 text-gray-500" strokeWidth={2} /> Stop Cam
                </>
              ) : (
                <>
                  <Video className="w-3.5 h-3.5 text-gray-500" strokeWidth={2} /> {isLoadingMesh ? 'Loading...' : 'Start Cam'}
                </>
              )}
            </button>

            {isCameraActive && (
              <button
                onClick={() => setShowVideoPreview(!showVideoPreview)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {showVideoPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showVideoPreview ? 'Hide View' : 'Preview'}
              </button>
            )}
          </div>

          <button
            onClick={handleSimulateEyeClosure}
            disabled={isSimulating}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FFCD11]" strokeWidth={2} />
            {isSimulating ? 'Simulating...' : 'Simulate 2s'}
          </button>
        </div>
      )}

      {cameraError && (
        <p className="mt-2 text-xs text-amber-600">{cameraError}</p>
      )}
      {lastDispatchedEvent && (
        <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" strokeWidth={2} /> Incident {lastDispatchedEvent} registered.
        </p>
      )}
    </div>
  );
};

