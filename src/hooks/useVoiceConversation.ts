import { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationState, VoiceSettings } from '../types';
import { playListeningChime, playReceivedChime, playStopChime } from '../utils/audio';

interface UseVoiceConversationProps {
  voiceSettings: VoiceSettings;
  continuousMode: boolean;
  onSendMessage: (text: string, mode: 'voice') => Promise<void>;
  isAppProcessing: boolean;
}

export function useVoiceConversation({
  voiceSettings,
  continuousMode,
  onSendMessage,
  isAppProcessing,
}: UseVoiceConversationProps) {
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSupported, setIsSupported] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceActivationRequired, setVoiceActivationRequired] = useState(true);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isContinuousActiveRef = useRef(continuousMode);
  const currentTranscriptRef = useRef('');
  const isManuallyStoppedRef = useRef(false);
  const conversationStateRef = useRef<ConversationState>(conversationState);
  const submissionInFlightRef = useRef(false);
  const lastSubmittedTextRef = useRef('');

  // Sync refs with state & props
  useEffect(() => {
    isContinuousActiveRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  // Check speech recognition capability on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hasSpeechRec = Boolean(
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      );
      if (!hasSpeechRec) {
        setIsSupported(false);
      }
    }
  }, []);

  // Load available speech synthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setVoiceReady(voices.length > 0);
      // Deduplicate voices with identical voiceURI, name, and lang
      const seen = new Set<string>();
      const uniqueVoices: SpeechSynthesisVoice[] = [];
      for (const v of voices) {
        const id = `${v.voiceURI || v.name}__${v.lang}`;
        if (!seen.has(id)) {
          seen.add(id);
          uniqueVoices.push(v);
        }
      }
      setAvailableVoices(uniqueVoices);
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Stop speaking and cancel synth
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      currentUtteranceRef.current = null;
    }
  }, []);

  // Browser audio can require a user gesture before speech is allowed.
  const activateVoice = useCallback((): boolean => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setPermissionError('Voice output is not supported by this browser.');
      setVoiceActivationRequired(true);
      return false;
    }
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const unlock = new SpeechSynthesisUtterance('FRIDAY voice activated.');
      unlock.volume = 0.35;
      unlock.onend = () => setVoiceActivationRequired(false);
      unlock.onerror = () => {
        setVoiceActivationRequired(true);
        setPermissionError('Voice activation was blocked. Please try again.');
      };
      synth.speak(unlock);
      setVoiceActivationRequired(false);
      setPermissionError(null);
      return true;
    } catch (error) {
      console.warn('Unable to activate speech synthesis:', error);
      setVoiceActivationRequired(true);
      return false;
    }
  }, []);

  // Speak a text response aloud
  const speakText = useCallback(
    (text: string): Promise<void> => {
      return new Promise((resolve) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          setPermissionError('Voice output is not supported by this browser.');
          setVoiceActivationRequired(true);
          resolve();
          return;
        }

        // Clean text of markdown formatting for cleaner speech
        const cleanText = text
          .replace(/```[\s\S]*?```/g, 'Code block output omitted.')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[*_~#]/g, '')
          .replace(/\n+/g, ' ')
          .trim();

        if (!cleanText) {
          resolve();
          return;
        }

        // Invalidate the current recognition cycle before aborting it so its
        // delayed onend/onresult callbacks cannot affect the speaking turn.
        ++recognitionGenerationRef.current;
        const recognitionToAbort = recognitionRef.current;
        recognitionRef.current = null;
        if (recognitionToAbort) {
          try { recognitionToAbort.abort(); } catch { /* ignore */ }
        }

        if (listeningRestartTimerRef.current) {
          clearTimeout(listeningRestartTimerRef.current);
          listeningRestartTimerRef.current = null;
        }

        stopSpeaking();
        setConversationState('speaking');

        const utterance = new SpeechSynthesisUtterance(cleanText);
        currentUtteranceRef.current = utterance;
        (window as any).__voiceUtterance = utterance;

        // FRIDAY cinematic voice profile: prefer natural British English voices when available.
        // This is an original FRIDAY-inspired profile, not a clone of a specific actor.
        const preferredNames = ['Sonia', 'Hazel', 'Google UK English Female', 'Libby', 'Martha'];
        const preferredVoice =
          (voiceSettings.voiceURI
            ? availableVoices.find((v) => v.voiceURI === voiceSettings.voiceURI)
            : undefined) ||
          availableVoices.find((v) => {
            const name = v.name.toLowerCase();
            const lang = v.lang.toLowerCase();
            return (lang.startsWith('en-gb') || lang.startsWith('en_uk')) &&
              preferredNames.some((preferred) => name.includes(preferred.toLowerCase()));
          }) ||
          availableVoices.find((v) => {
            const lang = v.lang.toLowerCase();
            return lang.startsWith('en-gb') || lang.startsWith('en_uk');
          }) ||
          availableVoices.find((v) => v.lang.toLowerCase().startsWith('en'));

        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.rate = voiceSettings.rate || 0.94;
        utterance.pitch = voiceSettings.pitch || 0.82;

        utterance.onend = () => {
          currentUtteranceRef.current = null;
          (window as any).__voiceUtterance = null;
          resolve();
        };

        utterance.onerror = (err) => {
          console.warn('Speech synthesis error:', err);
          setVoiceActivationRequired(true);
          setPermissionError('Tap “Enable FRIDAY Voice” once to allow voice output.');
          currentUtteranceRef.current = null;
          (window as any).__voiceUtterance = null;
          resolve();
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch (error) {
          console.warn('Speech synthesis could not start:', error);
          setVoiceActivationRequired(true);
          setPermissionError('Tap “Enable FRIDAY Voice” once to allow voice output.');
          currentUtteranceRef.current = null;
          (window as any).__voiceUtterance = null;
          resolve();
        }
      });
    },
    [availableVoices, stopSpeaking, voiceSettings]
  );

  // Initialize and start speech recognition
  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setPermissionError('Speech Recognition is not supported in this browser. Please use Google Chrome or Edge.');
      setIsSupported(false);
      return;
    }

    // Stop speaking if currently speaking
    stopSpeaking();

    // Abort existing instance if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-GB';

      isManuallyStoppedRef.current = false;
      currentTranscriptRef.current = '';
      setTranscript('');
      setInterimTranscript('');
      setConversationState('listening');

      if (voiceSettings.soundEffects) {
        playListeningChime();
      }

      recognition.onstart = () => {
        setPermissionError(null);
        setConversationState('listening');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            final += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        if (final) {
          currentTranscriptRef.current += (currentTranscriptRef.current ? ' ' : '') + final.trim();
          setTranscript(currentTranscriptRef.current);
        }
        setInterimTranscript(interim);

        // Reset silence timer whenever user speaks
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // Detect silence threshold to automatically submit
        const combinedText = (currentTranscriptRef.current + ' ' + interim).trim();
        if (combinedText.length > 1) {
          silenceTimerRef.current = setTimeout(() => {
            const textToSubmit = currentTranscriptRef.current.trim() || interim.trim();
            if (textToSubmit) {
              submitSpokenText(textToSubmit);
            }
          }, voiceSettings.silenceThresholdMs || 1500);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          setPermissionError('Microphone access was denied. Please allow microphone permissions in your browser.');
          setConversationState('idle');
        } else if (event.error === 'no-speech') {
          // No speech detected, keep listening if continuous
        } else {
          console.warn('Speech recognition warning:', event.error);
        }
      };

      recognition.onend = () => {
        // If not manually stopped, not processing, and continuous mode is active, restart
        const currentState = conversationStateRef.current;
        if (
          !isManuallyStoppedRef.current &&
          isContinuousActiveRef.current &&
          currentState !== 'processing' &&
          currentState !== 'speaking'
        ) {
          try {
            recognition.start();
          } catch {
            setConversationState('idle');
          }
        } else if (!isContinuousActiveRef.current) {
          setConversationState('idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setPermissionError(err.message || 'Could not start voice recognition');
      setConversationState('idle');
    }
  }, [stopSpeaking, voiceSettings.soundEffects, voiceSettings.silenceThresholdMs]);

  // Stop listening
  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    ++recognitionGenerationRef.current;
    if (listeningRestartTimerRef.current) {
      clearTimeout(listeningRestartTimerRef.current);
      listeningRestartTimerRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setInterimTranscript('');
    setConversationState('idle');
    if (voiceSettings.soundEffects) {
      playStopChime();
    }
  }, [voiceSettings.soundEffects]);

  // Submit spoken text and coordinate turn-taking
  const submitSpokenText = useCallback(
    async (text: string) => {
      const normalizedText = text.trim().replace(/\s+/g, ' ');
      if (!normalizedText || isAppProcessing || submissionInFlightRef.current) return;
      if (normalizedText === lastSubmittedTextRef.current) return;

      submissionInFlightRef.current = true;
      lastSubmittedTextRef.current = normalizedText;

      // Stop listening while dispatching & waiting for response
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      setConversationState('processing');
      setTranscript('');
      setInterimTranscript('');
      currentTranscriptRef.current = '';

      if (voiceSettings.soundEffects) {
        playReceivedChime();
      }

      try {
        await onSendMessage(normalizedText, 'voice');
      } finally {
        submissionInFlightRef.current = false;
      }
    },
    [isAppProcessing, onSendMessage, voiceSettings.soundEffects]
  );

  // When AI finishes speaking, if continuous mode is on, resume listening automatically!
  const onAiFinishedSpeaking = useCallback(() => {
    if (isContinuousActiveRef.current && !isManuallyStoppedRef.current) {
      // Small pause before opening mic again so the user is ready
      setTimeout(() => {
        startListening();
      }, 400);
    } else {
      setConversationState('idle');
    }
  }, [startListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      stopSpeaking();
    };
  }, [stopSpeaking]);

  // Clear permission error
  const clearPermissionError = useCallback(() => {
    setPermissionError(null);
  }, []);

  return {
    conversationState,
    setConversationState,
    transcript,
    interimTranscript,
    availableVoices,
    isSupported,
    voiceReady,
    voiceActivationRequired,
    activateVoice,
    permissionError,
    clearPermissionError,
    startListening,
    stopListening,
    speakText,
    stopSpeaking,
    onAiFinishedSpeaking,
  };
}
