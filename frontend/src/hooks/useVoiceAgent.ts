import { useState, useEffect, useRef } from 'react';

interface VoiceAgentProps {
  operatorId: string;
  machineId: string;
  onCommandExecuted?: (action: string, data: any) => void;
}

export function useVoiceAgent({ operatorId, machineId, onCommandExecuted }: VoiceAgentProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [lastFeedback, setLastFeedback] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      playChime(600, 0.1);
    };

    recognition.onresult = async (event: any) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setIsListening(false);
      playChime(800, 0.15);
      await sendVoiceCommand(text);
    };

    recognition.onerror = (err: any) => {
      console.warn('Speech recognition error:', err);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [operatorId, machineId]);

  const playChime = (freq: number, duration: number) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // AudioContext not allowed or unsupported
    }
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 0.95; // Slightly lower, authoritative cabin radio voice
      window.speechSynthesis.speak(utterance);
    }
  };

  const sendVoiceCommand = async (spokenText: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/voice/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: spokenText,
          operator_id: operatorId,
          machine_id: machineId,
        }),
      });

      if (!res.ok) throw new Error('Voice command processing failed');
      const data = await res.json();
      setLastFeedback(data.spoken_feedback);
      speak(data.spoken_feedback);
      if (onCommandExecuted) {
        onCommandExecuted(data.action, data.data);
      }
    } catch (e: any) {
      console.error(e);
      const fallbackMsg = `Received voice: "${spokenText}". Backend offline.`;
      setLastFeedback(fallbackMsg);
      speak(fallbackMsg);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setTranscript('');
      recognitionRef.current.start();
    }
  };

  // Simulate command trigger for testing without microphone
  const triggerManualCommand = async (cmdText: string) => {
    setTranscript(cmdText);
    playChime(750, 0.1);
    await sendVoiceCommand(cmdText);
  };

  return {
    isListening,
    transcript,
    lastFeedback,
    isSupported,
    toggleListening,
    triggerManualCommand,
    speak
  };
}
